// ============================================
// ОБЕРТКА ДЛЯ ПРЕДОТВРАЩЕНИЯ КОНФЛИКТОВ ПРИ ПОВТОРНОЙ ИНЖЕКЦИИ
// ============================================
(function() {
  'use strict';

  // Проверяем, не был ли скрипт уже загружен
  if (window.__feedbackCheckerLoaded) {
    console.log('⚠️ Content script уже загружен, пропускаем повторную инициализацию');
    return;
  }
  window.__feedbackCheckerLoaded = true;

// ============================================
// КОНФИГУРАЦИЯ - CSS селекторы WB
// Последнее обновление: 13.01.2025 (после изменения UI WB)
// Используются стабильные селекторы (data-*, name, class prefixes)
// ============================================
const SELECTORS = {
  // Поле поиска - использует атрибут name (стабильный)
  searchInput: 'input[name="feedback-search-name-input"]',
  // Таблица с жалобами - использует data-testid (стабильный)
  tableBody: '[data-testid="Base-table-body"]',
  // Текст с датой в строке таблицы - использует data-name (может требовать уточнения контекста)
  dateText: '[data-name="Text"]',
  // Статус жалобы (Одобрена/Отклонена) - использует стабильный модификатор класса
  statusChip: '.Chips__text--textAlign-center__TGTXpsZKjK',
  // Боковая панель с деталями - использует префикс класса (стабильный)
  sidebar: '[class*="Sidebar-panel__"]',
  // Информация о товаре в сайдбаре - класс не изменился
  productInfo: '.Product-info__additional-info__i6wYBjrEBV',
  // Информация о фидбеке - использует префикс класса (стабильный)
  feedbackInfo: '[class*="Feedback-info__"]',
  // Пагинация - использует префикс класса (стабильный)
  pagination: '[class*="Pagination-buttons__"]',
  paginationButton: '[class*="Pagination-icon-button__"]',
};

// ============================================
// МАППИНГ СТАТУСОВ WB → API
// ============================================
const WB_STATUS_MAP = {
  'Одобрена': 'Жалоба одобрена',
  'Отклонена': 'Жалоба отклонена',
  'Проверяем жалобу': 'Проверяем жалобу',
  'Пересмотрена': 'Жалоба пересмотрена',
};

// Словарь месяцев для парсинга дат WB
const MONTHS_MAP = {
  'янв': '01', 'января': '01', 'январь': '01',
  'фев': '02', 'февраля': '02', 'февраль': '02', 'февр': '02',
  'мар': '03', 'марта': '03', 'март': '03',
  'апр': '04', 'апреля': '04', 'апрель': '04',
  'май': '05', 'мая': '05',
  'июн': '06', 'июня': '06', 'июнь': '06',
  'июл': '07', 'июля': '07', 'июль': '07',
  'авг': '08', 'августа': '08', 'август': '08',
  'сен': '09', 'сентября': '09', 'сент': '09', 'сентябрь': '09',
  'окт': '10', 'октября': '10', 'октябрь': '10',
  'ноя': '11', 'ноября': '11', 'ноябрь': '11',
  'дек': '12', 'декабря': '12', 'декабрь': '12',
};

/**
 * Парсит дату WB "18 февр. 2026 г. в 21:45" → "2026-02-18T21:45"
 */
function parseReviewDateToISO(dateStr) {
  if (!dateStr) return null;

  const raw = dateStr.replace(/\u00A0/g, ' ').trim().toLowerCase();
  const re = /(\d{1,2})\s+([а-яё]+)\.?\s+(\d{4})\s*(?:г\.?)?\s*(?:в\s*)?(\d{1,2}):(\d{2})/i;
  const match = raw.match(re);

  if (!match) return null;

  let [, day, monthName, year, hour, minute] = match;
  day = day.padStart(2, '0');
  hour = hour.padStart(2, '0');

  let month = MONTHS_MAP[monthName];
  if (!month) {
    for (const key in MONTHS_MAP) {
      if (monthName.startsWith(key)) {
        month = MONTHS_MAP[key];
        break;
      }
    }
  }

  if (!month) return null;
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Формирует reviewKey: "{nmId}_{rating}_{YYYY-MM-DDTHH:mm}"
 */
function buildReviewKey(nmId, rating, isoDate) {
  return `${nmId}_${rating}_${isoDate}`;
}

/**
 * Извлекает рейтинг (1-5) из строки таблицы по количеству активных звёзд
 */
function parseRatingFromRow(rowElement) {
  // Стратегия 1: Feedback-info-cell
  const feedbackCell = rowElement.querySelector('[class*="Feedback-info-cell"]');
  if (feedbackCell) {
    const activeStars = feedbackCell.querySelectorAll('[class*="Rating--active"]');
    if (activeStars.length > 0) return activeStars.length;
  }

  // Стратегия 2: children[4] (fallback)
  if (rowElement.children[4]) {
    const activeStars = rowElement.children[4].querySelectorAll('[class*="Rating--active"]');
    if (activeStars.length > 0) return activeStars.length;
  }

  return null;
}

/**
 * Извлекает дату отзыва из строки таблицы (Feedback-info-cell)
 * Возвращает строку вида "18 февр. 2026 г. в 21:45"
 */
function getReviewDateFromRow(rowElement) {
  const datePattern = /(\d{1,2}\s+(?:янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)[а-я]*\.?\s+\d{4}\s*г\.?\s*в\s*\d{1,2}:\d{2})/i;

  // Стратегия 1: Feedback-info-cell
  const feedbackCell = rowElement.querySelector('[class*="Feedback-info-cell"]');
  if (feedbackCell) {
    const spans = feedbackCell.querySelectorAll('span[data-name="Text"]');
    for (const span of spans) {
      const match = span.innerText?.match(datePattern);
      if (match) return match[1];
    }
    // Fallback: все span'ы
    const allSpans = feedbackCell.querySelectorAll('span');
    for (const span of allSpans) {
      const match = span.innerText?.match(datePattern);
      if (match) return match[1];
    }
  }

  // Стратегия 2: children[4]
  if (rowElement.children[4]) {
    const spans = rowElement.children[4].querySelectorAll('span');
    for (const span of spans) {
      const match = span.innerText?.match(datePattern);
      if (match) return match[1];
    }
  }

  return null;
}

// Задержки в миллисекундах
const DELAYS = {
  afterSearch: 3000,      // После ввода в поиск (увеличено для стабильной загрузки)
  beforeClick: 800,       // Перед кликом на элемент (увеличено после скролла)
  afterSidebarOpen: 2000, // После открытия сайдбара (увеличено для загрузки изображений)
  afterEscape: 1000,      // После закрытия сайдбара (увеличено для полного закрытия)
  afterPagination: 2000,  // После перехода на след. страницу (увеличено для обновления DOM)
  sidebarTimeout: 5000,   // Таймаут ожидания сайдбара (увеличено для медленного интернета)
};

// ============================================
// СОСТОЯНИЕ
// ============================================
let state = {
  startDate: null,
  endDate: null,
  year: null,
  dateRangeArray: [],
  articuls: [],
  cabinetName: null,
  cabinetFolderId: null,
  cabinetId: null,
  reportSheetId: null,
  screenshotMode: 'byArticul', // Режим сохранения: 'byArticul' или 'allInOne'
  stats: {},
  isRunning: false,
  // Счетчики для отчета
  totalComplaintsFound: 0,
  screenshotsSaved: 0,
  screenshotsSkipped: 0,
  lastError: null,
  screenshotDedup: null, // Система дедупликации скриншотов
};

// Сброс состояния
function resetState() {
  state = {
    startDate: null,
    endDate: null,
    year: null,
    dateRangeArray: [],
    articuls: [],
    cabinetName: null,
    cabinetFolderId: null,
    cabinetId: null,
    reportSheetId: null,
    screenshotMode: 'byArticul',
    stats: {},
    isRunning: false,
    totalComplaintsFound: 0,
    screenshotsSaved: 0,
    screenshotsSkipped: 0,
    lastError: null,
    screenshotDedup: null,
  };
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "setDateRange") {
    state.startDate = message.start;
    state.endDate = message.end;
    state.articuls = message.articuls.filter(Boolean); // Фильтруем пустые
    state.year = message.year || new Date().getFullYear(); // Используем переданный год или текущий
    state.cabinetName = message.cabinetName || "Unnamed_Cabinet"; // Название кабинета
    state.cabinetFolderId = message.cabinetFolderId; // ID папки кабинета на Drive
    state.cabinetId = message.cabinetId || ''; // ID кабинета из таблицы
    state.reportSheetId = message.reportSheetId || null; // ID таблицы отчетов
    state.screenshotMode = message.screenshotMode || 'byArticul'; // Режим сохранения скриншотов

    console.log("📦 Полученные артикулы:", state.articuls);
    console.log("📅 Год:", state.year);
    console.log("🏢 Кабинет:", state.cabinetName);
    console.log("📁 ID папки кабинета:", state.cabinetFolderId);
    console.log("📊 ID таблицы отчетов:", state.reportSheetId);
    console.log("📸 Режим скриншотов:", state.screenshotMode);

    state.dateRangeArray = [];
    const [sd, sm] = state.startDate.split(".").map(Number);
    const [ed, em] = state.endDate.split(".").map(Number);
    const start = new Date(state.year, sm - 1, sd);
    const end = new Date(state.year, em - 1, ed);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      state.dateRangeArray.push(`${day}.${month}`);
    }

    console.log("📅 Массив дат для обработки:", state.dateRangeArray);

    // ПОКАЗЫВАЕМ МОДАЛЬНОЕ ОКНО после получения данных
    showConfirmModal();
  }

  if (message.action === "stop") {
    state.isRunning = false;
    console.log("⏹️ Получена команда остановки");
  }
});

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ============================================
// СКРИНШОТЫ через Chrome Tabs API (обход CSP)
// ============================================

