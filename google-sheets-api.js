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

  // Проверка существования записи в Complaints (для предотвращения дублей)
  async checkComplaintExists(token, spreadsheetId, sheetName, criteria) {
    try {
      // Читаем все данные из листа
      const range = `'${sheetName}'!A:M`; // Колонки A-M (13 колонок)
      const rows = await this.getSheetData(token, spreadsheetId, range);

      if (!rows || rows.length <= 1) {
        // Нет данных (только заголовок или пусто)
        return false;
      }

      // Структура Complaints (Жалобы V 2.0):
      // A: Дата проверки, B: Кабинет, C: Артикул, D: ID отзыва, E: Рейтинг отзыва,
      // F: Дата отзыва, G: Дата подачи жалобы, H: Статус, I: Скриншот, J: Имя файла,
      // K: Ссылка Drive, L: Категория жалобы, M: Текст жалобы

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

  // Получить маппинг папок Drive для кабинетов (поиск колонок по заголовкам)
  async getFolderMappings(token, spreadsheetId, sheetName = 'Clients') {
    try {
      console.log(`📊 [SHEETS-API] Загружаем маппинг папок из листа "${sheetName}"...`);
      const rows = await this.getSheetData(token, spreadsheetId, `'${sheetName}'!A:Z`);

      if (!rows || rows.length <= 1) {
        console.warn(`⚠️ [SHEETS-API] Лист "${sheetName}" пуст`);
        return [];
      }

      // Ищем колонки по заголовкам первой строки
      const headers = rows[0].map(h => (h || '').trim().toLowerCase());

      // Маппинг: ключ → возможные названия заголовков (в нижнем регистре)
      const HEADER_ALIASES = {
        clientId:      ['id магазина', 'clientid', 'id клиента', 'store id'],
        clientName:    ['название', 'clientname', 'имя клиента', 'магазин', 'name'],
        status:        ['статус', 'status'],
        driveFolderUrl:       ['папка клиента', 'drivefolderid', 'папка drive', 'drive folder'],
        screenshotsFolderUrl: ['скриншоты', 'screenshotsfolderid', 'папка скриншотов', 'screenshots folder']
      };

      const cols = {};
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        cols[key] = headers.findIndex(h => aliases.includes(h));
      }

      console.log(`📊 [SHEETS-API] Найденные колонки:`, JSON.stringify(cols));

      // Проверяем обязательные колонки
      if (cols.clientName < 0) {
        console.error('❌ [SHEETS-API] Не найдена колонка "Название" в заголовках:', rows[0]);
        throw new Error(`Не найдена колонка "Название" в листе "${sheetName}". Заголовки: ${rows[0].join(', ')}`);
      }

      const mappings = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const clientId = cols.clientId >= 0 ? row[cols.clientId]?.trim() : '';
        const clientName = cols.clientName >= 0 ? row[cols.clientName]?.trim() : '';
        const status = cols.status >= 0 ? row[cols.status]?.trim() : '';
        const driveFolderUrl = cols.driveFolderUrl >= 0 ? row[cols.driveFolderUrl]?.trim() : '';
        const screenshotsFolderUrl = cols.screenshotsFolderUrl >= 0 ? row[cols.screenshotsFolderUrl]?.trim() : '';

        if (!clientName) continue;

        // Пропускаем неактивные
        if (status && status.toLowerCase() !== 'активен') continue;

        const screenshotsFolderId = this.extractFolderIdFromUrl(screenshotsFolderUrl);
        const driveFolderId = this.extractFolderIdFromUrl(driveFolderUrl);

        mappings.push({
          clientId,
          name: clientName,
          folderId: screenshotsFolderId || driveFolderId,
          screenshotsFolderId,
          driveFolderId
        });
      }

      console.log(`✅ [SHEETS-API] Маппинг папок: ${mappings.length} кабинетов`);
      return mappings;
    } catch (error) {
      console.error('❌ [SHEETS-API] Ошибка getFolderMappings:', error);
      throw error;
    }
  }

  // Добавление строки в конец таблицы (для отчетов)
  async appendRow(token, spreadsheetId, sheetName, values) {
    try {
      // Используем точный диапазон столбцов, чтобы API не путал расположение таблицы
      const colCount = values.length;
      const lastCol = String.fromCharCode(64 + Math.min(colCount, 26)); // A=1, B=2, ..., L=12, Z=26
      const range = `'${sheetName}'!A:${lastCol}`;
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
