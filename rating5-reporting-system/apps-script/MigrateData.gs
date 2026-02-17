/**
 * ============================================
 * МИГРАЦИЯ ДАННЫХ ИЗ СТАРОЙ ТАБЛИЦЫ
 * ============================================
 *
 * Этот скрипт автоматически мигрирует данные клиентов
 * из старой таблицы "Отчет автоматизация" в новую Rating5_OPS.
 *
 * ИНСТРУКЦИЯ:
 * 1. Откройте вашу НОВУЮ таблицу Rating5_OPS
 * 2. Extensions → Apps Script
 * 3. Нажмите "+" → "Script" → Создайте новый файл "MigrateData"
 * 4. Скопируйте весь этот код и вставьте
 * 5. ВАЖНО: В функции migrateClients() укажите ID старой таблицы
 * 6. Сохраните (Ctrl+S)
 * 7. Выберите функцию migrateClients в выпадающем списке
 * 8. Нажмите "Запустить"
 * 9. Дождитесь завершения (~1 минута)
 *
 * ЧТО ДЕЛАЕТ СКРИПТ:
 * - Читает данные из листа "Клиенты" старой таблицы
 * - Извлекает Folder ID из Drive URLs
 * - Создаёт ClientID для каждого клиента
 * - Парсит артикулы (через запятую)
 * - Записывает в новые листы Clients и Articles
 * - Проверяет дубликаты
 */

/**
 * КОНФИГУРАЦИЯ - УКАЖИТЕ ЗДЕСЬ ID ВАШЕЙ СТАРОЙ ТАБЛИЦЫ
 */
const OLD_SPREADSHEET_ID = ''; // ← ВСТАВЬТЕ ID СЮДА!

/**
 * ГЛАВНАЯ ФУНКЦИЯ - Миграция клиентов
 */
