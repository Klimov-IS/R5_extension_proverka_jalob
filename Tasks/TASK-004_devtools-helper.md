# TASK 4 — DevTools Helper for Selector Automation

You are working in an existing Chrome Extension project for automating complaints checking on Wildberries marketplace.

**Context:** When Wildberries updates their UI, updating selectors manually takes 2-3 hours (inspect elements, copy HTML, analyze structure, update code). This task automates 80% of that work, reducing time to 15-20 minutes.

---

## Goal
Create a developer utility that automates the process of finding, exporting, and validating CSS selectors when Wildberries UI changes.

---

## Background: Current Manual Process (Problems)

**When selectors break, developer must:**
1. Open DevTools on WB page
2. Manually inspect each of 10 elements
3. Copy HTML to separate files (e.g., `html/Элемент.html`)
4. Analyze HTML structure to find stable selectors
5. Update `SELECTORS` object in `content.js`
6. Test each selector individually

**Time:** 2-3 hours
**Error-prone:** Easy to miss elements or copy incomplete HTML

---

## Solution: DevTools Helper Console API

Create a **developer-only utility** that provides console commands for:

1. **Automatic HTML export** - one command exports all 10 elements to files
2. **Selector validation** - checks if all selectors from `SELECTORS` object work on current page
3. **AI-powered selector generation** - suggests new selectors for broken elements
4. **Diff comparison** - compares old vs new HTML structure

---

## Scope (must implement)

### Step 1: Create DevTools Helper Script

**File to create:** `src/devtools-helper.js`

**Requirements:**
- Only loads in development mode (check `chrome.runtime.getManifest().version` contains "-dev")
- Injects global `window.WB` object with helper methods
- Does NOT affect production builds

**Implementation:**
```javascript
// Проверка dev mode
if (chrome.runtime.getManifest().version.includes('-dev')) {
  console.log('🛠️ [DevTools Helper] Загружен (dev mode)');

  window.WB = {
    exportSelectors: exportAllSelectorsToHTML,
    validateSelectors: validateCurrentSelectors,
    generateFixes: generateSelectorFixes,
    diffHTML: compareOldAndNewHTML,
    version: '1.0.0'
  };

  console.log('✅ Доступные команды:', Object.keys(window.WB));
}
```

---

### Step 2: Implement `WB.exportSelectors()`

**Purpose:** Автоматически находит все элементы из `SELECTORS` объекта и экспортирует их HTML в файлы.

**Usage:**
```javascript
// В DevTools Console на странице WB
WB.exportSelectors()
```

**Expected output:**
```
🔍 Экспортируем HTML элементов...
✅ searchInput → экспортирован (127 bytes)
✅ tableBody → экспортирован (45231 bytes) ⚠️ Большой файл
✅ dateText → экспортирован (89 bytes)
...
📦 Готово! 9/10 элементов экспортированы.
❌ Не найдены: pagination (селектор устарел)

📥 Скачать ZIP архив с HTML файлами
[Download wb-selectors-export-2025-01-13.zip]
```

**Implementation details:**

1. **Find elements using current selectors:**
   ```javascript
   async function exportAllSelectorsToHTML() {
     const SELECTORS = {
       searchInput: 'input[name="feedback-search-name-input"]',
       tableBody: '[data-testid="Base-table-body"]',
       // ... остальные селекторы из content.js
     };

     const results = {};

     for (const [name, selector] of Object.entries(SELECTORS)) {
       const element = document.querySelector(selector);

       if (element) {
         // Получаем HTML элемента + 2-3 родительских элемента
         const html = getElementWithParents(element, 3);
         results[name] = {
           found: true,
           html: html,
           size: html.length,
           selector: selector
         };
       } else {
         results[name] = { found: false, selector: selector };
       }
     }

     // Генерируем ZIP архив с файлами
     const zip = createZipArchive(results);
     downloadZip(zip, `wb-selectors-export-${getFormattedDate()}.zip`);

     return results;
   }
   ```

2. **Extract element with parents:**
   ```javascript
   function getElementWithParents(element, levels = 3) {
     let current = element;

     // Поднимаемся на N уровней вверх
     for (let i = 0; i < levels; i++) {
       if (current.parentElement) {
         current = current.parentElement;
       }
     }

     // Форматируем HTML (prettify)
     return formatHTML(current.outerHTML);
   }
   ```

