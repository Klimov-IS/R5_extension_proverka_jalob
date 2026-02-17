// ============================================
// Google Sheets API - Чтение данных из таблицы кабинетов
// ============================================

class GoogleSheetsAPI {
  constructor() {
    this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  }

  // Получить данные из таблицы
  async getSheetData(token, spreadsheetId, range = 'A:D') {
    try {
      console.log(`📊 Читаем данные из таблицы ${spreadsheetId}, range: ${range}`);

      const url = `${this.baseUrl}/${spreadsheetId}/values/${range}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка чтения таблицы: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Получено строк: ${data.values ? data.values.length : 0}`);

      return data.values || [];
    } catch (error) {
      console.error('❌ Ошибка чтения Google Sheets:', error);
      throw error;
    }
  }

  // Парсинг данных таблицы в структурированный формат
  parseCabinetsData(rows) {
    if (!rows || rows.length === 0) {
      console.warn('⚠️ Таблица пустая');
      return [];
    }

    const cabinets = [];

    // Пропускаем заголовок (первая строка)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Пропускаем пустые строки
      if (!row || row.length === 0) continue;

      const cabinetName = row[0]?.trim();
      const articulsList = row[1]?.trim();
      const folderUrl = row[2]?.trim();
      const status = row[3]?.trim();

      // Пропускаем если нет названия
      if (!cabinetName) continue;

      // Фильтруем только активные (если указан статус)
      if (status && status.toLowerCase() !== 'активен') {
        console.log(`⏭️ Пропускаем неактивный кабинет: ${cabinetName}`);
        continue;
      }

      // Парсим артикулы (разделены запятыми)
      const articuls = articulsList
        ? articulsList.split(',').map(a => a.trim()).filter(Boolean)
        : [];

      // Извлекаем Folder ID из URL
      const folderId = this.extractFolderIdFromUrl(folderUrl);

      if (!folderId) {
        console.warn(`⚠️ Не удалось извлечь Folder ID для кабинета "${cabinetName}", URL: ${folderUrl}`);
      }

      cabinets.push({
        name: cabinetName,
        articuls: articuls,
        folderUrl: folderUrl,
        folderId: folderId,
        status: status || 'Активен',
      });
    }

    console.log(`✅ Распарсено кабинетов: ${cabinets.length}`);
    return cabinets;
  }

  // Извлечение Folder ID из Google Drive URL
  extractFolderIdFromUrl(url) {
    if (!url) return null;

    // Если это уже ID (без слешей)
    if (!url.includes('/') && url.length > 20) {
      return url;
    }

    // Паттерны URL Google Drive
    const patterns = [
      /\/folders\/([a-zA-Z0-9_-]+)/,  // .../folders/ID
      /id=([a-zA-Z0-9_-]+)/,           // ...?id=ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    console.warn(`⚠️ Не удалось извлечь Folder ID из URL: ${url}`);
    return null;
  }

  // Получить список всех кабинетов из таблицы
  async getCabinets(token, spreadsheetId) {
    try {
      console.log('📊 Загружаем данные из листов Clients и Артикулы...');

      // Читаем данные из листа Clients (все 8 колонок)
      const clientsRows = await this.getSheetData(token, spreadsheetId, 'Clients!A:H');
      console.log(`✅ Загружено строк из Clients: ${clientsRows.length}`);

      // Читаем данные из листа Артикулы
      let articlesRows = [];
      try {
        articlesRows = await this.getSheetData(token, spreadsheetId, 'Артикулы!A:C');
        console.log(`✅ Загружено строк из Артикулы: ${articlesRows.length}`);
      } catch (articlesError) {
        console.warn('⚠️ Лист Артикулы не найден или пуст, используем данные только из Clients');
      }

      // Парсим данные
      const cabinets = this.parseCabinetsDataV2(clientsRows, articlesRows);
      return cabinets;
    } catch (error) {
      console.error('❌ Ошибка получения списка кабинетов:', error);
      throw error;
    }
  }

  // НОВЫЙ парсер для структуры с отдельными листами Clients и Articles
  parseCabinetsDataV2(clientsRows, articlesRows) {
    if (!clientsRows || clientsRows.length === 0) {
      console.warn('⚠️ Лист Clients пуст');
      return [];
    }

    const cabinets = [];

    // Структура листа Clients:
    // A: ClientID, B: ClientName, C: Status, D: DriveFolderID,
    // E: ScreenshotsFolderID, F: ReportSheetID, G: CreatedAt, H: UpdatedAt

    // Пропускаем заголовок (первая строка)
    for (let i = 1; i < clientsRows.length; i++) {
      const row = clientsRows[i];

      // Пропускаем пустые строки
      if (!row || row.length === 0) continue;

      const clientId = row[0]?.trim();
      const clientName = row[1]?.trim();
      const status = row[2]?.trim();
      const driveFolderUrl = row[3]?.trim();
      const screenshotsFolderUrl = row[4]?.trim();
      const reportSheetId = row[5]?.trim();

      // Пропускаем если нет названия
      if (!clientName) continue;

      // Фильтруем только активные
      if (!status || status.toLowerCase() !== 'активен') {
        console.log(`⏭️ Пропускаем неактивный кабинет: ${clientName} (статус: ${status})`);
        continue;
      }

      // Извлекаем Folder ID из URL для Screenshots (приоритет)
      const screenshotsFolderId = this.extractFolderIdFromUrl(screenshotsFolderUrl);
      const driveFolderId = this.extractFolderIdFromUrl(driveFolderUrl);

      // Используем Screenshots folder, если доступна, иначе основная папка Drive
      const targetFolderId = screenshotsFolderId || driveFolderId;

      if (!targetFolderId) {
        console.warn(`⚠️ Нет папки для сохранения скриншотов у кабинета "${clientName}"`);
      }

      // Ищем артикулы для этого кабинета в листе Артикулы
      const articuls = this.getArticlesForClient(clientId, clientName, articlesRows);

      // Логируем результат для каждого кабинета
      if (articuls.length === 0) {
        console.log(`⚠️ Кабинет "${clientName}" не имеет артикулов в листе Артикулы`);
      } else if (articuls.length > 1000) {
        console.warn(`⚠️ Кабинет "${clientName}" имеет ${articuls.length} артикулов. Это может замедлить работу.`);
      } else {
        console.log(`✓ Кабинет "${clientName}": ${articuls.length} артикулов`);
      }

      cabinets.push({
        clientId: clientId,
        name: clientName,
        articuls: articuls,
        folderUrl: screenshotsFolderUrl || driveFolderUrl,
        folderId: targetFolderId,
        screenshotsFolderId: screenshotsFolderId,
        driveFolderId: driveFolderId,
        reportSheetId: reportSheetId,
        status: status,
        articulCount: articuls.length
      });
    }

    console.log(`✅ Распарсено активных кабинетов: ${cabinets.length}`);

    // Показываем статистику по артикулам
    const totalArticles = cabinets.reduce((sum, cab) => sum + cab.articulCount, 0);
    console.log(`📊 Всего артикулов: ${totalArticles}`);

    return cabinets;
  }

  // Получить артикулы для конкретного кабинета
  getArticlesForClient(clientId, clientName, articlesRows) {
    if (!articlesRows || articlesRows.length === 0) {
      return [];
    }

    const articuls = [];
    let debugMatchAttempts = 0; // Для отладки

    // Структура листа Артикулы:
    // A: Клиент (ClientName), B: Артикул WB, C: Статус

    // Пропускаем заголовок
    for (let i = 1; i < articlesRows.length; i++) {
      const row = articlesRows[i];

      if (!row || row.length < 2) continue;

      const rowClientName = row[0]?.trim(); // A: Клиент
      const article = row[1]?.trim(); // B: Артикул WB
      const articleStatus = row[2]?.trim(); // C: Статус

      if (!article) continue;

      debugMatchAttempts++;

      // Сопоставляем по имени клиента (регистронезависимо)
      const matchesClient = clientName && rowClientName && rowClientName.toLowerCase() === clientName.toLowerCase();

      if (!matchesClient) continue;

      // Фильтруем только активные артикулы (если статус указан)
      if (articleStatus) {
        const statusLower = articleStatus.toLowerCase();
        // Принимаем: "активен" или пустой статус
        if (statusLower !== 'активен') {
          continue;
        }
      }

      articuls.push(article);
    }

    // Отладочный лог для кабинетов без артикулов
    if (articuls.length === 0 && debugMatchAttempts > 0) {
      console.warn(`🔍 [DEBUG] Кабинет "${clientName}" (ID: ${clientId}): проверено ${debugMatchAttempts} строк, найдено 0 совпадений`);
      console.warn(`🔍 [DEBUG] Проверьте колонку A в листе Артикулы - должно быть точное совпадение с именем: "${clientName}"`);
    }

    return articuls;
  }

  // Получить данные конкретного кабинета по имени
  getCabinetByName(cabinets, cabinetName) {
    return cabinets.find(c => c.name === cabinetName);
  }

  // ============================================
  // ОТЧЕТНОСТЬ: Запись в Google Sheets
  // ============================================

  // UPSERT: Добавить или обновить строку статистики
  async upsertStatsRow(token, spreadsheetId, sheetName, statsData) {
    try {
      // Уникальный ключ: ClientName + Article + ComplaintDate
      const { clientName, article, complaintDate, totalComplaints, approvedComplaints } = statsData;

      console.log(`🔄 [SHEETS-API] UPSERT для: ${clientName} | ${article} | ${complaintDate}`);
      console.log(`🔍 [SHEETS-API] Параметры:`, {
        spreadsheetId,
        sheetName,
        clientName,
        article,
        complaintDate,
        totalComplaints,
        approvedComplaints
      });

      // Читаем все данные из листа Stats_Daily
      const range = `${sheetName}!A:G`; // Колонки A-G (7 колонок)
      console.log(`📖 [SHEETS-API] Читаем данные из диапазона: ${range}`);

      const rows = await this.getSheetData(token, spreadsheetId, range);
      console.log(`📊 [SHEETS-API] Получено строк: ${rows?.length || 0}`);

      if (!rows || rows.length === 0) {
        // Лист пустой - добавляем первую строку
        console.log('📊 [SHEETS-API] Лист пустой, добавляем первую запись');
        const newRow = [
          clientName,
          article,
          complaintDate,
          totalComplaints,
          approvedComplaints,
          new Date().toLocaleString('ru-RU'),
          1 // CheckCount = 1
        ];
        console.log('📝 [SHEETS-API] Новая строка:', newRow);
        await this.appendRow(token, spreadsheetId, sheetName, newRow);
        console.log('✅ [SHEETS-API] Первая запись добавлена');
        return { action: 'inserted' };
      }

      // Ищем существующую запись
      let existingRowIndex = -1;
      console.log(`🔍 [SHEETS-API] Ищем существующую запись для: ${clientName} | ${article} | ${complaintDate}`);

      for (let i = 1; i < rows.length; i++) { // Пропускаем заголовок (индекс 0)
        const row = rows[i];

        const rowClientName = row[0]?.trim() || '';
        const rowArticle = row[1]?.trim() || '';
        const rowComplaintDate = row[2]?.trim() || '';

        // Проверяем совпадение уникального ключа
        if (
          rowClientName === clientName &&
          rowArticle === article &&
          rowComplaintDate === complaintDate
        ) {
          existingRowIndex = i + 1; // +1 потому что Google Sheets начинается с 1
          console.log(`✅ [SHEETS-API] Найдена существующая запись в строке ${existingRowIndex}`);
          break;
        }
      }

      if (existingRowIndex > 0) {
        // ОБНОВЛЕНИЕ существующей записи
        console.log(`🔄 [SHEETS-API] Обновляем существующую строку ${existingRowIndex}`);
        const oldCheckCount = parseInt(rows[existingRowIndex - 1][6]) || 0; // Индекс 6 = CheckCount
        const newCheckCount = oldCheckCount + 1;

        const updateRange = `${sheetName}!A${existingRowIndex}:G${existingRowIndex}`;
        const updateValues = [
          clientName,
          article,
          complaintDate,
          totalComplaints,
          approvedComplaints,
          new Date().toLocaleString('ru-RU'),
          newCheckCount
        ];

        console.log(`📝 [SHEETS-API] Обновляем range: ${updateRange}, значения:`, updateValues);
        await this.updateRow(token, spreadsheetId, updateRange, updateValues);
        console.log(`✅ [SHEETS-API] Запись обновлена (строка ${existingRowIndex}, CheckCount: ${newCheckCount})`);

        return { action: 'updated', row: existingRowIndex, checkCount: newCheckCount };
      } else {
        // ВСТАВКА новой записи
        console.log('📝 [SHEETS-API] Добавляем новую запись (существующая не найдена)');
        const newRow = [
          clientName,
          article,
          complaintDate,
          totalComplaints,
          approvedComplaints,
          new Date().toLocaleString('ru-RU'),
          1 // CheckCount = 1
        ];
        console.log('📝 [SHEETS-API] Новая строка:', newRow);
        await this.appendRow(token, spreadsheetId, sheetName, newRow);
        console.log('✅ [SHEETS-API] Новая запись добавлена');

        return { action: 'inserted' };
      }
    } catch (error) {
      console.error(`❌ [SHEETS-API] Ошибка UPSERT в "${sheetName}":`, error);
      console.error(`❌ [SHEETS-API] Stack trace:`, error.stack);
      console.error(`❌ [SHEETS-API] Детали ошибки:`, {
        message: error.message,
        name: error.name,
        spreadsheetId,
        sheetName,
        statsData
      });
      throw error;
    }
  }

  // Обновление существующей строки
  async updateRow(token, spreadsheetId, range, values) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;

      console.log(`📝 Обновление строки: ${range}`);

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [values] // Массив значений для одной строки
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка обновления строки: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Строка обновлена: ${range}`);
      return data;
    } catch (error) {
      console.error(`❌ Ошибка обновления строки "${range}":`, error);
      throw error;
    }
  }

  // Проверка существования записи в Complaints (для предотвращения дублей)
  async checkComplaintExists(token, spreadsheetId, sheetName, criteria) {
    try {
      // Читаем все данные из листа Complaints
      const range = `${sheetName}!A:L`; // Колонки A-L (12 колонок с учетом Рейтинг отзыва)
      const rows = await this.getSheetData(token, spreadsheetId, range);

      if (!rows || rows.length <= 1) {
        // Нет данных (только заголовок или пусто)
        return false;
      }

      // НОВАЯ Структура Complaints:
      // A: Дата проверки, B: Кабинет, C: Артикул, D: ID отзыва, E: Рейтинг отзыва,
      // F: Дата отзыва, G: Дата подачи жалобы, H: Статус, I: Скриншот, J: Имя файла, K: Ссылка Drive, L: Путь

      // Ищем совпадение по: Кабинет (B) + Артикул (C) + Дата отзыва (F) + Имя файла (J)
      const { cabinet, articul, feedbackDate, fileName } = criteria;

      // Пропускаем заголовок (строка 0)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];

        const rowCabinet = row[1]?.trim() || '';
        const rowArticul = row[2]?.trim() || '';
        const rowFeedbackDate = row[5]?.trim() || ''; // F: Дата отзыва (индекс 5)
        const rowFileName = row[9]?.trim() || ''; // J: Имя файла (индекс 9)

        // Проверяем точное совпадение всех критериев
        if (
          rowCabinet === cabinet &&
          rowArticul === articul &&
          rowFeedbackDate === feedbackDate &&
          rowFileName === fileName
        ) {
          console.log(`🔍 Найден дубль в Complaints (строка ${i + 1}): ${fileName}`);
          return true; // Запись существует
        }
      }

      console.log(`✅ Запись уникальна: ${fileName}`);
      return false; // Записи нет, можно добавлять
    } catch (error) {
      console.error(`❌ Ошибка проверки существования записи в "${sheetName}":`, error);
      // В случае ошибки возвращаем false, чтобы не блокировать запись
      return false;
    }
  }

  // Добавление строки в конец таблицы (для отчетов)
  async appendRow(token, spreadsheetId, sheetName, values) {
    try {
      const range = `${sheetName}!A:Z`; // Диапазон всех столбцов
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

      console.log(`📝 Добавление строки в лист "${sheetName}":`, values);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [values] // Массив значений для одной строки
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка добавления строки: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Строка добавлена в "${sheetName}":`, data.updates);
      return data;
    } catch (error) {
      console.error(`❌ Ошибка добавления строки в "${sheetName}":`, error);
      throw error;
    }
  }
}

// Создаем глобальную переменную для использования в service worker
var googleSheetsAPI = new GoogleSheetsAPI();
