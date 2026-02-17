/**
 * TransformData.gs
 *
 * Скрипт для трансформации данных внутри таблицы Rating5_OPS
 * Читает старую вкладку "Клиенты" (30 колонок) и переносит данные
 * в новые вкладки: Clients и Articles
 *
 * ИНСТРУКЦИЯ:
 * 1. Откройте таблицу Rating5_OPS в Google Sheets
 * 2. Перейдите в Расширения → Apps Script
 * 3. Создайте новый файл TransformData.gs и вставьте этот код
 * 4. Запустите функцию transformOldDataToNew()
 * 5. Дайте разрешения при первом запуске
 * 6. Проверьте результаты во вкладках Clients и Articles
 */

/**
 * ГЛАВНАЯ ФУНКЦИЯ - запустите её для миграции данных
 */
function transformOldDataToNew() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Logger.log('🚀 Начало трансформации данных...');

  // Шаг 1: Получаем исходные данные из старой вкладки
  const oldData = readOldClientsSheet(ss);
  Logger.log(`✓ Прочитано ${oldData.length} клиентов из старой вкладки`);

  // Шаг 2: Парсим и готовим данные
  const { clientsData, articlesData } = parseOldData(oldData);
  Logger.log(`✓ Подготовлено ${clientsData.length} клиентов и ${articlesData.length} артикулов`);

  // Шаг 3: Записываем в новые вкладки
  writeToClientsSheet(ss, clientsData);
  Logger.log(`✓ Данные клиентов записаны во вкладку Clients`);

  writeToArticlesSheet(ss, articlesData);
  Logger.log(`✓ Данные артикулов записаны во вкладку Articles`);

  Logger.log('✅ Миграция завершена успешно!');

  // Показываем результат пользователю
  SpreadsheetApp.getUi().alert(
    '✅ Миграция завершена!\n\n' +
    `Перенесено клиентов: ${clientsData.length}\n` +
    `Создано записей артикулов: ${articlesData.length}\n\n` +
    'Проверьте вкладки Clients и Articles'
  );
}

/**
 * Читает данные из старой вкладки "Клиенты"
 */
function readOldClientsSheet(ss) {
  // Ищем старую вкладку (может быть "Клиенты" или другое имя)
  const possibleNames = ['Клиенты', 'Clients_OLD', 'Отчет автоматизация'];
  let oldSheet = null;

  for (const name of possibleNames) {
    oldSheet = ss.getSheetByName(name);
    if (oldSheet) {
      Logger.log(`✓ Найдена старая вкладка: "${name}"`);
      break;
    }
  }

  if (!oldSheet) {
    throw new Error(
      'Не найдена вкладка со старыми данными!\n' +
      'Ожидаемые имена: ' + possibleNames.join(', ')
    );
  }

  // Читаем все данные (начиная со строки 2, пропуская заголовок)
  const lastRow = oldSheet.getLastRow();
  if (lastRow < 2) {
    throw new Error('Вкладка "Клиенты" пуста или содержит только заголовок');
  }

  const data = oldSheet.getRange(2, 1, lastRow - 1, 30).getValues();
  return data;
}

/**
 * Парсит старые данные и готовит для новых вкладок
 */
function parseOldData(oldData) {
  const clientsData = [];
  const articlesData = [];
  let clientId = 1;
  let articleId = 1;

  const now = new Date();

  oldData.forEach((row, index) => {
    // Колонки из старой таблицы:
    // 0: Client ID (обычно пусто)
    // 1: Client Name
    // 2: Статус
    // 15: Папка клиента (Drive folder URL)
    // 16: Отчет клиента (Report Sheet URL)
    // 18: Скриншоты (Screenshots folder URL)

    const clientName = row[1] ? String(row[1]).trim() : '';
    const status = row[2] ? String(row[2]).trim() : '';
    const driveFolderUrl = row[15] ? String(row[15]).trim() : '';
    const reportSheetUrl = row[16] ? String(row[16]).trim() : '';
    const screenshotsFolderUrl = row[18] ? String(row[18]).trim() : '';

    // Пропускаем пустые строки
    if (!clientName) {
      return;
    }

    // Извлекаем ID из URL
    const driveFolderId = extractFolderId(driveFolderUrl);
    const screenshotsFolderId = extractFolderId(screenshotsFolderUrl);
    const reportSheetId = extractSpreadsheetId(reportSheetUrl);

    // Определяем статус клиента
    let clientStatus = 'active';
    if (status.toLowerCase().includes('потеря')) {
      clientStatus = 'inactive';
    } else if (status.toLowerCase().includes('работе')) {
      clientStatus = 'active';
    }

    // Добавляем клиента
    clientsData.push([
      `CL${String(clientId).padStart(4, '0')}`, // ClientID
      clientName,                                 // ClientName
      clientStatus,                               // Status
      driveFolderId,                             // DriveFolderID
      screenshotsFolderId,                       // ScreenshotsFolderID
      reportSheetId,                             // ReportSheetID
      now,                                       // CreatedAt
      now                                        // UpdatedAt
    ]);

    // Для каждого клиента пытаемся найти артикулы
    // (в будущем можно читать из вкладки "Артикулы", пока оставляем пустым)
    // Это будет сделано отдельно после миграции основных данных

    clientId++;
  });

  return { clientsData, articlesData };
}

