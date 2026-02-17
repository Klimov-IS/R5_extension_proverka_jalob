/**
 * ============================================
 * АВТОМАТИЧЕСКАЯ НАСТРОЙКА ТАБЛИЦЫ RATING5_OPS
 * ============================================
 *
 * Этот скрипт автоматически создаёт структуру Google Sheets
 * для системы отчётности Rating5.
 *
 * ИНСТРУКЦИЯ:
 * 1. Откройте вашу таблицу Rating5_OPS
 * 2. Extensions → Apps Script
 * 3. Удалите всё содержимое редактора
 * 4. Скопируйте весь этот файл и вставьте
 * 5. Нажмите "Сохранить" (Ctrl+S)
 * 6. Выберите функцию setupSheets в выпадающем списке
 * 7. Нажмите "Запустить" (Run)
 * 8. Разрешите доступ (первый раз)
 * 9. Дождитесь завершения (1-2 минуты)
 *
 * РЕЗУЛЬТАТ:
 * - 7 листов с правильными названиями и колонками
 * - Все формулы настроены
 * - Форматирование применено
 * - Data validation добавлена
 */

/**
 * ГЛАВНАЯ ФУНКЦИЯ - Запустите эту
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Logger.log('🚀 Начинаем настройку таблицы Rating5_OPS...');

  // Удаляем дефолтный лист "Лист1" если существует
  try {
    const defaultSheet = ss.getSheetByName('Лист1');
    if (defaultSheet) {
      ss.deleteSheet(defaultSheet);
      Logger.log('✅ Удалён лист "Лист1"');
    }
  } catch (e) {
    Logger.log('ℹ️ Лист "Лист1" не найден');
  }

  // Создаём листы по порядку
  createClientsSheet(ss);
  createArticlesSheet(ss);
  createComplaintsSheet(ss);
  createStatsDailySheet(ss);
  createReportsWeeklySheet(ss);
  createConfigSheet(ss);
  createLogsSheet(ss);

  Logger.log('🎉 Настройка завершена! Таблица готова к использованию.');

  // Показываем сообщение пользователю
  SpreadsheetApp.getUi().alert(
    'Настройка завершена!',
    'Таблица Rating5_OPS успешно настроена.\n\n' +
    'Созданные листы:\n' +
    '✅ Clients\n' +
    '✅ Articles\n' +
    '✅ Complaints\n' +
    '✅ Stats_Daily\n' +
    '✅ Reports_Weekly\n' +
    '✅ Config\n' +
    '✅ Logs\n\n' +
    'Следующий шаг: Миграция данных клиентов из старой таблицы.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * ЛИСТ 1: Clients
 */
function createClientsSheet(ss) {
  Logger.log('📋 Создаём лист Clients...');

  // Удаляем если существует
  let sheet = ss.getSheetByName('Clients');
  if (sheet) {
    ss.deleteSheet(sheet);
  }

  // Создаём новый
  sheet = ss.insertSheet('Clients');

  // Заголовки
  const headers = [
    'ClientID', 'ClientName', 'Status', 'DriveFolderID',
    'ScreenshotsFolderID', 'ReportSheetID', 'CreatedAt', 'UpdatedAt'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Форматирование заголовков
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285F4');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');

  // Замораживаем первую строку
  sheet.setFrozenRows(1);

  // Формула для ClientID (A2)
  sheet.getRange('A2').setFormula('="CLI_" & TEXT(ROW()-1, "000")');

  // Data Validation для Status (C2:C)
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Активен', 'Пауза', 'Потеря'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange('C2:C1000').setDataValidation(statusRule);

  // Форматы колонок
  sheet.getRange('G2:H1000').setNumberFormat('dd.mm.yyyy hh:mm:ss');

  // Ширина колонок
  sheet.setColumnWidth(1, 100); // ClientID
  sheet.setColumnWidth(2, 200); // ClientName
  sheet.setColumnWidth(3, 100); // Status
  sheet.setColumnWidth(4, 250); // DriveFolderID
  sheet.setColumnWidth(5, 250); // ScreenshotsFolderID
  sheet.setColumnWidth(6, 250); // ReportSheetID
  sheet.setColumnWidth(7, 150); // CreatedAt
  sheet.setColumnWidth(8, 150); // UpdatedAt

  Logger.log('✅ Лист Clients создан');
}

