# TASK-001: Fix Duplicate Folder Creation Issue

## Status
✅ Implementation Complete - Ready for Testing

## Priority
High

## Reported Date
2025-12-01

## Implementation Date
2025-12-01

---

## Problem Description

### Current Behavior
При запуске проверки жалоб создаются **дубликаты папок** "скриншоты: жалобы WB" в Google Drive.

**Пример:**
1. День 1: Запустили проверку для кабинета → создалась папка "скриншоты: жалобы WB"
2. Остановили проверку на половине
3. День 2: Запустили проверку того же кабинета → **создалась вторая папка с тем же названием**

### Expected Behavior
Должна использоваться **существующая папка** "скриншоты: жалобы WB", если она уже создана. Дубликаты папок недопустимы.

---

## Root Cause Analysis

### Pre-Task Diagnostics Required
⚠️ **ВАЖНО:** Перед началом работы провести диагностику следующих компонентов:

1. **google-drive-api.js**
   - Функция `findFolder()` - как работает поиск папок
   - Функция `getOrCreateFolder()` - логика создания/получения
   - `folderCache` - проверить механизм кеширования

2. **background.js**
   - Функция `handleSaveScreenshot()` - логика создания структуры папок
   - Переменная `cabinetFolderId` - что она содержит (откуда берется)
   - Путь создания папок - какая структура реализована

3. **google-sheets-api.js**
   - Функция `getCabinets()` - как парсится ссылка на папку Drive
   - Формат данных cabinet.folderId - что именно передается

### Known Issues (на момент создания задачи)

**Issue 1: Folder Cache Volatility**
```javascript
// google-drive-api.js:9
this.folderCache = {}; // Кеш ID папок
```
**Проблема:** Кеш хранится в памяти service worker, который перезапускается:
- Каждые ~30 секунд неактивности Chrome
- При перезагрузке расширения
- При перезагрузке браузера

**Результат:** После перезапуска service worker `folderCache = {}` → поиск папок не находит их → создаются дубликаты.

**Issue 2: Folder Hierarchy Mismatch**
```javascript
// background.js:~315-318
const complaintsSubfolderName = "скриншоты: жалобы WB";
const complaintsFolderId = await googleDriveAPI.getOrCreateFolder(
  token,
  complaintsSubfolderName,
  cabinetFolderId  // ❌ Неверный parentId
);
```

**Контекст:**
- `cabinetFolderId` получается из Google Sheets (столбец со ссылкой на папку)
- **ВАЖНОЕ УТОЧНЕНИЕ:** Эта ссылка уже ведет на папку "Скриншоты" (русское название)
- Следовательно, структура должна быть:
  ```
  Папка "Скриншоты" (из Google Sheets, cabinetFolderId)
  └── скриншоты: жалобы WB
      └── [режим allInOne: файлы] или [режим byArticul: папки артикулов]
  ```

**Текущая реализация создает:**
```
Папка "Скриншоты" (cabinetFolderId)
└── скриншоты: жалобы WB ✅ ПРАВИЛЬНО
```

**Проблема НЕ в структуре**, а в том что:
1. Кеш сбрасывается
2. Поиск не находит существующую папку
3. Создается дубликат

---

## Technical Requirements

### TR-1: Persistent Folder Cache
**Требование:** Кеш папок должен сохраняться между перезапусками service worker.

**Решение:** Использовать `chrome.storage.session` для хранения кеша.

**Детали реализации:**
```javascript
// google-drive-api.js
class GoogleDriveAPI {
  constructor() {
    this.baseUrl = 'https://www.googleapis.com/drive/v3';
    this.uploadUrl = 'https://www.googleapis.com/upload/drive/v3';
    // Убрать: this.folderCache = {};
  }

  async getCachedFolderId(cacheKey) {
    const result = await chrome.storage.session.get(cacheKey);
    return result[cacheKey] || null;
  }

  async setCachedFolderId(cacheKey, folderId) {
    await chrome.storage.session.set({ [cacheKey]: folderId });
  }

  async findFolder(token, folderName, parentId = 'root') {
    const cacheKey = `folder_${parentId}/${folderName}`;

    // Проверяем persistent кеш
    const cachedId = await this.getCachedFolderId(cacheKey);
    if (cachedId) {
      console.log(`✅ Папка "${folderName}" найдена в кеше`);
      return cachedId;
    }

    // Поиск через API...
    // ...

    // Сохраняем в persistent кеш
    if (folderId) {
      await this.setCachedFolderId(cacheKey, folderId);
    }

    return folderId;
  }
}
```

### TR-2: Improved Folder Search Logic
**Требование:** При поиске папки использовать более строгий запрос.

**Проблема:** Текущий запрос может не найти папку если:
- Название содержит специальные символы (`:`, пробелы)
- Папка была создана вручную пользователем

**Решение:**
1. Экранировать спецсимволы в названии папки
2. Добавить поиск по нескольким критериям (name + mimeType + parent + !trashed)