/**
 * Записывает данные клиентов во вкладку Clients
 */
function writeToClientsSheet(ss, clientsData) {
  const clientsSheet = ss.getSheetByName('Clients');

  if (!clientsSheet) {
    throw new Error('Вкладка "Clients" не найдена! Запустите сначала SetupSheets.gs');
  }

  if (clientsData.length === 0) {
    Logger.log('⚠️ Нет данных для записи в Clients');
    return;
  }

  // Очищаем старые данные (кроме заголовка)
  const lastRow = clientsSheet.getLastRow();
  if (lastRow > 1) {
    clientsSheet.getRange(2, 1, lastRow - 1, 8).clearContent();
  }

  // Записываем новые данные
  const startRow = 2;
  clientsSheet.getRange(startRow, 1, clientsData.length, 8).setValues(clientsData);

  // Форматируем даты
  const dateColumns = [7, 8]; // CreatedAt, UpdatedAt
  dateColumns.forEach(col => {
    clientsSheet.getRange(startRow, col, clientsData.length, 1)
      .setNumberFormat('yyyy-MM-dd HH:mm:ss');
  });

  Logger.log(`✓ Записано ${clientsData.length} строк во вкладку Clients`);
}

/**
 * Записывает данные артикулов во вкладку Articles
 */
function writeToArticlesSheet(ss, articlesData) {
  const articlesSheet = ss.getSheetByName('Articles');

  if (!articlesSheet) {
    throw new Error('Вкладка "Articles" не найдена! Запустите сначала SetupSheets.gs');
  }

  if (articlesData.length === 0) {
    Logger.log('⚠️ Нет данных для записи в Articles (это нормально, артикулы будут добавлены позже)');
    return;
  }

  // Очищаем старые данные (кроме заголовка)
  const lastRow = articlesSheet.getLastRow();
  if (lastRow > 1) {
    articlesSheet.getRange(2, 1, lastRow - 1, 6).clearContent();
  }

  // Записываем новые данные
  const startRow = 2;
  articlesSheet.getRange(startRow, 1, articlesData.length, 6).setValues(articlesData);

  Logger.log(`✓ Записано ${articlesData.length} строк во вкладку Articles`);
}

/**
 * Извлекает ID папки из URL Google Drive
 * Поддерживает форматы:
 * - https://drive.google.com/drive/folders/FOLDER_ID
 * - https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
 */
function extractFolderId(url) {
  if (!url || typeof url !== 'string') return '';

  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
}

/**
 * Извлекает ID таблицы из URL Google Sheets
 * Поддерживает форматы:
 * - https://docs.google.com/spreadsheets/d/SHEET_ID/edit
 * - https://docs.google.com/spreadsheets/d/SHEET_ID/edit?usp=sharing
 */
function extractSpreadsheetId(url) {
  if (!url || typeof url !== 'string') return '';

  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
}

/**
 * ДОПОЛНИТЕЛЬНАЯ ФУНКЦИЯ: Миграция артикулов из вкладки "Артикулы"
 * Запустите эту функцию отдельно, если у вас есть вкладка с артикулами
 */
function migrateArticlesFromOldSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Logger.log('🚀 Начало миграции артикулов...');

  // Ищем вкладку с артикулами
  const articlesOldSheet = ss.getSheetByName('Артикулы');

  if (!articlesOldSheet) {
    SpreadsheetApp.getUi().alert(
      '⚠️ Вкладка "Артикулы" не найдена!\n\n' +
      'Если у вас есть данные об артикулах, создайте вкладку "Артикулы" и повторите.'
    );
    return;
  }

  // Читаем данные об артикулах
  const lastRow = articlesOldSheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('⚠️ Вкладка "Артикулы" пуста');
    return;
  }

  // Предполагаемая структура старой вкладки "Артикулы":
  // Колонка A: Имя клиента
  // Колонка B: Артикул
  // Колонка C: Название товара (опционально)

  const oldArticlesData = articlesOldSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const clientsSheet = ss.getSheetByName('Clients');
  const clientsData = clientsSheet.getRange(2, 1, clientsSheet.getLastRow() - 1, 2).getValues();

  // Создаем карту: Имя клиента → ClientID
  const clientNameToId = {};
  clientsData.forEach(row => {
    const clientId = row[0];
    const clientName = row[1];
    clientNameToId[clientName] = clientId;
  });

  const articlesData = [];
  let articleId = 1;
  const now = new Date();

  oldArticlesData.forEach(row => {
    const clientName = row[0] ? String(row[0]).trim() : '';
    const article = row[1] ? String(row[1]).trim() : '';
    const productName = row[2] ? String(row[2]).trim() : '';

    if (!clientName || !article) return;

    const clientId = clientNameToId[clientName];
    if (!clientId) {
      Logger.log(`⚠️ Клиент "${clientName}" не найден, пропускаем артикул ${article}`);
      return;
    }

    articlesData.push([
      `ART${String(articleId).padStart(5, '0')}`, // ArticleID
      clientId,                                    // ClientID
      article,                                     // Article
      productName,                                 // ProductName
      'active',                                    // Status
      now                                          // CreatedAt
    ]);

    articleId++;
  });

  // Записываем в новую вкладку Articles
  writeToArticlesSheet(ss, articlesData);

  Logger.log('✅ Миграция артикулов завершена!');

  SpreadsheetApp.getUi().alert(
    '✅ Миграция артикулов завершена!\n\n' +
    `Перенесено артикулов: ${articlesData.length}\n\n` +
    'Проверьте вкладку Articles'
  );
}

/**
 * ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: Проверка данных после миграции
 * Запустите для проверки корректности переноса
 */
function validateMigration() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const clientsSheet = ss.getSheetByName('Clients');
  const articlesSheet = ss.getSheetByName('Articles');

  const clientsCount = clientsSheet.getLastRow() - 1;
  const articlesCount = articlesSheet.getLastRow() - 1;

  Logger.log('=== РЕЗУЛЬТАТЫ МИГРАЦИИ ===');
  Logger.log(`Клиентов: ${clientsCount}`);
  Logger.log(`Артикулов: ${articlesCount}`);

  // Проверяем на дубликаты ClientID
  const clientIds = clientsSheet.getRange(2, 1, clientsCount, 1).getValues().flat();
  const uniqueClientIds = new Set(clientIds);

  if (clientIds.length !== uniqueClientIds.size) {
    Logger.log('⚠️ ВНИМАНИЕ: Найдены дубликаты ClientID!');
  } else {
    Logger.log('✓ Все ClientID уникальны');
  }

  // Проверяем наличие ссылок на Drive
  const driveColumns = clientsSheet.getRange(2, 4, clientsCount, 2).getValues();
  let withDriveFolders = 0;
  let withScreenshotsFolders = 0;

  driveColumns.forEach(row => {
    if (row[0]) withDriveFolders++;
    if (row[1]) withScreenshotsFolders++;
  });

  Logger.log(`Клиентов с папкой на Drive: ${withDriveFolders} из ${clientsCount}`);
  Logger.log(`Клиентов с папкой скриншотов: ${withScreenshotsFolders} из ${clientsCount}`);

  SpreadsheetApp.getUi().alert(
    '📊 Статистика миграции:\n\n' +
    `Клиентов: ${clientsCount}\n` +
    `Артикулов: ${articlesCount}\n\n` +
    `С папками Drive: ${withDriveFolders}\n` +
    `С папками скриншотов: ${withScreenshotsFolders}\n\n` +
    (clientIds.length !== uniqueClientIds.size ?
      '⚠️ Найдены дубликаты ClientID!' :
      '✓ Все ClientID уникальны')
  );
}