// ============================================
// СКРИНШОТЫ: Используем постоянный overlay
// ============================================

async function takeScreenshot(element = document.body, complaintInfo = {}) {
  try {
    console.log("📸 Создаем скриншот через Chrome Tabs API...");

    // Постоянный overlay уже показывает информацию о жалобе через updateOverlayComplaint()
    // Не нужно создавать временный overlay - используем существующий!

    // Ждем рендеринга обновленного overlay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Прокручиваем элемент в видимую область
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Ждем завершения прокрутки и рендеринга
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log("📤 Запрашиваем скриншот у background script...");

    // Запрашиваем скриншот через background.js
    const response = await chrome.runtime.sendMessage({
      action: "captureScreenshot"
    });

    if (response && response.success && response.dataUrl) {
      console.log("✅ Скриншот получен, размер:", response.dataUrl.length);
      return response.dataUrl;
    } else {
      console.error("❌ Не удалось получить скриншот:", response?.error || "Unknown error");
      return null;
    }

  } catch (err) {
    console.error("❌ Ошибка создания скриншота:", err);
    return null;
  }
}

function waitFor(selector, timeout = 5000, interval = 150) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start > timeout)
        return reject(new Error("waitFor timeout: " + selector));
      setTimeout(check, interval);
    })();
  });
}

// Ожидание стабилизации таблицы после загрузки данных
async function waitForTableStability(timeout = 3000) {
  let lastChildCount = 0;
  let stableCount = 0;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const parent = document.querySelector(SELECTORS.tableBody);
    const currentCount = parent?.children.length || 0;

    if (currentCount === lastChildCount && currentCount > 0) {
      stableCount++;
      if (stableCount >= 3) {
        console.log(`✅ Таблица стабильна: ${currentCount} элементов`);
        return true; // 3 проверки подряд - стабильно
      }
    } else {
      stableCount = 0;
    }

    lastChildCount = currentCount;
    await delay(200);
  }
  console.warn("⚠️ Таймаут ожидания стабилизации таблицы");
  return true;
}

// Ожидание полной загрузки всех изображений в контейнере
async function waitForImages(container, timeout = 3000) {
  if (!container) return;

  const images = container.querySelectorAll('img');
  if (images.length === 0) return;

  const imagePromises = [...images].map(img => {
    // Если изображение уже загружено
    if (img.complete && img.naturalHeight !== 0) {
      return Promise.resolve();
    }

    // Ждем загрузки или ошибки (с таймаутом)
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(), timeout);

      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  });

  await Promise.all(imagePromises);
}

/**
 * Умное определение года для даты подачи жалобы
 *
 * Логика:
 * - Если месяц жалобы > текущего месяца → прошлый год
 * - Если месяц жалобы ≤ текущего месяца → текущий год
 * - Никогда не возвращаем год раньше начала проекта (сентябрь 2025)
 *
 * Примеры (текущая дата = январь 2026):
 * - inferYearForComplaintDate(31, 12) → 2025 (декабрь > январь)
 * - inferYearForComplaintDate(5, 1) → 2026 (январь ≤ январь)
 * - inferYearForComplaintDate(15, 9) → 2025 (сентябрь > январь)
 *
 * @param {number} day - День (1-31)
 * @param {number} month - Месяц (1-12)
 * @returns {number} - Полный год (2025, 2026, etc.)
 */
function inferYearForComplaintDate(day, month) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // JavaScript месяцы 0-11, конвертируем в 1-12

  // Проект начался в сентябре 2025
  const PROJECT_START_YEAR = 2025;
  const PROJECT_START_MONTH = 9;

  console.log(`📅 [INFER YEAR] Определяем год для ${day}.${month} (сейчас: ${currentMonth}.${currentYear})`);

  // Правило 1: Если месяц жалобы БОЛЬШЕ текущего месяца → это был прошлый год
  // Пример: Сейчас январь 2026, жалоба от декабря → это декабрь 2025
  if (month > currentMonth) {
    const inferredYear = currentYear - 1;
    console.log(`  → Месяц ${month} > текущий ${currentMonth}, год = ${inferredYear} (прошлый год)`);

    // Защита: не возвращаем год раньше начала проекта
    if (inferredYear < PROJECT_START_YEAR) {
      console.warn(`  ⚠️ Вычисленный год ${inferredYear} раньше старта проекта (${PROJECT_START_YEAR}), используем ${PROJECT_START_YEAR}`);
      return PROJECT_START_YEAR;
    }

    return inferredYear;
  }

  // Правило 2: Если месяц жалобы МЕНЬШЕ ИЛИ РАВЕН текущему месяцу → это текущий год
  // Пример: Сейчас январь 2026, жалоба от января → это январь 2026
  else {
    console.log(`  → Месяц ${month} ≤ текущий ${currentMonth}, год = ${currentYear} (текущий год)`);
    return currentYear;
  }
}

