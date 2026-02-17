# TASK 3 — Fix WB Selectors after Wildberries UI Update

You are working in an existing Chrome Extension project for automating complaints checking on Wildberries marketplace.

**Context:** Wildberries has updated their UI/CSS structure, and the extension is now failing to find critical DOM elements (specifically the search input field). The extension has self-diagnostic capabilities and is reporting selector failures.

---

## Goal
Fix broken CSS selectors in the content script to restore full functionality of the WB complaints checking automation after Wildberries UI changes.

---

## Background: Project Overview

This is a **Chrome Extension (Manifest V3)** that automates the process of:
1. Searching for complaints on Wildberries seller portal by article numbers
2. Parsing complaint tables (date, status, rating)
3. Taking screenshots of approved complaints
4. Saving data to Google Sheets and screenshots to Google Drive

**Key files:**
- `content.js` (lines 14-36) — Contains `SELECTORS` object with all CSS selectors
- `README.md` — Project documentation
- `manifest.json` — Extension configuration

**Current architecture:**
- Content script injects into `*://*.wildberries.ru/*`
- Parses DOM using CSS selectors defined in `SELECTORS` constant
- Uses `chrome.tabs.captureVisibleTab` for screenshots
- Integrates with Google Drive/Sheets APIs via background script

---

## Problem Statement

**Symptom:** Extension reports "Поле поиска не найдено! Возможно, изменились селекторы WB." (Search field not found! Selectors may have changed.)

**Root cause:** Wildberries updated their CSS class naming (hash-based classes like `.Simple-input__field__zjmb3BTXOH` are regenerated on deploy).

**Current broken selectors (content.js:18-35):**
```javascript
const SELECTORS = {
  searchInput: ".Simple-input__field__zjmb3BTXOH",        // ❌ BROKEN
  tableBody: ".Base-table-body__F-y98zdE6m",              // ⚠️ May be broken
  dateText: ".Text__nYviMz7WeF",                          // ⚠️ May be broken
  statusChip: ".Chips__text__Agf4iPgm-r",                 // ⚠️ May be broken
  sidebar: ".Sidebar-panel__ZRoOVwKELR",                  // ⚠️ May be broken
  productInfo: ".Product-info__additional-info__i6wYBjrEBV", // ⚠️ May be broken
  feedbackInfo: ".Feedback-info__-C-Y58Z8iU",             // ⚠️ May be broken
  pagination: ".Pagination-buttons__pKalkfGkza",          // ⚠️ May be broken
  paginationButton: ".Pagination-icon-button__yXSU-Nq5A9" // ⚠️ May be broken
};
```

---

## Scope (must implement)

### Step 1: Request HTML samples from user
You MUST request the user to provide HTML snippets for the following UI elements from the Wildberries complaints page:

**Required elements:**
1. **Search input field** (text input where article numbers are entered)
   - Ask: "Откройте страницу жалоб WB, кликните правой кнопкой на поле поиска артикулов → Inspect → скопируйте HTML элемента input и 2-3 родительских div"

2. **Complaints table body** (container with complaint rows)
   - Ask: "Найдите таблицу с жалобами → Inspect → скопируйте HTML элемента tbody или div-контейнера с классом table-body"

3. **Date text in table row** (text element showing complaint date)
   - Ask: "В строке таблицы найдите дату жалобы → Inspect → скопируйте HTML span/div с датой и родительский элемент"

4. **Status chip** (badge showing "Одобрена"/"Отклонена")
   - Ask: "Найдите статус 'Одобрена' в таблице → Inspect → скопируйте HTML элемента с текстом статуса"

5. **Sidebar panel** (right panel that opens when clicking a complaint)
   - Ask: "Кликните на любую жалобу → откроется боковая панель → Inspect → скопируйте HTML корневого div панели"

6. **Product info in sidebar** (article number display in sidebar)
   - Ask: "В боковой панели найдите 'Арт WB: XXXXXX' → Inspect → скопируйте HTML"

7. **Feedback info in sidebar** (feedback date/time display)
   - Ask: "В боковой панели найдите дату отзыва (например '12 дек 2024 г. в 14:30') → Inspect → скопируйте HTML"

8. **Pagination controls** (next/previous page buttons)
   - Ask: "Внизу таблицы найдите кнопки пагинации → Inspect → скопируйте HTML контейнера с кнопками"

9. **Rating stars in sidebar** (star rating display in feedback section)
   - Ask: "В боковой панели найдите звездочки рейтинга отзыва (например, 3 из 5 звезд) → Inspect → скопируйте HTML контейнера со звездами"

**Format for user response:**
```
Элемент 1 (Search input):
<div class="...">
  <input class="..." />
</div>

Элемент 2 (Table body):
...
```

---

### Step 2: Analyze HTML structure
For each provided HTML snippet:
1. Identify stable selector patterns:
   - Prefer `data-*` attributes (most stable)
   - Use partial class matching `[class*="keyword"]` if class contains stable prefix
   - Use semantic attributes (`role`, `aria-*`, `type`, `placeholder`)
   - Use tag combinations (e.g., `div.SomeClass > input[type="text"]`)

2. Validate selector uniqueness:
   - Ensure selector matches only ONE element on the page
   - Test selector specificity to avoid conflicts

3. Document fallback strategies:
   - If no stable selector exists, implement multi-strategy detection (see existing code in content.js:856-898 for reference)