function migrateClients() {
  // Проверка что ID указан
  if (!OLD_SPREADSHEET_ID || OLD_SPREADSHEET_ID === '') {
    SpreadsheetApp.getUi().alert(
      'Ошибка конфигурации',
      'Пожалуйста, укажите OLD_SPREADSHEET_ID в начале скрипта.\n\n' +
      'Откройте вашу старую таблицу "Отчет автоматизация",\n' +
      'скопируйте ID из URL (часть между /d/ и /edit),\n' +
      'и вставьте в строку:\n' +
      'const OLD_SPREADSHEET_ID = "ВАШ_ID_ЗДЕСЬ";',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  Logger.log('🚀 Начинаем миграцию данных клиентов...');

  const newSs = SpreadsheetApp.getActiveSpreadsheet();
  const newClientsSheet = newSs.getSheetByName('Clients');
  const newArticlesSheet = newSs.getSheetByName('Articles');

  // Проверка что листы существуют
  if (!newClientsSheet || !newArticlesSheet) {
    SpreadsheetApp.getUi().alert(
      'Ошибка',
      'Листы Clients или Articles не найдены!\n' +
      'Сначала запустите setupSheets() для создания структуры таблицы.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  try {
    // Читаем данные из старой таблицы
    Logger.log('📖 Читаем данные из старой таблицы...');
    const oldSs = SpreadsheetApp.openById(OLD_SPREADSHEET_ID);
    const oldClientsSheet = oldSs.getSheetByName('Клиенты');

    if (!oldClientsSheet) {
      throw new Error('Лист "Клиенты" не найден в старой таблице');
    }

    const oldData = oldClientsSheet.getDataRange().getValues();
    Logger.log(`📊 Найдено строк: ${oldData.length}`);

    // Парсим заголовки старой таблицы
    const headers = oldData[0];
    const colIndexes = {
      clientName: headers.indexOf('Client Name'),
      status: headers.indexOf('Статус'),
      folderClient: headers.indexOf('Папка клиента'),
      screenshots: headers.indexOf('Скриншоты'),
      reportSheet: headers.indexOf('Отчет клиента')
    };

    Logger.log('📋 Индексы колонок:', colIndexes);

    // Счётчики
    let clientsAdded = 0;
    let articlesAdded = 0;
    let clientsSkipped = 0;

    // Обрабатываем каждую строку (пропускаем заголовок)
    for (let i = 1; i < oldData.length; i++) {
      const row = oldData[i];

      // Пропускаем пустые строки
      if (!row[colIndexes.clientName]) {
        Logger.log(`⏭️ Строка ${i + 1}: пропущена (нет названия клиента)`);
        clientsSkipped++;
        continue;
      }

      const clientName = row[colIndexes.clientName].toString().trim();
      const status = row[colIndexes.status] ? row[colIndexes.status].toString().trim() : 'Активен';
      const folderUrl = row[colIndexes.folderClient] ? row[colIndexes.folderClient].toString().trim() : '';
      const screenshotsUrl = row[colIndexes.screenshots] ? row[colIndexes.screenshots].toString().trim() : '';
      const reportUrl = row[colIndexes.reportSheet] ? row[colIndexes.reportSheet].toString().trim() : '';

      // Извлекаем Folder IDs
      const driveFolderId = extractFolderId(folderUrl);
      const screenshotsFolderId = extractFolderId(screenshotsUrl);
      const reportSheetId = extractSpreadsheetId(reportUrl);

      // Проверяем существование клиента
      if (clientExists(newClientsSheet, clientName)) {
        Logger.log(`⏭️ Клиент "${clientName}" уже существует, пропускаем`);
        clientsSkipped++;
        continue;
      }

      // Генерируем ClientID
      const clientId = generateNextClientId(newClientsSheet);

      // Добавляем клиента
      const clientRow = [
        clientId,                    // ClientID (формула перезапишется)
        clientName,                  // ClientName
        status,                      // Status
        driveFolderId,               // DriveFolderID
        screenshotsFolderId,         // ScreenshotsFolderID
        reportSheetId,               // ReportSheetID
        new Date(),                  // CreatedAt
        new Date()                   // UpdatedAt
      ];

      newClientsSheet.appendRow(clientRow);
      clientsAdded++;

      Logger.log(`✅ Добавлен клиент: ${clientId} - ${clientName}`);

      // Парсим артикулы (если есть лист "Артикулы" в старой таблице)
      const articuls = getArticulsForClient(oldSs, clientName);

      if (articuls.length > 0) {
        Logger.log(`📦 Найдено артикулов: ${articuls.length}`);

        for (const articul of articuls) {
          const articleRow = [
            '', // ArticleID (формула)
            clientId,
            articul,
            '', // ProductName (пусто)
            'Активен',
            new Date()
          ];
          newArticlesSheet.appendRow(articleRow);
          articlesAdded++;
        }
      }
    }

    Logger.log('🎉 Миграция завершена!');
    Logger.log(`📊 Статистика:`);
    Logger.log(`   Клиентов добавлено: ${clientsAdded}`);
    Logger.log(`   Клиентов пропущено: ${clientsSkipped}`);
    Logger.log(`   Артикулов добавлено: ${articlesAdded}`);

    // Показываем результат
    SpreadsheetApp.getUi().alert(
      'Миграция завершена!',
      `Успешно мигрированы данные:\n\n` +
      `✅ Клиентов добавлено: ${clientsAdded}\n` +
      `⏭️ Клиентов пропущено: ${clientsSkipped}\n` +
      `📦 Артикулов добавлено: ${articlesAdded}\n\n` +
      `Проверьте листы Clients и Articles.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (error) {
    Logger.log('❌ Ошибка миграции:', error);
    SpreadsheetApp.getUi().alert(
      'Ошибка миграции',
      `Произошла ошибка при миграции данных:\n\n${error.message}\n\n` +
      `Проверьте:\n` +
      `1. ID старой таблицы указан правильно\n` +
      `2. У вас есть доступ к старой таблице\n` +
      `3. В старой таблице есть лист "Клиенты"`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Извлечь Folder ID из Google Drive URL
 */
function extractFolderId(url) {
  if (!url) return '';

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

  return '';
}

/**
 * Извлечь Spreadsheet ID из Google Sheets URL
 */
function extractSpreadsheetId(url) {
  if (!url) return '';

  // Если это уже ID
  if (!url.includes('/') && url.length > 20) {
    return url;
  }

  // Паттерн: /spreadsheets/d/ID/
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }

  return '';
}

/**
 * Проверить существование клиента
 */
function clientExists(sheet, clientName) {
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === clientName) { // Колонка B (ClientName)
      return true;
    }
  }

  return false;
}

/**
 * Сгенерировать следующий ClientID
 */
function generateNextClientId(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow === 1) {
    // Нет данных, первый клиент
    return 'CLI_001';
  }

  // Читаем последний ClientID
  const lastClientId = sheet.getRange(lastRow, 1).getValue();

  if (!lastClientId) {
    return 'CLI_001';
  }

  // Извлекаем номер и увеличиваем
  const match = lastClientId.match(/CLI_(\d+)/);
  if (match) {
    const num = parseInt(match[1]) + 1;
    return 'CLI_' + String(num).padStart(3, '0');
  }

  return 'CLI_001';
}

/**
 * Получить артикулы для клиента из старой таблицы
 */
function getArticulsForClient(oldSs, clientName) {
  const articulsSheet = oldSs.getSheetByName('Артикулы');

  if (!articulsSheet) {
    Logger.log('⚠️ Лист "Артикулы" не найден в старой таблице');
    return [];
  }

  const data = articulsSheet.getDataRange().getValues();

  // Ищем колонку с названием клиента в первой строке
  const headers = data[0];
  const clientColIndex = headers.findIndex(h =>
    h && h.toString().trim().toLowerCase() === clientName.toLowerCase()
  );

  if (clientColIndex === -1) {
    Logger.log(`⚠️ Колонка для клиента "${clientName}" не найдена`);
    return [];
  }

  // Собираем артикулы из этой колонки
  const articuls = [];
  for (let i = 1; i < data.length; i++) {
    const articul = data[i][clientColIndex];
    if (articul && articul.toString().trim()) {
      articuls.push(articul.toString().trim());
    }
  }

  return articuls;
}

/**
 * АЛЬТЕРНАТИВНЫЙ МЕТОД: Миграция из CSV файла
 * (если старая таблица недоступна через API)
 */
function migrateFromCSV() {
  SpreadsheetApp.getUi().alert(
    'Миграция из CSV',
    'Для миграции из CSV файла:\n\n' +
    '1. Экспортируйте лист "Клиенты" из старой таблицы → CSV\n' +
    '2. Откройте лист Clients в этой таблице\n' +
    '3. Файл → Импорт → Загрузить → Выберите CSV\n' +
    '4. Выберите "Добавить строки в текущий лист"\n\n' +
    'После импорта вручную:\n' +
    '- Проверьте ClientID (должны автоматически сгенерироваться)\n' +
    '- Извлеките Folder IDs из URLs (используйте формулы или вручную)',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * ТЕСТОВАЯ ФУНКЦИЯ: Проверка подключения к старой таблице
 */
function testOldTableConnection() {
  if (!OLD_SPREADSHEET_ID || OLD_SPREADSHEET_ID === '') {
    SpreadsheetApp.getUi().alert('Укажите OLD_SPREADSHEET_ID!');
    return;
  }

  try {
    const oldSs = SpreadsheetApp.openById(OLD_SPREADSHEET_ID);
    const oldClientsSheet = oldSs.getSheetByName('Клиенты');

    if (!oldClientsSheet) {
      throw new Error('Лист "Клиенты" не найден');
    }

    const data = oldClientsSheet.getDataRange().getValues();

    SpreadsheetApp.getUi().alert(
      'Подключение успешно!',
      `✅ Таблица найдена\n` +
      `✅ Лист "Клиенты" найден\n` +
      `✅ Строк данных: ${data.length}\n\n` +
      `Можно запускать миграцию!`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    Logger.log('Заголовки:', data[0]);

  } catch (error) {
    SpreadsheetApp.getUi().alert(
      'Ошибка подключения',
      `Не удалось подключиться к старой таблице:\n\n${error.message}\n\n` +
      `Проверьте:\n` +
      `1. ID таблицы указан правильно\n` +
      `2. У вас есть доступ к этой таблице`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}
