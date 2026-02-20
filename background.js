// Импортируем модули Google Drive и Sheets (через importScripts для service worker)
try {
  importScripts('secrets.js', 'api-client.js', 'google-drive-auth.js', 'google-drive-api.js', 'google-sheets-api.js');
  console.log("✅ Google Drive, Sheets и API модули загружены");
} catch (error) {
  console.error("❌ Ошибка загрузки модулей:", error);
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log("Feedback Checker установлен (v2.0.0 - интеграция с Google Drive)");

  if (details.reason === 'install') {
    console.log("📋 Первая установка - откройте popup для авторизации в Google Drive");
  } else if (details.reason === 'update') {
    console.log("🔄 Расширение обновлено");
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log("🔄 Service Worker запущен");
});

// Отслеживание API запросов для точного определения загрузки данных
const complaintsUrlPart = "/reviews-ext-seller-portal/api/v1/feedbacks/complaints";

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.url.includes(complaintsUrlPart) && details.method === "GET") {
      sendToTab(details.tabId, "complaintsLoaded", {
        url: details.url,
        status: details.statusCode,
        id: details.requestId,
      });
    }
  },
  { urls: ["*://*.wildberries.ru/*"] }
);

function sendToTab(tabId, type, data) {
  if (!tabId || tabId < 0) return;

  chrome.tabs.sendMessage(tabId, {
    type,
    data,
  }).catch(() => {
    // Игнорируем ошибки если content script еще не загружен
  });
}