**Детали:**
```javascript
// Текущая реализация (background.js:~23)
const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;

// Улучшенная реализация
const escapedFolderName = folderName.replace(/'/g, "\\'");
const query = `name='${escapedFolderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
```

### TR-3: Verification Before Creation
**Требование:** Перед созданием папки **ВСЕГДА** проверять существование через API, даже если кеш пустой.

**Детали:**
```javascript
async getOrCreateFolder(token, folderName, parentId = 'root') {
  try {
    // 1. Проверяем кеш
    let folderId = await this.getCachedFolderId(`folder_${parentId}/${folderName}`);

    if (folderId) {
      console.log(`✅ [CACHE] Папка "${folderName}" найдена в кеше: ${folderId}`);
      return folderId;
    }

    // 2. Ищем через API (может существовать, но не в кеше)
    folderId = await this.findFolder(token, folderName, parentId);

    if (folderId) {
      console.log(`✅ [API] Папка "${folderName}" найдена через API: ${folderId}`);
      return folderId;
    }

    // 3. Только если не найдена - создаем
    console.log(`➕ Папка "${folderName}" не существует, создаем...`);
    folderId = await this.createFolder(token, folderName, parentId);

    return folderId;
  } catch (error) {
    console.error(`❌ Ошибка получения/создания папки "${folderName}":`, error);
    throw error;
  }
}
```

---

## Implementation Plan

### Phase 1: Pre-Implementation Audit ⚠️ ОБЯЗАТЕЛЬНО
**Цель:** Убедиться что код не изменился с момента создания задачи.

**Чек-лист:**
- [ ] Прочитать `google-drive-api.js` - проверить структуру класса
- [ ] Прочитать `background.js` функцию `handleSaveScreenshot` - проверить логику создания папок
- [ ] Прочитать `google-sheets-api.js` - убедиться что `cabinetFolderId` это папка "Скриншоты"
- [ ] Проверить формат данных из Sheets - какая именно ссылка хранится
- [ ] Проверить логи создания папок - найти паттерн дублирования

### Phase 2: Implement Persistent Cache
**Файлы:** `google-drive-api.js`

**Изменения:**
1. Удалить `this.folderCache = {}`
2. Добавить методы `getCachedFolderId()` и `setCachedFolderId()`
3. Обновить `findFolder()` - использовать `chrome.storage.session`
4. Обновить `createFolder()` - сохранять в session storage

### Phase 3: Improve Folder Search
**Файлы:** `google-drive-api.js`

**Изменения:**
1. Добавить функцию экранирования спецсимволов в названии папки
2. Обновить запрос в `findFolder()` - использовать escaped название

### Phase 4: Add Pre-Creation Check
**Файлы:** `google-drive-api.js`

**Изменения:**
1. Обновить `getOrCreateFolder()` - добавить обязательную проверку через API перед созданием
2. Добавить логирование для отладки:
   - `[CACHE]` - найдено в кеше
   - `[API]` - найдено через API
   - `[CREATE]` - создано новое

### Phase 5: Testing
**Сценарии тестирования:**

**Test Case 1: First Run**
1. Очистить папку "Скриншоты" в Drive
2. Запустить проверку кабинета
3. **Ожидаемый результат:** Создалась папка "скриншоты: жалобы WB"

**Test Case 2: Second Run (Same Session)**
1. Запустить проверку того же кабинета снова
2. **Ожидаемый результат:** Используется существующая папка (кеш)

**Test Case 3: Service Worker Restart**
1. Ждать 5 минут (service worker уснет)
2. Запустить проверку того же кабинета
3. **Ожидаемый результат:** Используется существующая папка (найдена через API)

**Test Case 4: Extension Reload**
1. Перезагрузить расширение
2. Запустить проверку того же кабинета
3. **Ожидаемый результат:** Используется существующая папка (найдена через API)

**Test Case 5: Browser Restart**
1. Перезапустить браузер
2. Запустить проверку того же кабинета
3. **Ожидаемый результат:** Используется существующая папка (найдена через API)

---

## Acceptance Criteria

✅ **AC-1:** При повторном запуске проверки для кабинета НЕ создается дубликат папки "скриншоты: жалобы WB"

✅ **AC-2:** Кеш папок сохраняется между перезапусками service worker

✅ **AC-3:** При перезагрузке расширения/браузера существующие папки находятся через API

✅ **AC-4:** Логи показывают источник найденной папки (CACHE/API/CREATE)

✅ **AC-5:** Все тесты из Phase 5 проходят успешно

---

## Additional Notes

### Important Context
- `cabinetFolderId` из Google Sheets **уже указывает** на папку "Скриншоты"
- Структура папок ПРАВИЛЬНАЯ: `Скриншоты/скриншоты: жалобы WB/`
- Проблема только в дублировании из-за сброса кеша

### Migration Note
После деплоя исправлений:
- Существующие дубликаты папок останутся в Drive
- Нужно **вручную удалить** дубликаты или объединить файлы
- Новые проверки будут использовать первую найденную папку

### Performance Consideration
`chrome.storage.session` имеет лимит:
- Максимум 10 MB данных
- Для хранения ID папок (строки ~50 символов) это НЕ проблема
- Даже 1000 кабинетов × 3 папки = ~150 KB

---

## Related Files
- `google-drive-api.js` - основной файл для изменений
- `background.js` - использует API, минимальные изменения
- `google-sheets-api.js` - проверить формат данных

## Related Issues
- None (первая задача в Tasks)

---

**Created by:** AI Assistant
**Last Updated:** 2025-12-01
