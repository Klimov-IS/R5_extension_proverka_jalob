# TASK 5 — Health Check Mode (Pre-Flight Diagnostics)

You are working in an existing Chrome Extension project for automating complaints checking on Wildberries marketplace.

**Context:** Users often run full complaint checks (which can take 30+ minutes for large cabinets) only to discover that selectors are broken or API access is failing. This wastes time and creates frustration. We need a **pre-flight diagnostic mode** that validates everything in 30 seconds.

---

## Goal
Add a "Health Check" button to the dashboard that performs a quick diagnostic check of all critical systems (selectors, API access, DOM parsing) and provides a detailed report before the user starts a full complaint processing run.

---

## Background: Current User Pain Points

**Problem 1: Selector failures discovered mid-run**
- User starts processing 15,000 complaints
- After 10 minutes, extension fails with "Поле поиска не найдено"
- Must manually inspect elements and update selectors
- Lost 10 minutes + frustration

**Problem 2: API access issues**
- User starts processing, screenshots fail to upload to Google Drive
- Extension continues processing but data is lost
- Must re-run entire check

**Problem 3: No visibility into what's working**
- User doesn't know if extension is healthy before starting
- Cannot proactively fix issues

---

## Solution: Pre-Flight Health Check

Add a **"🔍 Проверить работу расширения"** button to the dashboard that:

1. Validates all CSS selectors on WB page (30 seconds)
2. Tests Google Drive/Sheets API access (10 seconds)
3. Simulates processing 1 complaint without saving data (dry-run mode)
4. Generates detailed diagnostic report with ✅/❌ indicators
5. Provides actionable fix suggestions

**Total time:** ~45 seconds
**User benefit:** Prevents wasted time on failed runs

---

## Scope (must implement)

### Step 1: Add Health Check Button to Dashboard

**File to modify:** `dashboard.html`

**Add button in dashboard controls section (after "Запустить проверку" button):**

```html
<!-- Existing button -->
<button id="startCheckBtn" class="btn-primary">
  🚀 Запустить проверку
</button>

<!-- NEW: Health Check Button -->
<button id="healthCheckBtn" class="btn-secondary">
  🔍 Проверить работу
</button>
```

**CSS styling (add to existing `<style>`):**
```css
.btn-secondary {
  padding: 12px 24px;
  border: 2px solid #667eea;
  background: transparent;
  color: #667eea;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  margin-left: 10px;
}

.btn-secondary:hover {
  background: #667eea;
  color: white;
  transform: translateY(-2px);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

### Step 2: Create Health Check Modal UI

**File to modify:** `dashboard.html`

**Add modal container (before closing `</body>` tag):**

```html
<!-- Health Check Modal -->
<div id="healthCheckModal" class="modal-overlay" style="display: none;">
  <div class="modal-content">
    <div class="modal-header">
      <h2>🔍 Диагностика расширения</h2>
      <button id="closeHealthCheckModal" class="close-btn">✕</button>
    </div>

    <div class="modal-body">
      <!-- Проверка селекторов -->
      <div class="health-check-section">
        <h3>📋 CSS Селекторы Wildberries</h3>
        <div id="selectorsCheckResults">
          <div class="loading-spinner">⏳ Проверяем...</div>
        </div>
      </div>

      <!-- Проверка API -->
      <div class="health-check-section">
        <h3>☁️ Google API доступ</h3>
        <div id="apiCheckResults">
          <div class="loading-spinner">⏳ Проверяем...</div>
        </div>
      </div>

      <!-- Симуляция обработки -->
      <div class="health-check-section">
        <h3>⚙️ Симуляция обработки жалобы</h3>
        <div id="simulationResults">
          <div class="loading-spinner">⏳ Проверяем...</div>
        </div>
      </div>

      <!-- Итоговый статус -->
      <div class="health-check-summary" id="healthCheckSummary" style="display: none;">
        <!-- Заполняется динамически -->
      </div>
    </div>

    <div class="modal-footer">
      <button id="copyHealthReport" class="btn-secondary" style="display: none;">
        📋 Скопировать отчет
      </button>
      <button id="closeHealthCheckBtn" class="btn-primary">
        Закрыть
      </button>
    </div>
  </div>
</div>
```

**CSS for modal (add to existing `<style>`):**
```css
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: white;
  border-radius: 16px;
  padding: 0;
  max-width: 700px;
  width: 90%;
  max-height: 85vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 20px 25px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #333;
}