/**
 * Валидация даты подачи жалобы
 *
 * Проверки:
 * 1. Дата не из будущего (не позже сегодня)
 * 2. Дата не раньше старта проекта (01.09.2025)
 * 3. Валидная дата (существует в календаре)
 *
 * @param {number} day - День (1-31)
 * @param {number} month - Месяц (1-12)
 * @param {number} year - Полный год (2025, 2026, etc.)
 * @returns {Object} { isValid: boolean, error: string|null }
 */
function validateComplaintDate(day, month, year) {
  console.log(`✅ [VALIDATE] Проверяем дату: ${day}.${month}.${year}`);

  // Проверка 1: Валидная дата (существует в календаре)
  const complaintDate = new Date(year, month - 1, day); // month-1 т.к. JS месяцы 0-11

  // Проверяем что дата не "переполнилась" (например 32.01 → 01.02)
  if (
    complaintDate.getDate() !== day ||
    complaintDate.getMonth() !== month - 1 ||
    complaintDate.getFullYear() !== year
  ) {
    const error = `Невалидная дата: ${day}.${month}.${year} (не существует в календаре)`;
    console.error(`  ❌ ${error}`);
    return { isValid: false, error };
  }

  // Проверка 2: Дата не из будущего
  const now = new Date();
  now.setHours(23, 59, 59, 999); // Устанавливаем конец сегодняшнего дня для сравнения

  if (complaintDate > now) {
    const error = `Дата жалобы ${day}.${month}.${year} из БУДУЩЕГО! (сегодня: ${now.toLocaleDateString('ru-RU')})`;
    console.error(`  ❌ ${error}`);
    console.error(`     Возможно ошибка ввода или неверное определение года`);
    return { isValid: false, error };
  }

  // Проверка 3: Дата не раньше начала проекта
  const projectStart = new Date(2025, 8, 1); // 01.09.2025 (месяц 8 = сентябрь в JS)

  if (complaintDate < projectStart) {
    const error = `Дата жалобы ${day}.${month}.${year} раньше старта проекта (01.09.2025)`;
    console.error(`  ❌ ${error}`);
    return { isValid: false, error };
  }

  console.log(`  ✅ Дата валидна`);
  return { isValid: true, error: null };
}

/**
 * Исправляет типичные ошибки в датах при ручном вводе
 *
 * Примеры:
 * - "0.00.0000" → "00.00.0000"
 * - "00.00.00" → "00.00.2000" (предупреждение)
 * - "Жалоба от 5.1" → "Жалоба от 05.01"
 *
 * @param {string} str - Исходный текст
 * @returns {string} - Исправленный текст
 */
function sanitizeComplaintDateInput(str) {
  if (!str) return str;

  let sanitized = str;

  // Исправление 1: "0.00.0000" → "00.00.0000"
  sanitized = sanitized.replace(/\b0\.(\d{2})\.(\d{4})\b/g, '00.$1.$2');

  // Исправление 2: "00.0.0000" → "00.00.0000"
  sanitized = sanitized.replace(/\b(\d{2})\.0\.(\d{4})\b/g, '$1.00.$2');

  // Исправление 3: "00.00.00" → "00.00.2000" (предупреждение)
  sanitized = sanitized.replace(/\b(\d{2})\.(\d{2})\.(\d{2})\b/g, (match, day, month, year) => {
    const fullYear = 2000 + parseInt(year);
    console.warn(`⚠️ [SANITIZE] Исправлена дата: "${match}" → "${day}.${month}.${fullYear}"`);
    return `${day}.${month}.${fullYear}`;
  });

  // Исправление 4: Добавляем ведущие нули к одиночным цифрам
  // "Жалоба от 5.1" → "Жалоба от 05.01"
  sanitized = sanitized.replace(/Жалоба\s+от:?\s*(\d{1})\.(\d{1,2})/gi, (match, day, month) => {
    const paddedDay = day.padStart(2, '0');
    const paddedMonth = month.padStart(2, '0');
    if (paddedDay !== day || paddedMonth !== month) {
      console.log(`🔧 [SANITIZE] Добавлены ведущие нули: "${match}" → "Жалоба от ${paddedDay}.${paddedMonth}"`);
    }
    return `Жалоба от ${paddedDay}.${paddedMonth}`;
  });

  if (sanitized !== str) {
    console.log(`🔧 [SANITIZE] Входные данные исправлены`);
    console.log(`   До:    "${str}"`);
    console.log(`   После: "${sanitized}"`);
  }

  return sanitized;
}

/**
 * Извлекает дату подачи жалобы из текста
 *
 * Приоритет 1: Ищет дату после "Жалоба от" (с автоопределением года)
 * Приоритет 2: Ищет первое вхождение любой даты из диапазона
 *
 * Поддерживаемые форматы:
 * - Без года: 09.01, 9.01, 9/01, 09/01 → автоматически определяет год
 * - С годом: 03.12.24, 03.12.2024, 9/01/25, 9.01.25 → использует указанный год
 * - С двоеточием или без: "Жалоба от: 09.01" или "Жалоба от 09.01"
 *
 * @param {string} str - Текст для парсинга
 * @returns {string|null} - Дата в формате "DD.MM.YYYY" или null
 */