---

### Step 3: Update SELECTORS object
Replace broken selectors in `content.js` (lines 18-35) with new, stable selectors.

**Example transformation:**
```javascript
// ❌ OLD (hash-based, breaks on deploy)
searchInput: ".Simple-input__field__zjmb3BTXOH"

// ✅ NEW (stable, semantic)
searchInput: "input[type='text'][placeholder*='артикул']"
// OR
searchInput: "[data-testid='search-input']"
// OR
searchInput: ".SearchInput input[type='text']"
```

**Requirements:**
- Each selector MUST be tested for uniqueness
- Add comments explaining selector strategy if non-obvious
- Prefer shorter, more readable selectors when possible
- If using `[class*="prefix"]`, ensure prefix is stable across deploys

---

### Step 4: Update fallback logic (if needed)
If stable selectors are not available for critical elements, implement multi-strategy detection similar to existing code in:
- `content.js:856-898` (feedback date extraction with 3 fallback strategies)
- `content.js:959-991` (feedbackInfo detection with fallback)

**Pattern:**
```javascript
// Strategy 1: Primary selector
let element = document.querySelector(SELECTORS.primary);

// Strategy 2: Fallback by class pattern
if (!element) {
  const candidates = document.querySelectorAll('[class*="KeywordInClass"]');
  element = candidates[0]; // or apply additional filtering
}

// Strategy 3: Fallback by structure
if (!element) {
  element = document.querySelector('div.Parent > span.Child');
}
```

---

### Step 5: Test and validate
1. Load unpacked extension in Chrome
2. Navigate to Wildberries complaints page
3. Open DevTools Console
4. Verify in console logs:
   - "📦 Полученные артикулы: [...]" (articles received)
   - "🔍 Обрабатываем артикул..." (processing starts)
   - NO errors "Поле поиска не найдено"
5. Verify search input is being filled with article numbers
6. Verify table parsing works (dates, statuses extracted)
7. Verify sidebar opens and data is extracted

---

## Non-goals (explicitly do NOT implement)
- Do NOT change core automation logic (processAllArticuls, steppingByElements)
- Do NOT modify Google Drive/Sheets integration
- Do NOT add new features or UI improvements
- Do NOT refactor code structure beyond selector fixes
- Do NOT change DELAYS configuration unless explicitly broken

---

## Required documentation
After implementation, update:
1. `content.js` comments (lines 15-17) with note about selector update date:
   ```javascript
   // ============================================
   // КОНФИГУРАЦИЯ - CSS селекторы WB
   // Последнее обновление: DD.MM.YYYY (после изменения UI WB)
   // ============================================
   ```

2. Create `CHANGELOG` entry in README.md:
   ```markdown
   ### vX.X.X (YYYY-MM-DD) - WB Selectors Fix
   - 🔧 Updated CSS selectors after Wildberries UI update
   - ✅ Replaced hash-based classes with stable semantic selectors
   - 📋 Tested on WB complaints page (verified DD.MM.YYYY)
   ```

3. Add troubleshooting note to README.md:
   ```markdown
   ### Селекторы WB устарели снова
   - Проблема: После очередного обновления UI Wildberries селекторы могут сломаться
   - Решение: См. Tasks/TASK-003_fix-wb-selectors.md для инструкции по обновлению
   ```

---

## Definition of Done
- [ ] User provided HTML samples for all 9 required elements
- [ ] New selectors identified and tested for uniqueness
- [ ] `SELECTORS` object updated in content.js (lines 18-35)
- [ ] Extension loads without errors in Chrome DevTools
- [ ] Search input is found and filled with article number
- [ ] Table parsing works (dates and statuses extracted correctly)
- [ ] Sidebar opens and product/feedback info extracted
- [ ] Pagination works (next page button clickable)
- [ ] At least 1 full test run completed successfully (1-2 articles, 1-2 dates)
- [ ] Documentation updated (changelog, comments, troubleshooting)
- [ ] No scope creep (only selectors changed, no new features)

---

## Output format for your response

### Phase 1: Request HTML samples
1. List of 9 elements to request (formatted in Russian for user)
2. Clear instructions on how to extract HTML via DevTools

### Phase 2: Analysis
1. Summary of identified selector patterns
2. Stability assessment for each selector
3. Trade-offs and decisions made

### Phase 3: Implementation
1. List of files changed
2. Diff of SELECTORS object (old vs new)
3. Any additional fallback logic added

### Phase 4: Validation
1. Test results (console logs, screenshots if needed)
2. DoD checklist status
3. Known issues or limitations (if any)

---

**Priority:** HIGH
**Estimated effort:** 30-60 minutes (depends on HTML sample extraction speed)
**Dependencies:** User must have access to Wildberries seller portal with active complaints

---

## Example workflow

```
Assistant: Начинаю работу над TASK-003. Сначала мне нужно получить актуальные HTML элементы.

Пожалуйста, откройте страницу жалоб на Wildberries и предоставьте HTML для следующих элементов:

1. **Поле поиска артикулов**
   - Откройте DevTools (F12)
   - Кликните правой кнопкой на поле поиска → "Inspect"
   - Скопируйте HTML элемента <input> и 2-3 родительских <div>

2. **Таблица с жалобами**
   ...

User: [предоставляет HTML]