.modal-body {
  padding: 20px 25px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 15px 25px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.health-check-section {
  margin-bottom: 25px;
}

.health-check-section h3 {
  font-size: 16px;
  margin: 0 0 12px 0;
  color: #555;
}

.check-item {
  display: flex;
  align-items: center;
  padding: 10px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 14px;
}

.check-item.success {
  background: #ecfdf5;
  border-left: 4px solid #10b981;
}

.check-item.error {
  background: #fef2f2;
  border-left: 4px solid #ef4444;
}

.check-item.warning {
  background: #fffbeb;
  border-left: 4px solid #f59e0b;
}

.check-icon {
  font-size: 18px;
  margin-right: 10px;
}

.check-message {
  flex: 1;
}

.check-detail {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.health-check-summary {
  margin-top: 20px;
  padding: 20px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
}

.health-check-summary.all-good {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #065f46;
}

.health-check-summary.has-issues {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  color: #991b1b;
}

.loading-spinner {
  text-align: center;
  padding: 20px;
  color: #999;
}
```

---

### Step 3: Implement Health Check Logic in Dashboard

**File to modify:** `dashboard.js`

**Add event listener for health check button:**

```javascript
// В функции setupEventListeners()
document.getElementById('healthCheckBtn')?.addEventListener('click', runHealthCheck);
document.getElementById('closeHealthCheckModal')?.addEventListener('click', closeHealthCheckModal);
document.getElementById('closeHealthCheckBtn')?.addEventListener('click', closeHealthCheckModal);
document.getElementById('copyHealthReport')?.addEventListener('click', copyHealthReportToClipboard);
```

**Implement runHealthCheck() function:**

```javascript
async function runHealthCheck() {
  console.log('🔍 [HEALTH CHECK] Запуск диагностики...');

  // Показываем модальное окно
  document.getElementById('healthCheckModal').style.display = 'flex';

  // Сбрасываем состояние
  resetHealthCheckUI();

  try {
    // Шаг 1: Проверяем что открыта страница WB
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('wildberries.ru')) {
      showHealthCheckError('Откройте страницу Wildberries в активной вкладке');
      return;
    }

    // Шаг 2: Проверяем CSS селекторы
    const selectorsResult = await checkSelectors(tab.id);
    displaySelectorsResults(selectorsResult);

    // Шаг 3: Проверяем Google API
    const apiResult = await checkGoogleAPI();
    displayAPIResults(apiResult);

    // Шаг 4: Симуляция обработки жалобы
    const simulationResult = await simulateComplaintProcessing(tab.id);
    displaySimulationResults(simulationResult);

    // Шаг 5: Итоговый отчет
    const summary = generateHealthSummary(selectorsResult, apiResult, simulationResult);
    displayHealthSummary(summary);

  } catch (error) {
    console.error('❌ [HEALTH CHECK] Ошибка:', error);
    showHealthCheckError(error.message);
  }
}

function resetHealthCheckUI() {
  document.getElementById('selectorsCheckResults').innerHTML = '<div class="loading-spinner">⏳ Проверяем...</div>';
  document.getElementById('apiCheckResults').innerHTML = '<div class="loading-spinner">⏳ Проверяем...</div>';
  document.getElementById('simulationResults').innerHTML = '<div class="loading-spinner">⏳ Проверяем...</div>';
  document.getElementById('healthCheckSummary').style.display = 'none';
  document.getElementById('copyHealthReport').style.display = 'none';
}

function closeHealthCheckModal() {
  document.getElementById('healthCheckModal').style.display = 'none';
}
```

---

### Step 4: Implement Selector Validation

**File to modify:** `dashboard.js`

```javascript
async function checkSelectors(tabId) {
  console.log('📋 [HEALTH CHECK] Проверяем селекторы WB...');

  // Отправляем сообщение в content script для проверки селекторов
  const response = await chrome.tabs.sendMessage(tabId, {
    action: 'validateSelectors'
  });

  return response;
}

function displaySelectorsResults(result) {
  const container = document.getElementById('selectorsCheckResults');

  if (!result || result.error) {
    container.innerHTML = `
      <div class="check-item error">
        <span class="check-icon">❌</span>
        <div class="check-message">
          Ошибка проверки селекторов
          <div class="check-detail">${result?.error || 'Content script не отвечает'}</div>
        </div>
      </div>
    `;
    return;
  }

  let html = '';

  for (const item of result.selectors) {
    const statusClass = item.found ? 'success' : 'error';
    const statusIcon = item.found ? '✅' : '❌';
    const warningIcon = item.count > 10 ? ' ⚠️' : '';

    html += `
      <div class="check-item ${statusClass}">
        <span class="check-icon">${statusIcon}</span>
        <div class="check-message">
          <strong>${item.name}</strong>: ${item.found ? 'найден' : 'НЕ НАЙДЕН'}${warningIcon}
          <div class="check-detail">
            Селектор: ${item.selector}
            ${item.found ? ` (найдено элементов: ${item.count})` : ''}
            ${item.warning ? ` — ${item.warning}` : ''}
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}
```

---

### Step 5: Implement Content Script Handler

**File to modify:** `content.js`

**Add message listener for validateSelectors action:**

```javascript
// В существующем chrome.runtime.onMessage.addListener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ... existing handlers ...

  // NEW: Health Check - Validate Selectors
  if (message.action === "validateSelectors") {
    const results = validateAllSelectors();
    sendResponse(results);
    return true;
  }

  // ... existing handlers ...
});
```

**Implement validateAllSelectors() function:**

```javascript
/**
 * Health Check: Проверяет что все селекторы из SELECTORS объекта находят элементы
 * @returns {Object} Результаты валидации всех селекторов
 */
function validateAllSelectors() {
  console.log('🔍 [HEALTH CHECK] Валидация селекторов...');

  const results = {
    selectors: [],
    totalCount: 0,
    foundCount: 0,
    brokenCount: 0
  };

  for (const [name, selector] of Object.entries(SELECTORS)) {
    const elements = document.querySelectorAll(selector);
    const found = elements.length > 0;

    results.selectors.push({
      name: name,
      selector: selector,
      found: found,
      count: elements.length,
      warning: elements.length > 10 ? 'Слишком общий селектор (может найти не тот элемент)' : null
    });

    results.totalCount++;
    if (found) {
      results.foundCount++;
    } else {
      results.brokenCount++;
    }
  }

  console.log(`✅ [HEALTH CHECK] Селекторы: ${results.foundCount}/${results.totalCount} работают`);

  return results;
}
```

---

### Step 6: Implement Google API Check

**File to modify:** `dashboard.js`

```javascript
async function checkGoogleAPI() {
  console.log('☁️ [HEALTH CHECK] Проверяем Google API...');

  const results = {
    auth: { status: 'unknown', message: '' },
    drive: { status: 'unknown', message: '' },
    sheets: { status: 'unknown', message: '' }
  };

  try {
    // 1. Проверка авторизации
    const authResponse = await chrome.runtime.sendMessage({ action: 'getUserEmail' });

    if (authResponse.email) {
      results.auth.status = 'success';
      results.auth.message = `Авторизован: ${authResponse.email}`;
    } else {
      results.auth.status = 'error';
      results.auth.message = 'Не авторизован в Google';
      return results; // Если нет авторизации, остальное проверять бессмысленно
    }

    // 2. Проверка доступа к Google Drive
    try {
      const driveResponse = await chrome.runtime.sendMessage({
        action: 'testGoogleDriveAccess'
      });

      if (driveResponse.success) {
        results.drive.status = 'success';
        results.drive.message = 'Доступ к Google Drive работает';
      } else {
        results.drive.status = 'error';
        results.drive.message = driveResponse.error || 'Ошибка доступа к Drive';
      }
    } catch (error) {
      results.drive.status = 'error';
      results.drive.message = error.message;
    }

    // 3. Проверка доступа к Google Sheets
    try {
      const sheetsResponse = await chrome.runtime.sendMessage({
        action: 'testGoogleSheetsAccess',
        spreadsheetId: document.getElementById('spreadsheetId')?.value
      });

      if (sheetsResponse.success) {
        results.sheets.status = 'success';
        results.sheets.message = 'Доступ к Google Sheets работает';
      } else {
        results.sheets.status = 'error';
        results.sheets.message = sheetsResponse.error || 'Ошибка доступа к Sheets';
      }
    } catch (error) {
      results.sheets.status = 'error';
      results.sheets.message = error.message;
    }

  } catch (error) {
    console.error('❌ [HEALTH CHECK] Ошибка проверки API:', error);
    results.auth.status = 'error';
    results.auth.message = error.message;
  }

  return results;
}

function displayAPIResults(results) {
  const container = document.getElementById('apiCheckResults');

  let html = '';

  // 1. Авторизация
  const authClass = results.auth.status === 'success' ? 'success' : 'error';
  const authIcon = results.auth.status === 'success' ? '✅' : '❌';
  html += `
    <div class="check-item ${authClass}">
      <span class="check-icon">${authIcon}</span>
      <div class="check-message">
        <strong>Авторизация Google</strong>
        <div class="check-detail">${results.auth.message}</div>
      </div>
    </div>
  `;

  // 2. Google Drive
  if (results.drive.status !== 'unknown') {
    const driveClass = results.drive.status === 'success' ? 'success' : 'error';
    const driveIcon = results.drive.status === 'success' ? '✅' : '❌';
    html += `
      <div class="check-item ${driveClass}">
        <span class="check-icon">${driveIcon}</span>
        <div class="check-message">
          <strong>Google Drive API</strong>
          <div class="check-detail">${results.drive.message}</div>
        </div>
      </div>
    `;
  }

  // 3. Google Sheets
  if (results.sheets.status !== 'unknown') {
    const sheetsClass = results.sheets.status === 'success' ? 'success' : 'error';
    const sheetsIcon = results.sheets.status === 'success' ? '✅' : '❌';
    html += `
      <div class="check-item ${sheetsClass}">
        <span class="check-icon">${sheetsIcon}</span>
        <div class="check-message">
          <strong>Google Sheets API</strong>
          <div class="check-detail">${results.sheets.message}</div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}
```

---

### Step 7: Implement Background Script API Test Handlers

**File to modify:** `background.js`

```javascript
// В существующем chrome.runtime.onMessage.addListener

// NEW: Health Check - Test Google Drive Access
if (message.action === "testGoogleDriveAccess") {
  (async () => {
    try {
      const token = await getAuthToken();

      // Простой тест: получаем информацию о пользователе
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        sendResponse({ success: true });
      } else {
        const error = await response.text();
        sendResponse({ success: false, error: `HTTP ${response.status}: ${error}` });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}

// NEW: Health Check - Test Google Sheets Access
if (message.action === "testGoogleSheetsAccess") {
  (async () => {
    try {
      const token = await getAuthToken();
      const spreadsheetId = message.spreadsheetId;

      if (!spreadsheetId) {
        sendResponse({ success: false, error: 'ID таблицы не указан' });
        return;
      }

      // Тест: читаем метаданные таблицы
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        sendResponse({ success: true, data: data.properties });
      } else {
        const error = await response.text();
        sendResponse({ success: false, error: `HTTP ${response.status}: ${error}` });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true;
}
```

---

### Step 8: Implement Dry-Run Simulation

**File to modify:** `dashboard.js`

```javascript
async function simulateComplaintProcessing(tabId) {
  console.log('⚙️ [HEALTH CHECK] Симуляция обработки жалобы...');

  try {
    // Отправляем сообщение в content script для симуляции
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'dryRunComplaint',
      articul: '123456789' // Тестовый артикул
    });

    return response;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function displaySimulationResults(result) {
  const container = document.getElementById('simulationResults');

  if (!result || !result.success) {
    container.innerHTML = `
      <div class="check-item error">
        <span class="check-icon">❌</span>
        <div class="check-message">
          Симуляция провалилась
          <div class="check-detail">${result?.error || 'Неизвестная ошибка'}</div>
        </div>
      </div>
    `;
    return;
  }

  let html = '';

  // Показываем результаты каждого этапа
  for (const step of result.steps) {
    const statusClass = step.success ? 'success' : 'error';
    const statusIcon = step.success ? '✅' : '❌';

    html += `
      <div class="check-item ${statusClass}">
        <span class="check-icon">${statusIcon}</span>
        <div class="check-message">
          <strong>${step.name}</strong>
          <div class="check-detail">${step.message}</div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}
```

**File to modify:** `content.js`

```javascript
// В chrome.runtime.onMessage.addListener

// NEW: Health Check - Dry Run (симуляция обработки жалобы без сохранения)
if (message.action === "dryRunComplaint") {
  (async () => {
    console.log('⚙️ [DRY RUN] Запуск симуляции...');

    const results = {
      success: true,
      steps: []
    };

    try {
      // Шаг 1: Найти поле поиска
      const searchInput = document.querySelector(SELECTORS.searchInput);
      results.steps.push({
        name: 'Поиск элемента ввода',
        success: !!searchInput,
        message: searchInput ? 'Поле поиска найдено' : 'Поле поиска НЕ найдено'
      });

      if (!searchInput) {
        results.success = false;
        sendResponse(results);
        return;
      }

      // Шаг 2: Найти таблицу
      const tableBody = document.querySelector(SELECTORS.tableBody);
      results.steps.push({
        name: 'Поиск таблицы с жалобами',
        success: !!tableBody,
        message: tableBody ? 'Таблица найдена' : 'Таблица НЕ найдена'
      });

      if (!tableBody) {
        results.success = false;
        sendResponse(results);
        return;
      }

      // Шаг 3: Попробовать спарсить строки таблицы
      const rows = tableBody.querySelectorAll('tr, [data-name="TemplateTableRow"]');
      results.steps.push({
        name: 'Парсинг строк таблицы',
        success: rows.length > 0,
        message: rows.length > 0 ? `Найдено ${rows.length} строк` : 'Строки НЕ найдены'
      });

      // Шаг 4: Попробовать спарсить дату из первой строки
      if (rows.length > 0) {
        const firstRow = rows[0];
        const dateElement = firstRow.querySelector(SELECTORS.dateText);
        const dateText = dateElement?.textContent?.trim();

        results.steps.push({
          name: 'Парсинг даты из строки',
          success: !!dateText,
          message: dateText ? `Дата найдена: "${dateText}"` : 'Дата НЕ найдена'
        });
      }

      // Шаг 5: Проверить что sidebar может открыться
      const firstClickable = tableBody.querySelector('tr, [data-name="TemplateTableRow"]');
      results.steps.push({
        name: 'Проверка кликабельности строки',
        success: !!firstClickable,
        message: firstClickable ? 'Строка кликабельна' : 'Строка НЕ кликабельна'
      });

      console.log('✅ [DRY RUN] Симуляция завершена');
      sendResponse(results);

    } catch (error) {
      console.error('❌ [DRY RUN] Ошибка:', error);
      results.success = false;
      results.error = error.message;
      sendResponse(results);
    }
  })();
  return true;
}
```

---

### Step 9: Generate Health Summary

**File to modify:** `dashboard.js`

```javascript
function generateHealthSummary(selectorsResult, apiResult, simulationResult) {
  const issues = [];

  // Проверяем селекторы
  if (selectorsResult.brokenCount > 0) {
    issues.push(`${selectorsResult.brokenCount} селекторов не работают`);
  }

  // Проверяем API
  if (apiResult.auth.status !== 'success') {
    issues.push('Нет авторизации Google');
  }
  if (apiResult.drive.status === 'error') {
    issues.push('Ошибка доступа к Google Drive');
  }
  if (apiResult.sheets.status === 'error') {
    issues.push('Ошибка доступа к Google Sheets');
  }

  // Проверяем симуляцию
  if (!simulationResult.success) {
    issues.push('Симуляция обработки провалилась');
  }

  return {
    allGood: issues.length === 0,
    issues: issues,
    selectorsOk: selectorsResult.brokenCount === 0,
    apiOk: apiResult.auth.status === 'success' && apiResult.drive.status === 'success',
    simulationOk: simulationResult.success
  };
}

function displayHealthSummary(summary) {
  const container = document.getElementById('healthCheckSummary');

  if (summary.allGood) {
    container.className = 'health-check-summary all-good';
    container.innerHTML = `
      ✅ Все системы работают корректно!<br>
      Можно запускать полную проверку жалоб.
    `;
  } else {
    container.className = 'health-check-summary has-issues';
    container.innerHTML = `
      ❌ Обнаружены проблемы:<br>
      ${summary.issues.map(issue => `• ${issue}`).join('<br>')}
      <br><br>
      Рекомендуется исправить проблемы перед запуском проверки.
    `;
  }

  container.style.display = 'block';
  document.getElementById('copyHealthReport').style.display = 'inline-block';
}
```

---

### Step 10: Copy Report to Clipboard

**File to modify:** `dashboard.js`

```javascript
async function copyHealthReportToClipboard() {
  // Собираем весь текст из модального окна
  const selectorsHTML = document.getElementById('selectorsCheckResults').innerText;
  const apiHTML = document.getElementById('apiCheckResults').innerText;
  const simulationHTML = document.getElementById('simulationResults').innerText;
  const summaryHTML = document.getElementById('healthCheckSummary').innerText;

  const report = `
📋 Health Check Report - ${new Date().toLocaleString('ru-RU')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CSS СЕЛЕКТОРЫ WILDBERRIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${selectorsHTML}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
☁️ GOOGLE API ДОСТУП
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${apiHTML}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ СИМУЛЯЦИЯ ОБРАБОТКИ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${simulationHTML}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 ИТОГ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${summaryHTML}
  `.trim();

  try {
    await navigator.clipboard.writeText(report);

    // Показываем уведомление
    const btn = document.getElementById('copyHealthReport');
    const originalText = btn.textContent;
    btn.textContent = '✅ Скопировано!';
    btn.disabled = true;

    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('❌ Ошибка копирования:', error);
    alert('Не удалось скопировать отчет в буфер обмена');
  }
}
```

---

## Non-goals (explicitly do NOT implement)
- Do NOT fix broken selectors automatically (user must update manually or use TASK-004 DevTools Helper)
- Do NOT integrate with backend API (это будет в TASK-006)
- Do NOT modify core automation logic in `content.js`
- Do NOT save health check results to database

---

## Required documentation

After implementation, update:

1. **README.md** - Add Troubleshooting section:
   ```markdown
   ### Как проверить что расширение работает корректно?

   Перед запуском полной проверки жалоб рекомендуется выполнить диагностику:

   1. Откройте dashboard расширения
   2. Нажмите кнопку **"🔍 Проверить работу"**
   3. Дождитесь завершения проверки (30-45 секунд)
   4. Убедитесь что все пункты отмечены ✅

   Если есть ошибки ❌:
   - **Селекторы не работают** → Обновите селекторы (см. Tasks/TASK-003)
   - **Нет авторизации Google** → Войдите в Google Drive через popup
   - **Ошибка доступа к API** → Проверьте права доступа к таблице
   ```

2. **manifest.json** - Update version to 2.5.0

3. **Create CHANGELOG entry:**
   ```markdown
   ### v2.5.0 (2025-01-XX) - Health Check Mode
   - ✅ Добавлена кнопка "🔍 Проверить работу" в dashboard
   - 🔍 Проверка всех CSS селекторов перед запуском
   - ☁️ Проверка доступа к Google Drive/Sheets API
   - ⚙️ Симуляция обработки жалобы (dry-run mode)
   - 📋 Копирование детального отчета в буфер обмена
   - ⏱️ Время проверки: ~45 секунд
   ```

---

## Definition of Done
- [ ] Added "🔍 Проверить работу" button to dashboard.html
- [ ] Created health check modal with 3 sections (selectors, API, simulation)
- [ ] Implemented `validateAllSelectors()` in content.js
- [ ] Implemented `checkGoogleAPI()` in dashboard.js
- [ ] Implemented `testGoogleDriveAccess` and `testGoogleSheetsAccess` handlers in background.js
- [ ] Implemented dry-run simulation in content.js
- [ ] Implemented health summary generation
- [ ] Implemented copy report to clipboard
- [ ] Updated README.md with troubleshooting section
- [ ] Tested on real WB page with working selectors
- [ ] Tested on WB page with broken selectors (verify error detection)
- [ ] Tested with revoked Google API access (verify error detection)
- [ ] Modal UI is responsive and accessible

---

## Output format for implementation

### Phase 1: UI Components
1. Add health check button to dashboard.html
2. Create modal overlay with loading states
3. Add CSS styling for modal and check items

### Phase 2: Selector Validation
1. Implement `validateAllSelectors()` in content.js
2. Implement message handler in dashboard.js
3. Display results in modal

### Phase 3: API Validation
1. Implement `checkGoogleAPI()` in dashboard.js
2. Add test handlers in background.js
3. Display results in modal

### Phase 4: Dry-Run Simulation
1. Implement dry-run mode in content.js
2. Display simulation results in modal
3. Generate health summary

### Phase 5: Polish
1. Add copy to clipboard functionality
2. Update documentation
3. Test all scenarios

---

**Priority:** HIGH (most requested by users)
**Estimated effort:** 2-3 hours
**Dependencies:** None (uses existing APIs)
**Next task:** TASK-004 (DevTools Helper for easier selector updates)

---

## Example user workflow

```
User: Хочу запустить проверку 15,000 жалоб

Step 1: Открываю dashboard → нажимаю "🔍 Проверить работу"
Step 2: Жду 45 секунд пока проверяется все
Step 3: Вижу результат:
        ✅ 10/10 селекторов работают
        ✅ Google Drive доступен
        ✅ Google Sheets доступен
        ✅ Симуляция прошла успешно

Step 4: Уверенно нажимаю "🚀 Запустить проверку" — знаю что все работает!

Time saved: 0 minutes wasted on failed runs
Peace of mind: ✅
```