function extractComplaintSubmitDate(str) {
  if (!str) return null;

  // Сначала исправляем типичные ошибки
  str = sanitizeComplaintDateInput(str);

  // ПРИОРИТЕТ 1: Ищем дату после фразы "Жалоба от"
  const complaintPattern = /Жалоба\s+от:?\s*(\d{1,2})[\.\/](\d{1,2})(?:[\.\/](\d{2,4}))?/i;
  const complaintMatch = str.match(complaintPattern);

  if (complaintMatch) {
    const day = parseInt(complaintMatch[1]);
    const month = parseInt(complaintMatch[2]);
    const yearStr = complaintMatch[3]; // Может быть undefined

    let fullYear;

    // Случай 1: Год указан явно
    if (yearStr) {
      fullYear = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
      console.log(`📅 Дата подачи из "Жалоба от": ${day}.${month}.${fullYear} (год указан явно)`);
    }
    // Случай 2: Год НЕ указан - используем умное определение
    else {
      fullYear = inferYearForComplaintDate(day, month);
      console.log(`📅 Дата подачи из "Жалоба от": ${day}.${month}.${fullYear} (год автоматически определен)`);
    }

    // Валидация даты
    const validation = validateComplaintDate(day, month, fullYear);

    if (!validation.isValid) {
      console.error(`❌ Валидация провалилась: ${validation.error}`);

      // Fallback: возвращаем дату без года (старое поведение)
      console.warn(`⚠️ Fallback: возвращаем ${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')} без года`);
      return `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}`;
    }

    // Возвращаем дату в формате DD.MM.YYYY
    const formattedDate = `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${fullYear}`;
    console.log(`✅ Итоговая дата подачи: ${formattedDate}`);

    return formattedDate;
  }

  // ПРИОРИТЕТ 2: Ищем первое вхождение даты из диапазона dateRangeArray
  if (state.dateRangeArray && state.dateRangeArray.length > 0) {
    let earliestDate = null;
    let earliestPosition = Infinity;

    for (const date of state.dateRangeArray) {
      const position = str.indexOf(date);
      if (position !== -1 && position < earliestPosition) {
        earliestPosition = position;
        earliestDate = date;
      }
    }

    if (earliestDate) {
      console.log(`📅 Найдена дата из диапазона: ${earliestDate}`);

      // Парсим дату из диапазона (формат: DD.MM)
      const [day, month] = earliestDate.split('.').map(Number);
      const fullYear = inferYearForComplaintDate(day, month);

      const formattedDate = `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${fullYear}`;
      console.log(`✅ Дата с автоопределением года: ${formattedDate}`);

      return formattedDate;
    }
  }

  console.warn(`⚠️ Дата подачи жалобы не найдена в тексте: "${str.substring(0, 200)}..."`);
  return null;
}

// Устаревшая функция - оставлена для обратной совместимости
function containsDateFromArray(str) {
  return extractComplaintSubmitDate(str);
}

// Ожидание загрузки данных жалоб через API
function waitForComplaintsLoaded() {
  return new Promise((resolve) => {
    const handler = (msg) => {
      if (msg.type === "complaintsLoaded") {
        chrome.runtime.onMessage.removeListener(handler);
        resolve(msg.data);
      }
    };

    chrome.runtime.onMessage.addListener(handler);

    // Таймаут на случай если API запрос не придет
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      resolve(null);
    }, 5000);
  });
}

// ============================================
// UI: Постоянный overlay для статистики
// ============================================
let permanentOverlay = null;
let checkStartTime = null;

// Создание постоянного overlay с дизайном в стиле R5
function createPermanentOverlay() {
  permanentOverlay = document.createElement('div');
  permanentOverlay.id = 'rating5-permanent-overlay';

  checkStartTime = new Date();

  permanentOverlay.innerHTML = `
    <style>
      @keyframes slideIn {
        from { transform: translateX(-100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      #rating5-permanent-overlay {
        position: fixed;
        top: 20px;
        left: 20px;
        width: 380px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: white;
        overflow: hidden;
        animation: slideIn 0.3s ease-out;
      }
      #rating5-permanent-overlay .info-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      #rating5-permanent-overlay .info-row:last-child {
        border-bottom: none;
      }
      #rating5-permanent-overlay .label {
        font-size: 12px;
        opacity: 0.8;
        font-weight: 500;
      }
      #rating5-permanent-overlay .value {
        font-size: 13px;
        font-weight: 600;
        text-align: right;
      }
      #rating5-permanent-overlay .status-badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(10px);
      }
      #rating5-permanent-overlay .status-running {
        background: #4caf50;
        color: white;
      }
      #rating5-permanent-overlay .status-checking {
        background: #2196F3;
        color: white;
      }
      #rating5-permanent-overlay #stop-button {
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: 10px;
        background: rgba(244, 67, 54, 0.9);
        color: white;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        margin-top: 12px;
      }
      #rating5-permanent-overlay #stop-button:hover {
        background: #d32f2f;
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      }
    </style>

    <!-- Заголовок с логотипом -->
    <div style="
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(10px);
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    ">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="
          width: 40px;
          height: 40px;
          background: white;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: bold;
          color: #667eea;
        ">R5</div>
        <div>
          <div style="font-size: 16px; font-weight: 700; letter-spacing: 0.5px;">РЕЙТИНГ 5</div>
          <div style="font-size: 11px; opacity: 0.9;">Система отчетности</div>
        </div>
      </div>
      <div id="overlay-status" style="
        background: rgba(255, 255, 255, 0.2);
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 600;
      ">Проверка...</div>
    </div>

    <!-- Основная информация -->
    <div id="overlay-content" style="padding: 20px;">
      <!-- Динамическое содержимое -->
    </div>

    <!-- Футер с кнопкой остановки -->
    <div style="
      background: rgba(0, 0, 0, 0.2);
      padding: 12px 20px;
    ">
      <button id="stop-button">⏹ Остановить проверку</button>
    </div>
  `;

  document.body.appendChild(permanentOverlay);

  // Обработчик кнопки остановки
  document.getElementById("stop-button").addEventListener("click", () => {
    state.isRunning = false;
    document.getElementById("overlay-status").textContent = "Остановлено";
    document.getElementById("overlay-status").style.background = "#ff9800";
    document.getElementById("stop-button").disabled = true;
    document.getElementById("stop-button").textContent = "Останавливается...";
  });

  // Начальный контент - статистика проверки
  updateOverlayProgress(state.articuls[0], 1, state.articuls.length);
}

// Обновление overlay - режим "проверка артикулов" (МОНИТОРИНГ)
function updateOverlayProgress(currentArticul, articulIndex, totalArticuls) {
  const content = document.getElementById("overlay-content");
  const statusEl = document.getElementById("overlay-status");
  const footer = permanentOverlay?.querySelector('[style*="background: rgba(0, 0, 0, 0.2)"]');

  if (!content) return;

  // Показываем кнопку "Остановить" в режиме мониторинга
  if (footer) {
    footer.style.display = "block";
  }

  const elapsed = getElapsedTime();
  const progress = totalArticuls > 0 ? Math.round((articulIndex / totalArticuls) * 100) : 0;

  // Вычисляем текущий батч
  const BATCH_SIZE = 100;
  const currentBatch = Math.ceil(articulIndex / BATCH_SIZE);
  const totalBatches = Math.ceil(totalArticuls / BATCH_SIZE);

  content.innerHTML = `
    <div class="info-row">
      <span class="label">Кабинет</span>
      <span class="value" style="font-size: 11px;">${state.cabinetName}</span>
    </div>

    <div class="info-row">
      <span class="label">Прогресс</span>
      <span class="value">${articulIndex} / ${totalArticuls} (${progress}%)</span>
    </div>

    <div class="info-row">
      <span class="label">Батч</span>
      <span class="value">${currentBatch} из ${totalBatches}</span>
    </div>

    <div class="info-row">
      <span class="label">Текущий</span>
      <span class="value">${currentArticul}</span>
    </div>

    <div class="info-row">
      <span class="label">✅ Одобрено</span>
      <span class="value">${state.totalComplaintsFound}</span>
    </div>

    <div class="info-row">
      <span class="label">💾 Сохранено</span>
      <span class="value">${state.screenshotsSaved}</span>
    </div>

    <div class="info-row">
      <span class="label">⏭️ Пропущено</span>
      <span class="value">${state.screenshotsSkipped}</span>
    </div>

    ${state.screenshotsSkipped > 0 ? `
    <div class="info-row" style="background: rgba(76, 175, 80, 0.1); margin: 4px -8px; padding: 8px;">
      <span class="label" style="color: #4caf50;">🚀 Ускорение</span>
      <span class="value" style="color: #4caf50;">в ${((state.totalComplaintsFound) / (state.totalComplaintsFound - state.screenshotsSkipped)).toFixed(1)} раза</span>
    </div>
    ` : ''}

    <div class="info-row">
      <span class="label">⏱️ Время</span>
      <span class="value">${elapsed}</span>
    </div>
  `;

  // Обновляем статус в header
  if (statusEl) {
    statusEl.textContent = "▶ Проверка";
    statusEl.style.background = "rgba(33, 150, 243, 0.8)";
  }

  console.log(`📊 Прогресс: ${articulIndex}/${totalArticuls} (батч ${currentBatch}/${totalBatches}) | ${currentArticul}`);
}