// Счетчик скриншотов
let screenshotStats = { success: 0, failed: 0 };

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Новый метод - сохранение готового изображения от html2canvas
  if (msg.action === "saveScreenshot") {
    handleSaveScreenshot(msg)
      .then((result) => {
        screenshotStats.success++;
        sendResponse({ success: true, ...result });
      })
      .catch((err) => {
        screenshotStats.failed++;
        console.error("❌ Ошибка сохранения:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Асинхронный ответ
  }

  // Статистика скриншотов
  if (msg.action === "getScreenshotStats") {
    sendResponse(screenshotStats);
    return false;
  }

  if (msg.action === "resetScreenshotStats") {
    screenshotStats = { success: 0, failed: 0 };
    sendResponse({ success: true });
    return false;
  }

  // Проверка авторизации Google Drive
  if (msg.action === "checkDriveAuth") {
    console.log("📥 [BACKGROUND] Получен запрос checkDriveAuth");
    googleDriveAuth.isAuthorized()
      .then((isAuth) => {
        console.log("📤 [BACKGROUND] Отправляем ответ checkDriveAuth:", { authorized: isAuth });
        sendResponse({ authorized: isAuth });
      })
      .catch((err) => {
        console.error("❌ [BACKGROUND] Ошибка checkDriveAuth:", err);
        sendResponse({ authorized: false });
      });
    return true;
  }

  // Авторизация Google Drive
  if (msg.action === "authorizeDrive") {
    console.log("📥 [BACKGROUND] Получен запрос authorizeDrive");
    googleDriveAuth.authorize()
      .then(() => {
        console.log("📤 [BACKGROUND] Отправляем ответ authorizeDrive: success");
        sendResponse({ success: true });
      })
      .catch((err) => {
        console.error("❌ [BACKGROUND] Ошибка authorizeDrive:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // Создание скриншота через chrome.tabs.captureVisibleTab
  if (msg.action === "captureScreenshot") {
    console.log("📥 [BACKGROUND] Получен запрос captureScreenshot");

    // Получаем ID текущей вкладки
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error("❌ [BACKGROUND] Ошибка captureVisibleTab:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      if (dataUrl) {
        console.log("✅ [BACKGROUND] Скриншот создан, размер:", dataUrl.length);
        sendResponse({ success: true, dataUrl: dataUrl });
      } else {
        console.error("❌ [BACKGROUND] Скриншот не создан");
        sendResponse({ success: false, error: "Failed to capture screenshot" });
      }
    });

    return true; // Асинхронный ответ
  }

  // Получение email пользователя
  if (msg.action === "getUserEmail") {
    console.log("📥 [BACKGROUND] Получен запрос getUserEmail");
    (async () => {
      try {
        const token = await googleDriveAuth.getToken();
        // Получаем информацию о пользователе через Google API
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const userInfo = await response.json();
          console.log("📤 [BACKGROUND] Отправляем email:", userInfo.email);
          sendResponse({ email: userInfo.email });
        } else {
          console.error("❌ [BACKGROUND] Ошибка получения userInfo");
          sendResponse({ email: null });
        }
      } catch (error) {
        console.error("❌ [BACKGROUND] Ошибка getUserEmail:", error);
        sendResponse({ email: null });
      }
    })();
    return true;
  }

  // Выход из аккаунта
  if (msg.action === "signOut") {
    console.log("📥 [BACKGROUND] Получен запрос signOut");
    googleDriveAuth.signOut()
      .then(() => {
        console.log("📤 [BACKGROUND] Выход выполнен успешно");
        sendResponse({ success: true });
      })
      .catch((err) => {
        console.error("❌ [BACKGROUND] Ошибка signOut:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // ============================================
  // R5 API: Получение магазинов и артикулов
  // ============================================

  // Получение списка магазинов из API
  if (msg.action === "getStoresFromAPI") {
    console.log("📥 [BACKGROUND] Получен запрос getStoresFromAPI");

    (async () => {
      try {
        const stores = await r5ApiClient.getStores();
        console.log("📤 [BACKGROUND] Отправляем список магазинов:", stores.length);
        sendResponse({ success: true, stores });
      } catch (error) {
        console.error("❌ [BACKGROUND] Ошибка getStoresFromAPI:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // Получение активных артикулов магазина из API
  if (msg.action === "getActiveProducts") {
    console.log("📥 [BACKGROUND] Получен запрос getActiveProducts для:", msg.storeId);
    const { storeId } = msg;

    if (!storeId) {
      sendResponse({ success: false, error: "Не указан ID магазина" });
      return false;
    }

    (async () => {
      try {
        const data = await r5ApiClient.getActiveProducts(storeId);
        console.log("📤 [BACKGROUND] Отправляем артикулы:", data.articuls.length);
        sendResponse({ success: true, products: data.products, articuls: data.articuls });
      } catch (error) {
        console.error("❌ [BACKGROUND] Ошибка getActiveProducts:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // Получение маппинга папок Drive из Google Sheets
  if (msg.action === "getFolderMappings") {
    console.log("📥 [BACKGROUND] Получен запрос getFolderMappings");
    const { spreadsheetId } = msg;

    if (!spreadsheetId) {
      sendResponse({ success: false, error: "Не указан ID таблицы" });
      return false;
    }

    (async () => {
      try {
        const token = await googleDriveAuth.getToken();
        const mappings = await googleSheetsAPI.getFolderMappings(token, spreadsheetId);
        console.log("📤 [BACKGROUND] Отправляем маппинг папок:", mappings.length);
        sendResponse({ success: true, mappings });
      } catch (error) {
        console.error("❌ [BACKGROUND] Ошибка getFolderMappings:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // Отправка статусов жалоб в API
  if (msg.action === "sendComplaintStatuses") {
    console.log("📥 [BACKGROUND] Получен запрос sendComplaintStatuses");
    const { storeId, results } = msg;

    if (!storeId || !results || results.length === 0) {
      sendResponse({ success: false, error: "Не указаны storeId или results" });
      return false;
    }

    console.log(`📤 [BACKGROUND] Отправляем ${results.length} статусов для магазина ${storeId}`);

    (async () => {
      try {
        const data = await r5ApiClient.postComplaintStatuses(storeId, results);
        console.log("📤 [BACKGROUND] Статусы отправлены:", data);
        sendResponse({ success: true, data });
      } catch (error) {
        console.error("❌ [BACKGROUND] Ошибка sendComplaintStatuses:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // Получение списка кабинетов из Google Sheets (legacy, для совместимости)
  if (msg.action === "getCabinets") {
    console.log("📥 [BACKGROUND] Получен запрос getCabinets");
    const { spreadsheetId } = msg;

    if (!spreadsheetId) {
      sendResponse({ success: false, error: "Не указан ID таблицы" });
      return false;
    }

    (async () => {
      try {
        const token = await googleDriveAuth.getToken();
        const cabinets = await googleSheetsAPI.getCabinets(token, spreadsheetId);
        console.log("📤 [BACKGROUND] Отправляем список кабинетов:", cabinets.length);
        sendResponse({ success: true, cabinets: cabinets });
      } catch (error) {
        console.error("❌ [BACKGROUND] Ошибка getCabinets:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Асинхронный ответ
  }

  // Получение списка имен файлов из Complaints (для дедупликации)
  if (msg.action === "getComplaintsFilenames") {
    console.log("📥 [BACKGROUND] Получен запрос getComplaintsFilenames");
    const { reportSheetId } = msg;

    if (!reportSheetId) {
      sendResponse({ success: false, error: "Не указан ID таблицы отчетов" });
      return false;
    }

    (async () => {
      try {
        const token = await googleDriveAuth.getToken();

        // Читаем колонку J (Имя файла) из листа Complaints
        console.log(`📊 [BACKGROUND] Читаем колонку J (Имя файла) из Complaints (reportSheetId: ${reportSheetId})`);
        const rows = await googleSheetsAPI.getSheetData(token, reportSheetId, "'Жалобы V 2.0'!J:J");

        // Извлекаем имена файлов (пропускаем заголовок)
        const filenames = rows.length > 1
          ? rows.slice(1).map(row => row[0]).filter(Boolean)
          : [];

        console.log(`📤 [BACKGROUND] Отправляем ${filenames.length} имен файлов для дедупликации`);
        sendResponse({ success: true, filenames: filenames });
      } catch (error) {
        console.error("❌ [BACKGROUND] Ошибка getComplaintsFilenames:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Асинхронный ответ
  }
});

// ============================================
// СОХРАНЕНИЕ СКРИНШОТА НА GOOGLE DRIVE
// ============================================
async function handleSaveScreenshot(msg) {
  const {
    imageData,
    articul,
    feedbackDate,
    feedbackRating,
    complaintSubmitDate,
    cabinetFolderId,
    screenshotMode,
    cabinetName,
    complaintId,
    reportSheetId
  } = msg;

  if (!imageData) {
    throw new Error("Нет данных изображения");
  }

  if (!cabinetFolderId) {
    throw new Error("Не указан ID папки кабинета");
  }

  // Парсим дату из feedbackDate
  const formattedDate = parseDate(feedbackDate);
  const fileName = `${articul}_${formattedDate}.png`;

  console.log(`📁 Загрузка скриншота: ${fileName} в папку ${cabinetFolderId}`);
  console.log(`📸 Режим сохранения: ${screenshotMode || 'byArticul'}`);

  // Получаем токен авторизации
  let token;
  try {
    token = await googleDriveAuth.getToken();
  } catch (authError) {
    console.error("❌ Ошибка авторизации Google Drive:", authError);
    throw new Error("Не удалось авторизоваться в Google Drive. Откройте popup и войдите в аккаунт.");
  }

  // Шаг 1: Создаем/получаем папку "скриншоты: жалобы WB" внутри папки Screenshots
  const complaintsSubfolderName = "скриншоты: жалобы WB";
  let complaintsFolderId;

  try {
    complaintsFolderId = await googleDriveAPI.getOrCreateFolder(token, complaintsSubfolderName, cabinetFolderId);
    console.log(`📁 Папка "${complaintsSubfolderName}": ${complaintsFolderId}`);
  } catch (folderError) {
    console.error(`❌ [BACKGROUND] Ошибка создания папки "${complaintsSubfolderName}":`, folderError);

    // Если ошибка связана с папкой в корзине или несуществующей папкой
    if (folderError.message.includes('корзине') || folderError.message.includes('не существует')) {
      console.log(`🗑️ [BACKGROUND] Очищаем кеш для кабинета ${cabinetFolderId}...`);
      await googleDriveAPI.clearCabinetCache(cabinetFolderId);

      // Повторная попытка после очистки кеша
      console.log(`🔄 [BACKGROUND] Повторная попытка создания папки...`);
      complaintsFolderId = await googleDriveAPI.getOrCreateFolder(token, complaintsSubfolderName, cabinetFolderId);
      console.log(`✅ [BACKGROUND] Папка создана после очистки кеша: ${complaintsFolderId}`);
    } else {
      // Другая ошибка - пробрасываем дальше
      throw folderError;
    }
  }

  // Шаг 2: Определяем целевую папку в зависимости от режима
  let targetFolderId;

  if (screenshotMode === 'allInOne') {
    // Режим "все в одну папку" - сохраняем напрямую в "скриншоты: жалобы WB"
    targetFolderId = complaintsFolderId;
    console.log(`📦 Режим "Все в одну папку": сохраняем в "${complaintsSubfolderName}"`);
  } else {
    // Режим "по артикулам" (по умолчанию) - создаем папку для артикула
    try {
      targetFolderId = await googleDriveAPI.getOrCreateFolder(token, articul, complaintsFolderId);
      console.log(`📂 Режим "По папкам": папка артикула ${articul}: ${targetFolderId}`);
    } catch (articulFolderError) {
      console.error(`❌ [BACKGROUND] Ошибка создания папки артикула "${articul}":`, articulFolderError);

      // Если ошибка связана с папкой в корзине
      if (articulFolderError.message.includes('корзине') || articulFolderError.message.includes('не существует')) {
        console.log(`🗑️ [BACKGROUND] Очищаем кеш папки артикула...`);
        await googleDriveAPI.removeCachedFolderId(`${complaintsFolderId}/${articul}`);

        // Повторная попытка
        console.log(`🔄 [BACKGROUND] Повторная попытка создания папки артикула...`);
        targetFolderId = await googleDriveAPI.getOrCreateFolder(token, articul, complaintsFolderId);
        console.log(`✅ [BACKGROUND] Папка артикула создана после очистки кеша: ${targetFolderId}`);
      } else {
        throw articulFolderError;
      }
    }
  }

  // Проверяем существование файла
  const fileAlreadyExists = await googleDriveAPI.fileExists(token, targetFolderId, fileName);

  let fileId = null;

  if (fileAlreadyExists) {
    console.log(`⏭️ Скриншот ${fileName} уже существует на Drive, пропускаем загрузку`);
    // Используем "existing" как placeholder (файл существует, запись в таблицы все равно будет)
    fileId = "existing";
    console.log(`📎 Файл существует, будем записывать в таблицы с placeholder ID`);
  } else {
    // Загружаем на Drive с повторными попытками
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Попытка загрузки ${attempt}/${maxRetries}...`);

        fileId = await googleDriveAPI.uploadFile(
          token,
          fileName,
          imageData,
          targetFolderId
        );

        console.log(`✅ Скриншот успешно загружен на Drive! File ID: ${fileId}`);
        break; // Выходим из цикла попыток при успехе
      } catch (error) {
        lastError = error;
        console.error(`❌ Попытка ${attempt}/${maxRetries} не удалась:`, error.message);

        // Если это ошибка авторизации, обновляем токен
        if (error.message.includes("401") || error.message.includes("403")) {
          console.log("🔑 Обновляем токен авторизации...");
          try {
            token = await googleDriveAuth.getToken(); // ✅ Автоматически обновит через refresh или запросит авторизацию
          } catch (reAuthError) {
            console.error("❌ Не удалось обновить токен:", reAuthError);
          }
        }

        // Ждем перед следующей попыткой
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Экспоненциальная задержка
        }
      }
    }

    // Если все попытки не удались
    if (!fileId) {
      throw new Error(`Не удалось загрузить скриншот после ${maxRetries} попыток: ${lastError?.message}`);
    }
  }

  // ========================================
  // ЗАПИСЬ В ТАБЛИЦЫ (независимо от того, новый файл или существующий)
  // ========================================
  let complaintsStatus = 'skipped'; // Статус записи: 'written', 'duplicate', 'error', 'skipped'
  let complaintsError = null;

  if (reportSheetId && fileId) {
    try {
      // ========================================
      // ЗАПИСЬ В ЛИСТ Complaints
      // ========================================
      // НОВАЯ Структура Complaints:
      // A: Дата проверки, B: Кабинет, C: Артикул, D: ID отзыва, E: Рейтинг отзыва,
      // F: Дата отзыва, G: Дата подачи жалобы, H: Статус, I: Скриншот, J: Имя файла, K: Ссылка Drive, L: Путь

      // Проверяем существование записи перед добавлением (предотвращение дублей)
      const exists = await googleSheetsAPI.checkComplaintExists(
        token,
        reportSheetId,
        'Жалобы V 2.0',
        {
          cabinet: cabinetName || '',
          articul: articul,
          feedbackDate: feedbackDate || '',
          fileName: fileName
        }
      );

      if (exists) {
        console.log(`⏭️ [BACKGROUND] Запись уже существует в Complaints: ${fileName}`);
        complaintsStatus = 'duplicate';
      } else {
        // Запись уникальна, добавляем в таблицу
        const checkDate = new Date().toLocaleDateString('ru-RU'); // Текущая дата проверки
        const driveLink = `https://drive.google.com/file/d/${fileId}/view`; // Ссылка на файл

        const complaintsValues = [
          checkDate,                    // A: Дата проверки
          cabinetName || '',            // B: Кабинет
          articul,                      // C: Артикул
          '',                           // D: ID отзыва (пока неизвестен, оставляем пустым)
          feedbackRating || '',         // E: Рейтинг отзыва
          feedbackDate || '',           // F: Дата отзыва
          complaintSubmitDate || '',    // G: Дата подачи жалобы (DD.MM формат)
          'Одобрена',                   // H: Статус
          'Да',                         // I: Скриншот (да/нет)
          fileName,                     // J: Имя файла
          driveLink                     // K: Ссылка Drive
        ];

        await googleSheetsAPI.appendRow(token, reportSheetId, 'Жалобы V 2.0', complaintsValues);
        console.log("✅ [BACKGROUND] Данные жалобы записаны в Complaints");
        complaintsStatus = 'written';
      }
    } catch (err) {
      console.error("❌ [BACKGROUND] Ошибка записи в Complaints:", err);
      console.error("❌ [BACKGROUND] Stack:", err.stack);
      console.error("❌ [BACKGROUND] Детали: reportSheetId =", reportSheetId, ", fileName =", fileName, ", fileId =", fileId);
      complaintsStatus = 'error';
      complaintsError = err.message;
    }
  } else {
    console.warn("⚠️ [BACKGROUND] Пропуск записи в Complaints: reportSheetId =", reportSheetId, ", fileId =", fileId);
  }

  return { skipped: fileAlreadyExists, fileId, fileName, complaintsStatus, complaintsError };
}

// ============================================
// ПАРСИНГ ДАТЫ
// ============================================
function parseDate(lastElement) {
  console.log("🔍 parseDate получил:", lastElement);

  if (!lastElement || typeof lastElement !== "string") {
    console.warn("⚠️ parseDate: пустое значение или не строка");
    return "unknown_date";
  }

  const raw = lastElement.replace(/\u00A0/g, " ").trim().toLowerCase();
  console.log("🔍 parseDate после обработки:", raw);

  const months = {
    янв: "01", января: "01", январь: "01",
    фев: "02", февраля: "02", февраль: "02",
    мар: "03", марта: "03", март: "03",
    апр: "04", апреля: "04", апрель: "04",
    май: "05", мая: "05",
    июн: "06", июня: "06", июнь: "06",
    июл: "07", июля: "07", июль: "07",
    авг: "08", августа: "08", август: "08",
    сен: "09", сентября: "09", сент: "09", сентябрь: "09",
    окт: "10", октября: "10", октябрь: "10",
    ноя: "11", ноября: "11", ноябрь: "11",
    дек: "12", декабря: "12", декабрь: "12",
  };

  const re = /(\d{1,2})\s+([а-яё]+)\.?\s+(\d{4})\s*(?:г\.?)?\s*(?:в\s*)?(\d{1,2}):(\d{2})/i;
  const match = raw.match(re);

  if (match) {
    let [, day, monthName, year, hour, minute] = match;
    day = day.padStart(2, "0");
    hour = hour.padStart(2, "0");
    minute = minute.padStart(2, "0");

    let month = months[monthName];
    if (!month) {
      for (const key in months) {
        if (monthName.startsWith(key)) {
          month = months[key];
          break;
        }
      }
    }

    if (month) {
      const shortYear = String(year).slice(-2);
      const result = `${day}.${month}.${shortYear}_${hour}-${minute}`;
      console.log("✅ parseDate успешно:", result);
      return result;
    }
  }

  console.warn("❌ Не удалось распознать дату:", raw);
  return "unknown_date";
}