3. **Create downloadable ZIP:**
   - Use JSZip library (add to `manifest.json` web_accessible_resources)
   - Create files: `Строка поиска.html`, `Таблица с жалобами.html`, etc.
   - Trigger browser download

---

### Step 3: Implement `WB.validateSelectors()`

**Purpose:** Проверяет что все селекторы из `SELECTORS` объекта находят элементы на текущей странице.

**Usage:**
```javascript
WB.validateSelectors()
```

**Expected output:**
```
🔍 Проверяем селекторы на странице WB...

✅ searchInput: найден (input[name="feedback-search-name-input"])
✅ tableBody: найден ([data-testid="Base-table-body"])
✅ dateText: найден ([data-name="Text"]) ⚠️ Найдено 45 элементов (слишком общий селектор!)
❌ pagination: НЕ НАЙДЕН ([class*="Pagination-buttons__"])
✅ sidebar: найден ([class*="Sidebar-panel__"])

📊 Результат: 8/10 селекторов работают корректно
⚠️ Внимание: 1 селектор слишком общий (может найти не тот элемент)
❌ Требуется фикс: 2 селектора не работают
```

**Implementation:**
```javascript
function validateCurrentSelectors() {
  const SELECTORS = { /* ... */ };
  const results = [];

  for (const [name, selector] of Object.entries(SELECTORS)) {
    const elements = document.querySelectorAll(selector);

    results.push({
      name: name,
      selector: selector,
      found: elements.length > 0,
      count: elements.length,
      warning: elements.length > 10 ? 'Слишком общий селектор' : null
    });
  }

  // Форматированный вывод в консоль
  printValidationResults(results);

  return results;
}
```

---

### Step 4: Implement `WB.generateFixes()`

**Purpose:** Для сломанных селекторов предлагает новые варианты на основе анализа DOM.

**Usage:**
```javascript
WB.generateFixes()
```

**Expected output:**
```
🤖 Анализируем DOM и генерируем фиксы для сломанных селекторов...

❌ pagination: [class*="Pagination-buttons__"] (не найден)
   🔍 Поиск альтернатив...
   ✅ Вариант 1: [data-testid="pagination-controls"] (уникален)
   ✅ Вариант 2: nav[aria-label*="pagination"] (уникален)
   ⚠️ Вариант 3: .PaginationV2__wrapper (hash-based, может сломаться)

   💡 Рекомендуется: [data-testid="pagination-controls"]

❌ statusChip: .Chips__text--textAlign-center__TGTXpsZKjK (не найден)
   🔍 Поиск альтернатив...
   ✅ Вариант 1: [class*="Chips__text"][class*="textAlign-center"] (уникален)
   ✅ Вариант 2: .ChipStatus span.text (уникален)

   💡 Рекомендуется: [class*="Chips__text"][class*="textAlign-center"]

📋 Скопировать предложенные фиксы в буфер обмена?
[Копировать JS объект] [Копировать таблицу MD]
```

**Implementation:**

1. **Find broken selectors:**
   ```javascript
   async function generateSelectorFixes() {
     const validation = validateCurrentSelectors();
     const broken = validation.filter(v => !v.found);

     if (broken.length === 0) {
       console.log('✅ Все селекторы работают корректно!');
       return;
     }

     const fixes = [];

     for (const item of broken) {
       const alternatives = await findAlternativeSelectors(item.name);
       fixes.push({ name: item.name, alternatives });
     }

     printFixSuggestions(fixes);
     return fixes;
   }
   ```

2. **AI-powered selector generation:**
   ```javascript
   async function findAlternativeSelectors(elementName) {
     // Стратегия 1: Поиск по семантическим атрибутам
     const semanticSelectors = findBySemanticAttributes(elementName);

     // Стратегия 2: Поиск по структуре DOM
     const structuralSelectors = findByDOMStructure(elementName);

     // Стратегия 3: Поиск по текстовому контенту (для кнопок, статусов)
     const contentSelectors = findByTextContent(elementName);

     // Оцениваем стабильность каждого селектора
     return rankSelectors([
       ...semanticSelectors,
       ...structuralSelectors,
       ...contentSelectors
     ]);
   }
   ```