// Обновление overlay - режим "найдена жалоба" (для скриншота)
function updateOverlayComplaint(complaintInfo) {
  const content = document.getElementById("overlay-content");
  const statusEl = document.getElementById("overlay-status");
  const footer = permanentOverlay?.querySelector('[style*="background: rgba(0, 0, 0, 0.2)"]');

  if (!content) return;

  // Убираем текст из header (делаем пустым)
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.style.background = "transparent";
  }

  // Скрываем кнопку "Остановить проверку" в footer
  if (footer) {
    footer.style.display = "none";
  }

  // Формируем рейтинг звездами
  const stars = complaintInfo.feedbackRating
    ? '⭐'.repeat(complaintInfo.feedbackRating)
    : 'Не указан';

  content.innerHTML = `
    <div class="info-row">
      <span class="label">Статус</span>
      <span class="value">
        <span class="status-badge status-running">✅ Одобрена</span>
      </span>
    </div>

    <div class="info-row">
      <span class="label">Артикул WB</span>
      <span class="value">${complaintInfo.articul}</span>
    </div>

    <div class="info-row">
      <span class="label">Кабинет</span>
      <span class="value" style="font-size: 11px;">${complaintInfo.cabinetName}</span>
    </div>

    <div class="info-row">
      <span class="label">Дата подачи жалобы</span>
      <span class="value">${complaintInfo.complaintSubmitDate || 'Не указана'}</span>
    </div>

    <div class="info-row">
      <span class="label">Рейтинг отзыва</span>
      <span class="value">${stars}</span>
    </div>
  `;
}