/**
 * ЛИСТ 2: Articles
 */
function createArticlesSheet(ss) {
  Logger.log('📋 Создаём лист Articles...');

  let sheet = ss.getSheetByName('Articles');
  if (sheet) ss.deleteSheet(sheet);

  sheet = ss.insertSheet('Articles');

  const headers = [
    'ArticleID', 'ClientID', 'Article', 'ProductName', 'Status', 'CreatedAt'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Форматирование заголовков
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285F4');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  // Формула для ArticleID
  sheet.getRange('A2').setFormula('="ART_" & TEXT(ROW()-1, "00000")');

  // Data Validation для Status
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Активен', 'Архив'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange('E2:E1000').setDataValidation(statusRule);

  // Форматы
  sheet.getRange('F2:F1000').setNumberFormat('dd.mm.yyyy hh:mm:ss');

  // Ширина колонок
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidth(6, 150);

  Logger.log('✅ Лист Articles создан');
}

/**
 * ЛИСТ 3: Complaints
 */
function createComplaintsSheet(ss) {
  Logger.log('📋 Создаём лист Complaints...');

  let sheet = ss.getSheetByName('Complaints');
  if (sheet) ss.deleteSheet(sheet);

  sheet = ss.insertSheet('Complaints');

  const headers = [
    'ComplaintID', 'ClientID', 'Article', 'ReviewDate', 'ReviewText',
    'SubmittedAt', 'CheckedAt', 'WB_Status', 'ScreenshotURL', 'DriveFileID',
    'FileName', 'Source', 'ProcessedBy', 'ErrorMessage', 'CreatedAt', 'UpdatedAt'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Форматирование заголовков
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285F4');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  // Формула для ComplaintID
  sheet.getRange('A2').setFormula('="CMP_" & TEXT(ROW()-1, "000000")');

  // Формула для ScreenshotURL (I2)
  sheet.getRange('I2').setFormula('=IF(J2="", "", "https://drive.google.com/file/d/" & J2 & "/view")');

  // Data Validation для WB_Status
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Одобрено', 'Отклонено', 'На проверке'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange('H2:H10000').setDataValidation(statusRule);

  // Data Validation для Source
  const sourceRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Extension', 'Manual', 'API'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange('L2:L10000').setDataValidation(sourceRule);

  // Форматы
  sheet.getRange('D2:D10000').setNumberFormat('dd.mm.yyyy'); // ReviewDate
  sheet.getRange('F2:G10000').setNumberFormat('dd.mm.yyyy hh:mm:ss'); // SubmittedAt, CheckedAt
  sheet.getRange('O2:P10000').setNumberFormat('dd.mm.yyyy hh:mm:ss'); // CreatedAt, UpdatedAt

  // ScreenshotURL - синий цвет, подчёркивание
  sheet.getRange('I2:I10000').setFontColor('#1155CC').setFontLine('underline');

  // Ширина колонок
  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 300);
  sheet.setColumnWidth(6, 150);
  sheet.setColumnWidth(7, 150);
  sheet.setColumnWidth(8, 120);
  sheet.setColumnWidth(9, 300);
  sheet.setColumnWidth(10, 200);
  sheet.setColumnWidth(11, 200);
  sheet.setColumnWidth(12, 100);
  sheet.setColumnWidth(13, 150);
  sheet.setColumnWidth(14, 200);
  sheet.setColumnWidth(15, 150);
  sheet.setColumnWidth(16, 150);

  Logger.log('✅ Лист Complaints создан');
}

/**
 * ЛИСТ 4: Stats_Daily
 */
function createStatsDailySheet(ss) {
  Logger.log('📋 Создаём лист Stats_Daily...');

  let sheet = ss.getSheetByName('Stats_Daily');
  if (sheet) ss.deleteSheet(sheet);

  sheet = ss.insertSheet('Stats_Daily');

  const headers = [
    'ClientName', 'Article', 'ComplaintDate', 'TotalComplaints',
    'ApprovedComplaints', 'LastCheckDate', 'CheckCount'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Форматирование заголовков
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285F4');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  // Форматы
  sheet.getRange('F2:F10000').setNumberFormat('dd.mm.yyyy hh:mm:ss'); // LastCheckDate

  // Ширина колонок
  sheet.setColumnWidth(1, 200); // ClientName
  sheet.setColumnWidth(2, 120); // Article
  sheet.setColumnWidth(3, 100); // ComplaintDate
  sheet.setColumnWidth(4, 150); // TotalComplaints
  sheet.setColumnWidth(5, 150); // ApprovedComplaints
  sheet.setColumnWidth(6, 150); // LastCheckDate
  sheet.setColumnWidth(7, 120); // CheckCount

  // Центрирование числовых колонок
  sheet.getRange('C2:G10000').setHorizontalAlignment('center');

  Logger.log('✅ Лист Stats_Daily создан');
}

/**
 * ЛИСТ 5: Reports_Weekly
 */
function createReportsWeeklySheet(ss) {
  Logger.log('📋 Создаём лист Reports_Weekly...');

  let sheet = ss.getSheetByName('Reports_Weekly');
  if (sheet) ss.deleteSheet(sheet);

  sheet = ss.insertSheet('Reports_Weekly');

  const headers = [
    'ReportID', 'ClientID', 'WeekStart', 'WeekEnd', 'WeekNumber',
    'ComplaintsSubmitted', 'ComplaintsApproved', 'ComplaintsRejected',
    'ComplaintsPending', 'ApprovalRate', 'ScreenshotsTotal',
    'ArticlesProcessed', 'UpdatedAt'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Форматирование заголовков
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285F4');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  // Формулы (будут работать когда появятся данные)
  // ReportID
  sheet.getRange('A2').setFormula('=IF(C2="", "", "REP_W_" & TEXT(YEAR(C2), "0000") & "_" & TEXT(WEEKNUM(C2), "00"))');

  // WeekNumber
  sheet.getRange('E2').setFormula('=IF(C2="", "", WEEKNUM(C2))');

  // ComplaintsSubmitted
  sheet.getRange('F2').setFormula('=IF(B2="", "", COUNTIFS(Complaints!$B:$B, B2, Complaints!$F:$F, ">="&C2, Complaints!$F:$F, "<="&D2))');

  // ComplaintsApproved
  sheet.getRange('G2').setFormula('=IF(B2="", "", COUNTIFS(Complaints!$B:$B, B2, Complaints!$F:$F, ">="&C2, Complaints!$F:$F, "<="&D2, Complaints!$H:$H, "Одобрено"))');

  // ComplaintsRejected
  sheet.getRange('H2').setFormula('=IF(B2="", "", COUNTIFS(Complaints!$B:$B, B2, Complaints!$F:$F, ">="&C2, Complaints!$F:$F, "<="&D2, Complaints!$H:$H, "Отклонено"))');

  // ComplaintsPending
  sheet.getRange('I2').setFormula('=IF(B2="", "", COUNTIFS(Complaints!$B:$B, B2, Complaints!$F:$F, ">="&C2, Complaints!$F:$F, "<="&D2, Complaints!$H:$H, "На проверке"))');

  // ApprovalRate
  sheet.getRange('J2').setFormula('=IF(F2>0, G2/F2, 0)');

  // ScreenshotsTotal
  sheet.getRange('K2').setFormula('=IF(B2="", "", COUNTIFS(Complaints!$B:$B, B2, Complaints!$F:$F, ">="&C2, Complaints!$F:$F, "<="&D2, Complaints!$I:$I, "<>"))');

  // Форматы
  sheet.getRange('C2:D1000').setNumberFormat('dd.mm.yyyy'); // WeekStart, WeekEnd
  sheet.getRange('J2:J1000').setNumberFormat('0.00%'); // ApprovalRate
  sheet.getRange('M2:M1000').setNumberFormat('dd.mm.yyyy hh:mm:ss'); // UpdatedAt

  // Ширина колонок
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidth(6, 150);
  sheet.setColumnWidth(7, 150);
  sheet.setColumnWidth(8, 150);
  sheet.setColumnWidth(9, 150);
  sheet.setColumnWidth(10, 120);
  sheet.setColumnWidth(11, 150);
  sheet.setColumnWidth(12, 150);
  sheet.setColumnWidth(13, 150);

  Logger.log('✅ Лист Reports_Weekly создан');
}

/**
 * ЛИСТ 6: Config
 */
function createConfigSheet(ss) {
  Logger.log('📋 Создаём лист Config...');

  let sheet = ss.getSheetByName('Config');
  if (sheet) ss.deleteSheet(sheet);

  sheet = ss.insertSheet('Config');

  const headers = ['Key', 'Value'];
  sheet.getRange(1, 1, 1, 2).setValues([headers]);

  // Форматирование заголовков
  const headerRange = sheet.getRange(1, 1, 1, 2);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285F4');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  // Добавляем конфигурационные значения
  const config = [
    ['SPREADSHEET_ID', ss.getId()],
    ['SCREENSHOTS_ROOT_FOLDER', 'WB_Screenshots'],
    ['AUTO_GENERATE_REPORTS', 'TRUE'],
    ['REPORT_GENERATION_TIME', '08:00'],
    ['RETRY_ATTEMPTS', '3'],
    ['ENABLE_LOGGING', 'TRUE']
  ];
  sheet.getRange(2, 1, config.length, 2).setValues(config);

  // Форматирование
  sheet.getRange('A2:A100').setFontWeight('bold');

  // Ширина колонок
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 300);

  Logger.log('✅ Лист Config создан');
}

/**
 * ЛИСТ 7: Logs
 */
function createLogsSheet(ss) {
  Logger.log('📋 Создаём лист Logs...');

  let sheet = ss.getSheetByName('Logs');
  if (sheet) ss.deleteSheet(sheet);

  sheet = ss.insertSheet('Logs');

  const headers = [
    'LogID', 'Timestamp', 'Level', 'Source', 'Action', 'EntityID', 'Message', 'Details'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Форматирование заголовков
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285F4');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  // Формула для LogID
  sheet.getRange('A2').setFormula('=IF(B2="", "", "LOG_" & TEXT(B2, "yyyymmddhhmmss"))');

  // Data Validation для Level
  const levelRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['INFO', 'WARNING', 'ERROR'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange('C2:C10000').setDataValidation(levelRule);

  // Форматы
  sheet.getRange('B2:B10000').setNumberFormat('dd.mm.yyyy hh:mm:ss');

  // Ширина колонок
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 150);
  sheet.setColumnWidth(6, 150);
  sheet.setColumnWidth(7, 300);
  sheet.setColumnWidth(8, 200);

  Logger.log('✅ Лист Logs создан');
}

/**
 * ДОПОЛНИТЕЛЬНАЯ ФУНКЦИЯ: Тестовое логирование
 */
function testLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logsSheet = ss.getSheetByName('Logs');

  if (!logsSheet) {
    SpreadsheetApp.getUi().alert('Лист Logs не найден. Сначала запустите setupSheets()');
    return;
  }

  const testLog = [
    '', // LogID (формула)
    new Date(),
    'INFO',
    'SetupScript',
    'TestLog',
    '',
    'Тестовое сообщение для проверки логирования',
    JSON.stringify({test: true, timestamp: new Date().toISOString()})
  ];

  logsSheet.appendRow(testLog);

  SpreadsheetApp.getUi().alert('Тестовый лог добавлен! Проверьте лист Logs.');
}