3. **Selector stability scoring:**
   ```javascript
   function rankSelectors(selectors) {
     return selectors.map(sel => {
       let score = 0;

       // data-* атрибуты: +10
       if (sel.includes('[data-')) score += 10;

       // Семантические атрибуты: +8
       if (sel.includes('[aria-') || sel.includes('[role=')) score += 8;

       // Атрибут name/id: +7
       if (sel.includes('[name=') || sel.includes('#')) score += 7;

       // Префикс класса [class*=""]: +5
       if (sel.includes('[class*=')) score += 5;

       // Hash-based класс: -5
       if (/\w{10,}/.test(sel)) score -= 5;

       // Проверка уникальности
       const count = document.querySelectorAll(sel).length;
       if (count === 1) score += 10;
       if (count > 10) score -= 5;

       return { selector: sel, score, count };
     }).sort((a, b) => b.score - a.score);
   }
   ```

---

### Step 5: Implement `WB.diffHTML()`

**Purpose:** Сравнивает старый HTML (из файлов `html/*.html`) с текущим DOM, показывает что изменилось.

**Usage:**
```javascript
// Загрузить старый HTML из файла
const oldHTML = `<div class="Old-class__abc123">...</div>`;
WB.diffHTML('searchInput', oldHTML)
```

**Expected output:**
```
📊 Сравнение HTML структуры для searchInput:

🔴 Удалено:
  - class="Simple-input__field__zjmb3BTXOH"
  - placeholder="Поиск по артикулам"

🟢 Добавлено:
  - name="feedback-search-name-input"
  - class="SearchInput__field__abc123def"
  - data-testid="search-input-field"

🟡 Изменено:
  - type: "text" → "search"

💡 Рекомендация: Используйте name="feedback-search-name-input" (стабильный атрибут)
```

**Implementation:**
```javascript
function diffHTML(elementName, oldHTML) {
  const currentElement = document.querySelector(SELECTORS[elementName]);

  if (!currentElement) {
    console.error(`❌ Элемент ${elementName} не найден на странице`);
    return;
  }

  const diff = {
    removed: [],
    added: [],
    changed: []
  };

  // Парсим атрибуты старого и нового элементов
  const oldAttrs = parseAttributes(oldHTML);
  const newAttrs = parseAttributes(currentElement.outerHTML);

  // Находим удаленные атрибуты
  for (const attr of oldAttrs) {
    if (!newAttrs.find(a => a.name === attr.name)) {
      diff.removed.push(attr);
    }
  }

  // Находим добавленные атрибуты
  for (const attr of newAttrs) {
    if (!oldAttrs.find(a => a.name === attr.name)) {
      diff.added.push(attr);
    }
  }

  // Находим измененные атрибуты
  for (const newAttr of newAttrs) {
    const oldAttr = oldAttrs.find(a => a.name === newAttr.name);
    if (oldAttr && oldAttr.value !== newAttr.value) {
      diff.changed.push({ name: newAttr.name, old: oldAttr.value, new: newAttr.value });
    }
  }

  printDiff(diff);
  return diff;
}
```

---

## Step 6: Update manifest.json

**Add devtools-helper.js to content_scripts (dev mode only):**

```json
{
  "content_scripts": [
    {
      "matches": ["*://*.wildberries.ru/*"],
      "js": [
        "deduplication-cache.js",
        "content.js",
        "devtools-helper.js"  // Добавляем только в dev build
      ],
      "run_at": "document_idle"
    }
  ]
}
```

**Note:** Create separate build process for dev vs production:
- Dev build: includes `devtools-helper.js`, version = "2.3.1-dev"
- Production build: excludes `devtools-helper.js`, version = "2.3.1"

---

## Step 7: Create Documentation

**File to create:** `docs/SELECTOR_MAINTENANCE.md`