// Получить время работы
function getElapsedTime() {
  if (!checkStartTime) return "00:00";

  const now = new Date();
  const diff = now - checkStartTime;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Удаление overlay
function removePermanentOverlay() {
  if (permanentOverlay) {
    permanentOverlay.remove();
    permanentOverlay = null;
    checkStartTime = null;
  }
}

// Обратная совместимость со старым кодом
function createProgressUI() {
  createPermanentOverlay();
}

function updateProgress(text) {
  console.log("📊 " + text);
}

function removeProgressUI() {
  removePermanentOverlay();
}

// Показать модальное окно подтверждения запуска
function showConfirmModal() {
  console.log("📋 Показываем модальное окно подтверждения");

  const modal = document.createElement("div");
  modal.innerHTML = `
    <div id="fb-modal" style="
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center;
      z-index: 999999;">
      <div style="
        background: white;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        max-width: 300px;">
        <h3 style="margin-top: 0;">Feedback Checker</h3>
        <p style="color: #666;">Обработка отзывов за выбранный период</p>
        <p style="font-size: 12px; color: #999;">
          Артикулов: <strong id="fb-art-count">${state.articuls.length}</strong><br>
          Дат в диапазоне: <strong id="fb-date-count">${state.dateRangeArray.length}</strong>
        </p>
        <button id="runCheck" style="
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          background: #4caf50;
          color: white;
          cursor: pointer;
          font-size: 14px;
          margin-right: 8px;">Запустить</button>
        <button id="cancelCheck" style="
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          background: #9e9e9e;
          color: white;
          cursor: pointer;
          font-size: 14px;">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("runCheck").addEventListener("click", async () => {
    modal.remove();
    createProgressUI();

    await processAllArticuls();

    removeProgressUI();
    showStats();
  });

  document.getElementById("cancelCheck").addEventListener("click", () => {
    modal.remove();
  });
}

async function processAllArticuls() {
  const inputItem = document.querySelector(SELECTORS.searchInput);
  if (!inputItem) {
    alert("Поле поиска не найдено! Возможно, изменились селекторы WB.");
    return;
  }

  state.isRunning = true;

  const BATCH_SIZE = 100; // Размер батча
  const BATCH_PAUSE = 5000; // Пауза между батчами (5 секунд)

  const totalArticuls = state.articuls.length;
  const batchCount = Math.ceil(totalArticuls / BATCH_SIZE);

  console.log(`📦 Всего артикулов: ${totalArticuls}, батчей: ${batchCount}`);

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
    if (!state.isRunning) {
      console.log("⏹️ Обработка остановлена пользователем");
      break;
    }

    const batchStart = batchIndex * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalArticuls);
    const currentBatch = state.articuls.slice(batchStart, batchEnd);

    console.log(`📦 Батч ${batchIndex + 1}/${batchCount}: артикулы ${batchStart + 1}-${batchEnd}`);

    for (let i = 0; i < currentBatch.length; i++) {
      const art = currentBatch[i];
      const globalIndex = batchStart + i;

      // Проверяем флаг остановки
      if (!state.isRunning) {
        console.log("⏹️ Обработка остановлена пользователем");
        break;
      }

      console.log(`🔍 Обрабатываем артикул ${globalIndex + 1}/${totalArticuls}: ${art}`);

      // Обновляем overlay с прогрессом
      updateOverlayProgress(art, globalIndex + 1, totalArticuls);

      // Инициализируем статистику для каждой даты в диапазоне
      if (!state.stats[art]) {
        state.stats[art] = {};
      }
      for (const date of state.dateRangeArray) {
        state.stats[art][date] = { total: 0, approved: 0 };
      }

      inputItem.value = art;
      inputItem.dispatchEvent(new Event("input", { bubbles: true }));
      inputItem.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

      await delay(DELAYS.afterSearch);
      await steppingByElements(art);
    }

    // Пауза между батчами (не нужна после последнего батча)
    if (batchIndex < batchCount - 1 && state.isRunning) {
      console.log(`⏸️ Пауза ${BATCH_PAUSE / 1000} сек перед следующим батчем...`);

      // Показываем в overlay что идет пауза
      const statusEl = document.getElementById("overlay-status");
      if (statusEl) {
        const oldText = statusEl.textContent;
        statusEl.textContent = `⏸️ Пауза (${BATCH_PAUSE / 1000}с)`;
        statusEl.style.background = "#ff9800";

        await delay(BATCH_PAUSE);

        statusEl.textContent = oldText;
        statusEl.style.background = "rgba(33, 150, 243, 0.8)";
      } else {
        await delay(BATCH_PAUSE);
      }
    }
  }

  state.isRunning = false;
  console.log("✅ Обработка всех артикулов завершена");
}

async function steppingByElements(art) {
  let parent = document.querySelector(SELECTORS.tableBody);
  if (!parent) {
    console.warn("Элемент таблицы не найден для артикула:", art);
    return;
  }

  let pageNum = 1;
  const statusResults = []; // Сбор статусов жалоб для отправки в API

  while (state.isRunning) {
    parent = document.querySelector(SELECTORS.tableBody);
    if (!parent) break;

    const children = Array.from(parent.children);
    updateProgress(`Артикул ${art} | Страница ${pageNum} | Записей: ${children.length}`);

    for (let child of children) {
      // Проверяем флаг остановки
      if (!state.isRunning) break;

      // ============================================
      // СБОР СТАТУСА ЖАЛОБЫ (для ВСЕХ строк, до проверки даты)
      // ============================================
      try {
        const statusText = child.querySelector(SELECTORS.statusChip)?.innerText?.trim();
        const apiStatus = statusText ? WB_STATUS_MAP[statusText] : null;

        if (apiStatus) {
          const rating = parseRatingFromRow(child);
          const reviewDateStr = getReviewDateFromRow(child);

          if (rating && reviewDateStr) {
            const isoDate = parseReviewDateToISO(reviewDateStr);
            if (isoDate) {
              const reviewKey = buildReviewKey(art, rating, isoDate);
              statusResults.push({ reviewKey, status: apiStatus });
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ Ошибка сбора статуса строки:', e);
      }
      // ============================================

      const textEl = child.children[2]?.querySelector(SELECTORS.dateText);
      if (!textEl) continue;
      const text = textEl.innerText || "";

      const dateInText = containsDateFromArray(text);
      if (!dateInText) continue;

      // Инициализируем объект даты, если он не существует (защита от ошибки)
      if (!state.stats[art][dateInText]) {
        state.stats[art][dateInText] = { total: 0, approved: 0 };
      }

      // Увеличиваем счетчик по конкретной дате
      state.stats[art][dateInText].total++;

      const approved = child
        .querySelector(SELECTORS.statusChip)
        ?.innerText.includes("Одобрена");
      if (!approved) continue;

      state.stats[art][dateInText].approved++;

      // Подсчитываем общее количество одобренных для прогресса
      const totalApproved = Object.values(state.stats[art]).reduce((sum, d) => sum + d.approved, 0);
      updateProgress(`Артикул ${art} | Найдено одобренных: ${totalApproved}`);

      // ============================================
      // ПРОВЕРКА ДЕДУПЛИКАЦИИ: Пропускаем если скриншот уже существует
      // ============================================
      // Важно: Проверяем ДО открытия сайдбара, чтобы сэкономить ~4 секунды.
      // Парсим дату отзыва прямо из последней колонки таблицы ("Отзыв").
      if (window.DeduplicationCache && state.cabinetId) {
        try {
          // Загружаем кэш имён файлов из chrome.storage.local (один раз на строку)
          const cachedFilenames = await DeduplicationCache.load(state.cabinetId);

          if (cachedFilenames && cachedFilenames.size > 0) {
            // ============================================
            // ПАРСИНГ ДАТЫ ИЗ ТАБЛИЦЫ
            // ============================================
            let feedbackDateFromTable = null;
            const datePattern = /(\d{1,2}\s+(?:янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)[а-я]*\.?\s+\d{4}\s*г\.?\s*в\s*\d{1,2}:\d{2})/i;

            // Стратегия 1: Поиск по классу "Feedback-info-cell" (последняя колонка)
            const feedbackCell = child.querySelector('[class*="Feedback-info-cell"]');
            if (feedbackCell) {
              const spans = feedbackCell.querySelectorAll('span');
              for (const span of spans) {
                const match = span.innerText?.match(datePattern);
                if (match) {
                  feedbackDateFromTable = match[1];
                  break;
                }
              }
            }

            // Стратегия 2 (Fallback): Поиск в 5-й колонке (children[4])
            if (!feedbackDateFromTable && child.children[4]) {
              const spans = child.children[4].querySelectorAll('span');
              for (const span of spans) {
                const match = span.innerText?.match(datePattern);
                if (match) {
                  feedbackDateFromTable = match[1];
                  break;
                }
              }
            }

            // Стратегия 3 (Fallback): Поиск во всей строке
            if (!feedbackDateFromTable) {
              const allText = child.innerText || '';
              const match = allText.match(datePattern);
              if (match) {
                feedbackDateFromTable = match[1];
              }
            }

            // ============================================
            // ПРОВЕРКА ДУБЛИКАТА
            // ============================================
            if (feedbackDateFromTable) {
              console.log(`[Deduplication] 📅 Дата из таблицы: ${feedbackDateFromTable}`);

              const isDuplicate = DeduplicationCache.checkDuplicate(
                cachedFilenames,
                art,
                feedbackDateFromTable
              );

              if (isDuplicate) {
                console.log(`[Deduplication] ⏭️ Пропускаем дубликат (без сайдбара): ${art}, ${feedbackDateFromTable}`);
                state.screenshotsSkipped++;
                state.totalComplaintsFound++; // Считаем как найденную жалобу
                continue; // ПРОПУСКАЕМ открытие сайдбара - ЭКОНОМИЯ ~4 сек!
              } else {
                console.log(`[Deduplication] ✅ Новый скриншот: ${art}, ${feedbackDateFromTable}`);
              }
            } else {
              console.warn(`[Deduplication] ⚠️ Fallback: не удалось извлечь дату из таблицы, открываем сайдбар`);
              // Продолжаем обычный flow - откроется сайдбар
            }
          }
        } catch (error) {
          console.error('[Deduplication] ❌ Ошибка проверки дубликатов:', error);
          // Продолжаем обычный flow при ошибке
        }
      }
      // ============================================

      child.scrollIntoView({ behavior: "smooth", block: "center" });
      await delay(DELAYS.beforeClick);
      child.click();

      try {
        await waitFor(SELECTORS.sidebar, DELAYS.sidebarTimeout);
      } catch {
        console.warn("⚠️ Сайдбар не открылся, пропускаем элемент");
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        await delay(DELAYS.beforeClick);
        continue;
      }

      // Извлекаем данные из сайдбара для плашки
      const sidebar = document.querySelector(SELECTORS.sidebar);

      // СНАЧАЛА ждем полной загрузки сайдбара!
      await waitForImages(sidebar, 3000);
      await delay(DELAYS.afterSidebarOpen);

      let feedbackDate = null;
      let complaintId = null;
      let productName = null;
      let feedbackRating = null;

      try {
        // Стратегия 1: Ищем через основной селектор feedbackInfo
        let feedbackInfo = sidebar?.querySelector(SELECTORS.feedbackInfo);

        // Стратегия 2: Если не найден, ищем все элементы с классом Feedback-info
        if (!feedbackInfo) {
          const allFeedbackElements = sidebar?.querySelectorAll('[class*="Feedback-info"]');
          console.log("🔍 Найдено элементов Feedback-info:", allFeedbackElements?.length || 0);

          // Берем ПОСЛЕДНИЙ элемент (обычно это дополненный отзыв с датой)
          if (allFeedbackElements && allFeedbackElements.length > 0) {
            feedbackInfo = allFeedbackElements[allFeedbackElements.length - 1];
            console.log("✅ Используем последний Feedback-info элемент");
          }
        }

        if (feedbackInfo) {
          console.log("📋 Содержимое feedbackInfo:", feedbackInfo.innerText);

          // Ищем дату в формате "XX месяц YYYY г. в HH:MM" во всём тексте
          const fullText = feedbackInfo.innerText || '';
          const datePattern = /(\d{1,2}\s+(?:янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)[а-я]*\.?\s+\d{4}\s*г\.?\s*в\s*\d{1,2}:\d{2})/i;
          const dateMatch = fullText.match(datePattern);

          if (dateMatch) {
            feedbackDate = dateMatch[1];
            console.log("📅 Дата извлечена через regex:", feedbackDate);
          } else {
            // Fallback: lastElementChild
            feedbackDate = feedbackInfo.lastElementChild?.innerText;
            console.log("📅 Дата извлечена через lastElementChild:", feedbackDate);
          }
        } else {
          console.warn("⚠️ feedbackInfo элемент не найден в сайдбаре");
        }

        // Пытаемся извлечь ID жалобы из URL или из сайдбара
        const productInfo = sidebar?.querySelector(SELECTORS.productInfo);
        if (productInfo) {
          // Извлекаем артикул и ID из текста (формат: "Арт: 01329713547 • Арт WB: 149325538")
          const productText = productInfo.innerText || '';
          const artMatch = productText.match(/Арт:\s*(\d+)/);
          if (artMatch) {
            complaintId = artMatch[1];
          }
          console.log("🔢 ID жалобы:", complaintId);
        }

        // Извлекаем рейтинг отзыва (количество звезд)
        const ratingContainer = sidebar?.querySelector('[class*="Rating__"]');
        if (ratingContainer) {
          // Считаем активные звезды (класс Rating--active)
          const activeStars = ratingContainer.querySelectorAll('[class*="Rating--active"]');
          feedbackRating = activeStars.length;
          console.log("⭐ Рейтинг отзыва:", feedbackRating, "из 5");
        } else {
          console.warn("⚠️ Рейтинг не найден в сайдбаре");
        }
      } catch (e) {
        console.warn("❌ Ошибка при чтении сайдбара:", e);
      }

      // Ждем загрузку изображений в сайдбаре
      await waitForImages(sidebar, 3000);
      await delay(DELAYS.afterSidebarOpen);

      // Логируем текущее значение feedbackDate для отладки
      console.log("🔍 feedbackDate перед fallback:", feedbackDate, "| тип:", typeof feedbackDate);

      // Если не удалось извлечь дату из сайдбара, попробуем из текста строки
      if (!feedbackDate || feedbackDate === null || feedbackDate === undefined) {
        console.warn("⚠️ feedbackDate пуст, пробуем извлечь из текста строки таблицы");
        console.log("📋 Текст из строки таблицы:", text);

        // Пытаемся найти дату в тексте строки таблицы
        const datePattern = /(\d{1,2}\s+(?:янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)[а-я]*\.?\s+\d{4}\s*г\.?\s*в\s*\d{1,2}:\d{2})/i;
        const dateMatch = text.match(datePattern);
        if (dateMatch) {
          feedbackDate = dateMatch[1];
          console.log("✅ Дата извлечена из строки таблицы:", feedbackDate);
        } else {
          console.warn("❌ Не удалось извлечь дату из строки таблицы");
          console.log("📋 Полный текст text для анализа:", text);
        }
      } else {
        console.log("✅ feedbackDate уже установлен из сайдбара:", feedbackDate);
      }

      // Финальная проверка перед отправкой
      console.log("🎯 Финальное значение feedbackDate:", feedbackDate);

      // Подготавливаем информацию для плашки
      const complaintInfo = {
        status: 'Одобрена',
        feedbackDate: feedbackDate || text,        // Дата отзыва (полная дата с временем)
        complaintSubmitDate: dateInText,           // Дата подачи жалобы (формат DD.MM)
        feedbackRating: feedbackRating,            // Рейтинг отзыва (1-5 звезд)
        articul: art,
        complaintId: complaintId,
        cabinetName: state.cabinetName
      };

      // Обновляем постоянный overlay с информацией о найденной жалобе
      updateOverlayComplaint(complaintInfo);

      // Счетчик найденных жалоб (считаем ДО попытки скриншота)
      state.totalComplaintsFound++;

      // Делаем скриншот с информационной плашкой
      let screenshotSuccess = false;
      try {
        const imageData = await takeScreenshot(document.body, complaintInfo);

        if (imageData) {
          // Отправляем готовое изображение в background для сохранения
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              {
                action: "saveScreenshot",
                imageData,
                articul: art,
                feedbackDate,
                feedbackRating,                       // Рейтинг отзыва (количество звезд 1-5)
                complaintSubmitDate: dateInText,      // Дата подачи жалобы (из таблицы "Жалоба от DD.MM")
                cabinetFolderId: state.cabinetFolderId,
                screenshotMode: state.screenshotMode, // Режим: 'byArticul' или 'allInOne'
                cabinetName: state.cabinetName,       // Название кабинета для Complaints
                complaintId: complaintId,             // ID жалобы для Complaints
                reportSheetId: state.reportSheetId    // ID таблицы для записи в Complaints
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(response);
                }
              }
            );
          });

          if (response?.success) {
            if (response.skipped) {
              console.log("⏭️ Скриншот уже существует, пропущен:", response.fileName);
              // Обновляем overlay с информацией о пропуске
              const statusEl = document.getElementById("overlay-status");
              if (statusEl) {
                statusEl.textContent = "Скриншот существует";
                statusEl.style.background = "#ff9800"; // Оранжевый для пропуска
              }
              state.screenshotsSkipped++; // Счетчик пропущенных
              screenshotSuccess = true; // Считаем успехом, так как файл уже есть
            } else {
              console.log("✅ Скриншот успешно сохранён для артикула:", art);
              state.screenshotsSaved++; // Счетчик сохраненных
              screenshotSuccess = true;
            }

            // Логируем статус записи в Complaints
            if (response.complaintsStatus === 'written') {
              console.log("📝 [Complaints] ✅ Запись добавлена в таблицу:", response.fileName);
            } else if (response.complaintsStatus === 'duplicate') {
              console.log("📝 [Complaints] ⏭️ Дубликат, пропущено:", response.fileName);
            } else if (response.complaintsStatus === 'error') {
              console.error("📝 [Complaints] ❌ ОШИБКА записи:", response.complaintsError);
            } else if (response.complaintsStatus === 'skipped') {
              console.warn("📝 [Complaints] ⚠️ Запись пропущена (нет reportSheetId или fileId)");
            }
          } else {
            console.warn("⚠️ Скриншот не сохранён:", response?.error);
          }
        } else {
          console.warn("⚠️ Не удалось создать скриншот");
        }
      } catch (e) {
        console.error("❌ Ошибка создания/сохранения скриншота:", e);
      }

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await delay(DELAYS.afterEscape);

      // Возвращаем overlay в режим мониторинга после обработки жалобы
      const articulIndex = state.articuls.indexOf(art) + 1;
      updateOverlayProgress(art, articulIndex, state.articuls.length);
    }

    // Проверяем флаг остановки перед пагинацией
    if (!state.isRunning) break;

    const pagination = document.querySelector(SELECTORS.pagination);
    const nextBtn = pagination?.lastElementChild?.querySelector(SELECTORS.paginationButton);

    if (nextBtn) {
      nextBtn.click();
      pageNum++;
      // Ждем реальную загрузку данных через API вместо фиксированной задержки
      await waitForComplaintsLoaded();
      // Даем DOM обновиться после получения данных и ждем стабилизации таблицы
      await delay(DELAYS.afterPagination);
      await waitForTableStability();
      console.log(`📄 Страница ${pageNum} загружена и стабилизирована`);
    } else {
      break;
    }
  }

  // ============================================
  // ОТПРАВКА СТАТУСОВ ЖАЛОБ В API
  // ============================================
  if (statusResults.length > 0 && state.cabinetId) {
    console.log(`📤 Отправляем ${statusResults.length} статусов для артикула ${art} (storeId: ${state.cabinetId})`);
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'sendComplaintStatuses',
        storeId: state.cabinetId,
        results: statusResults
      });

      if (response && response.success) {
        console.log(`✅ Статусы отправлены: обновлено ${response.data?.updated || 0}, пропущено ${response.data?.skipped || 0}`);
      } else {
        console.error('❌ Ошибка отправки статусов:', response?.error);
      }
    } catch (e) {
      console.error('❌ Ошибка отправки статусов в API:', e);
    }
  } else if (statusResults.length === 0) {
    console.log(`ℹ️ Нет статусов для отправки по артикулу ${art}`);
  }
}

function showStats() {
  const modal = document.createElement("div");

  // Формируем строки таблицы: дата | артикул | жалоб подано | жалоб одобрено
  let rows = [];
  for (const [art, dates] of Object.entries(state.stats)) {
    for (const [date, counts] of Object.entries(dates)) {
      // Показываем только даты где были жалобы
      if (counts.total > 0) {
        rows.push({
          date,
          articul: art,
          total: counts.total,
          approved: counts.approved
        });
      }
    }
  }

  // Сортируем по дате, затем по артикулу
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.articul.localeCompare(b.articul);
  });

  const tableRows = rows.map(row => `
    <tr class="stat-row">
      <td>${row.date}</td>
      <td>${row.articul}</td>
      <td>${row.total}</td>
      <td>${row.approved}</td>
    </tr>`
  ).join("");

  modal.innerHTML = `
    <div id="stats-modal-overlay" style="
      position:fixed;top:0;left:0;width:100vw;height:100vh;
      background:rgba(0,0,0,0.6);
      display:flex;align-items:center;justify-content:center;
      z-index:999999;font-family:'Segoe UI',sans-serif;">

      <div id="stats-modal" style="
        background:rgba(255,255,255,0.95);
        backdrop-filter:blur(8px);
        border-radius:16px;
        box-shadow:0 10px 25px rgba(0,0,0,0.2);
        padding:25px 30px;
        width:550px;
        animation:fadeIn 0.3s ease;">

        <h2 style="text-align:center;margin-bottom:16px;color:#333;">
          📊 Результаты проверки
        </h2>
        <div style="
          max-height:400px;
          overflow-y:auto;
          border:1px solid #ddd;
          border-radius:8px;
          margin-bottom:14px;
          box-shadow:inset 0 1px 4px rgba(0,0,0,0.05);
        ">
          <table style="border-collapse:collapse;width:100%;text-align:center;font-size:13px;">
            <thead style="background:#2196f3;color:white;position:sticky;top:0;">
              <tr>
                <th style="padding:8px;">Дата</th>
                <th style="padding:8px;">Артикул</th>
                <th style="padding:8px;">Жалоб подано</th>
                <th style="padding:8px;">Жалоб одобрено</th>
              </tr>
            </thead>
            <tbody>${tableRows || '<tr><td colspan="4" style="padding:20px;color:#999;">Нет данных</td></tr>'}</tbody>
          </table>
        </div>

        <div style="display:flex;justify-content:center;gap:10px;">
          <button id="copyStatsBtn" style="
            padding:10px 20px;
            background:#2196f3;
            color:white;
            border:none;
            border-radius:8px;
            cursor:pointer;
            transition:all 0.2s;
            font-size:14px;
          ">📋 Скопировать все</button>

          <button id="closeStatsBtn" style="
            padding:10px 20px;
            background:#f44336;
            color:white;
            border:none;
            border-radius:8px;
            cursor:pointer;
            transition:all 0.2s;
            font-size:14px;
          ">✖ Закрыть</button>
        </div>
      </div>
    </div>

    <style>
      #stats-modal-overlay button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      }
      #stats-modal-overlay table tr:nth-child(even) {
        background: #f9f9f9;
      }
      #stats-modal-overlay table th, #stats-modal-overlay table td {
        padding: 8px;
        border-bottom: 1px solid #eee;
      }
      #stats-modal-overlay table th {
        font-weight: 600;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }
    </style>
  `;

  document.body.appendChild(modal);

  const overlay = modal.querySelector("#stats-modal-overlay");
  overlay
    .querySelector("#closeStatsBtn")
    .addEventListener("click", () => modal.remove());
  overlay
    .querySelector("#copyStatsBtn")
    .addEventListener("click", () => copyStatsToClipboard(rows));
}

function copyStatsToClipboard(rows) {
  // Формируем текст с заголовками для копирования
  let text = "Дата\tАртикул\tЖалоб подано\tЖалоб одобрено\n";

  // Добавляем строки данных
  for (const row of rows) {
    text += `${row.date}\t${row.articul}\t${row.total}\t${row.approved}\n`;
  }

  navigator.clipboard.writeText(text.trim()).then(() => {
    const btn = document.getElementById("copyStatsBtn");
    const oldText = btn.textContent;
    btn.textContent = "✅ Скопировано!";
    btn.style.background = "#4caf50";
    setTimeout(() => {
      btn.textContent = oldText;
      btn.style.background = "#2196f3";
    }, 2000);
  }).catch((err) => {
    console.error("Ошибка копирования:", err);
    alert("Не удалось скопировать данных. Попробуйте еще раз.");
  });
}

// Закрываем IIFE
})();