**Content:**
```markdown
# Selector Maintenance Guide

## Быстрое исправление селекторов (15-20 минут)

### 1. Обнаружение проблемы
Расширение сообщает: "Поле поиска не найдено! Возможно, изменились селекторы WB."

### 2. Экспорт HTML элементов
1. Откройте страницу жалоб WB
2. Откройте DevTools (F12) → Console
3. Выполните команду: `WB.exportSelectors()`
4. Скачайте ZIP архив с HTML файлами

### 3. Валидация селекторов
1. Выполните: `WB.validateSelectors()`
2. Посмотрите какие селекторы не работают (❌)

### 4. Генерация фиксов
1. Выполните: `WB.generateFixes()`
2. Скопируйте предложенные селекторы
3. Обновите `content.js` (lines 18-36)

### 5. Тестирование
1. Перезагрузите расширение (chrome://extensions/)
2. Выполните: `WB.validateSelectors()`
3. Убедитесь что все селекторы ✅

### 6. Документация
1. Обновите комментарий в `content.js` (дата обновления)
2. Добавьте запись в `README.md` changelog
3. Создайте commit: "fix: Update WB selectors (DD.MM.YYYY)"

## Команды DevTools Helper

### WB.exportSelectors()
Экспортирует HTML всех элементов из SELECTORS объекта.

### WB.validateSelectors()
Проверяет что все селекторы работают на текущей странице.

### WB.generateFixes()
Предлагает новые селекторы для сломанных элементов.

### WB.diffHTML(elementName, oldHTML)
Сравнивает старый и новый HTML, показывает изменения.

## FAQ

**Q: Команды WB.* не работают**
A: Убедитесь что вы используете dev build расширения (версия содержит "-dev")

**Q: exportSelectors() не находит элемент**
A: Откройте боковую панель (кликните на жалобу), некоторые элементы загружаются динамически

**Q: generateFixes() предлагает hash-based селектор**
A: Выберите вариант с data-* атрибутами или [class*="prefix"]
```

---

## Non-goals (explicitly do NOT implement)
- Do NOT integrate with backend API (это будет в TASK-006)
- Do NOT add AI auto-fix without human review
- Do NOT modify production builds
- Do NOT change core automation logic in `content.js`

---

## Required documentation

After implementation, update:

1. **README.md** - Add section:
   ```markdown
   ### Developer Tools

   For developers maintaining selectors, see [SELECTOR_MAINTENANCE.md](docs/SELECTOR_MAINTENANCE.md)
   ```

2. **manifest.json** - Update version to 2.4.0-dev

3. **Create CHANGELOG entry:**
   ```markdown
   ### v2.4.0 (2025-01-XX) - DevTools Helper
   - 🛠️ Добавлен DevTools Helper для упрощения обновления селекторов
   - ⚡ Команды: `WB.exportSelectors()`, `WB.validateSelectors()`, `WB.generateFixes()`
   - 📋 Создана документация SELECTOR_MAINTENANCE.md
   - 🚀 Время обновления селекторов: 2-3 часа → 15-20 минут
   ```

---

## Definition of Done
- [ ] Created `src/devtools-helper.js` with all 4 console commands
- [ ] `WB.exportSelectors()` exports HTML files to ZIP archive
- [ ] `WB.validateSelectors()` checks all selectors and prints report
- [ ] `WB.generateFixes()` suggests alternative selectors with stability ranking
- [ ] `WB.diffHTML()` compares old vs new HTML structure
- [ ] Created `docs/SELECTOR_MAINTENANCE.md` with usage guide
- [ ] Updated `manifest.json` to include devtools-helper.js (dev mode only)
- [ ] Updated README.md with link to documentation
- [ ] Tested all commands on real WB complaints page
- [ ] Dev build loads without errors
- [ ] Production build does NOT include devtools-helper.js

---

## Output format for implementation

### Phase 1: Core functionality
1. Create `devtools-helper.js` skeleton with `window.WB` object
2. Implement `validateSelectors()` (easiest, can test immediately)
3. Implement `exportSelectors()` (requires JSZip library)

### Phase 2: AI-powered features
1. Implement `generateFixes()` with selector ranking algorithm
2. Implement `diffHTML()` with attribute comparison

### Phase 3: Documentation
1. Create `SELECTOR_MAINTENANCE.md` guide
2. Update README.md and manifest.json

### Phase 4: Testing
1. Test all commands on WB page
2. Verify ZIP download works
3. Verify selector suggestions are accurate

---

**Priority:** MEDIUM
**Estimated effort:** 3-4 hours
**Dependencies:** JSZip library for creating downloadable archives
**Next task:** TASK-005 (Health Check Mode)

---

## Example workflow

```
Developer: WB селекторы сломались после обновления UI

Step 1: Открываю страницу WB → DevTools Console
Step 2: WB.validateSelectors()
        ❌ pagination: НЕ НАЙДЕН
        ❌ statusChip: НЕ НАЙДЕН

Step 3: WB.generateFixes()
        💡 pagination: [data-testid="pagination-controls"]
        💡 statusChip: [class*="Chips__text"][class*="textAlign-center"]

Step 4: Копирую предложенные селекторы → обновляю content.js
Step 5: WB.validateSelectors()
        ✅ Все селекторы работают!

Time saved: 2 hours → 15 minutes
```
