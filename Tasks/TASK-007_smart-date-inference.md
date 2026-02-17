# TASK 7 — Smart Date Inference & Validation

You are working in an existing Chrome Extension project for automating complaints checking on Wildberries marketplace.

**Context:** The extension parses complaint submission dates from WB UI in format `DD.MM` (without year). When users manually submit complaints, they may write dates like `31.12` without specifying the year. Currently, the system naively assumes all dates belong to the current year, which causes **December 2025 complaints to be incorrectly interpreted as December 2026** (future dates, which is impossible).

**Project timeline:** Started in September 2025. Current date: January 2026.

---

## Goal
Implement smart year inference logic that correctly determines the year for complaint dates based on the current month, and add validation to prevent future dates or dates before project start.

---

## Background: Current Problem

### Real-world scenario (January 2026)

**User manually submitted complaints in December 2025:**
```
Input:       "Жалоба от 31.12"  (submitted December 31, 2025)
Current:     Interpreted as 31.12.2026 (WRONG - future date!)
Expected:    31.12.2025 (correct)
```

**User submitted complaints in January 2026:**
```
Input:       "Жалоба от 05.01"  (submitted January 5, 2026)
Current:     Interpreted as 05.01.2026 (correct by accident)
Expected:    05.01.2026 (correct)
```

### Root cause analysis

1. **Legacy data format** - Old complaints written as `DD.MM` without year
2. **Human factor** - Manual submissions may have typos: `0.00.0000`, `00.00.00`, `00.00.0000`
3. **No validation** - System doesn't check if date is from the future
4. **Naive year assumption** - Code just uses `state.year` (current year) for all dates

### Current code behavior

**File: [content.js:261-325](../content.js:261-325)**

```javascript
function extractComplaintSubmitDate(str) {
  const complaintPattern = /Жалоба\s+от:?\s*(\d{1,2})[\.\/](\d{1,2})(?:[\.\/](\d{2,4}))?/i;

  if (complaintMatch) {
    const day = complaintMatch[1].padStart(2, '0');
    const month = complaintMatch[2].padStart(2, '0');
    const year = complaintMatch[3]; // May be undefined!

    if (year) {
      // Has year - validate it
      const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
      if (fullYear < 2025) {
        console.error("❌ Invalid year!");
      }
    } else {
      // ⚠️ PROBLEM: No year - assumes 2025 (WRONG!)
      console.log("год не указан, считаем 2025");
    }

    return `${day}.${month}`; // Always returns WITHOUT year
  }
}
```

**Problems:**
- ❌ Returns only `DD.MM` (no year attached)
- ❌ Assumes all dates without year = 2025
- ❌ No logic to infer year based on month vs current month
- ❌ No validation that date is not from the future

---

## Scope (must implement)

### Part 1: Smart Year Inference Algorithm

#### Step 1.1: Implement `inferYearForComplaintDate()`

**File to modify:** `content.js`

**Add new function after `extractComplaintSubmitDate()`:**

```javascript
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
 * - inferYearForComplaintDate(05, 01) → 2026 (январь ≤ январь)
 * - inferYearForComplaintDate(15, 09) → 2025 (сентябрь > январь)
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
```

---

#### Step 1.2: Implement `validateComplaintDate()`

**Add validation function after `inferYearForComplaintDate()`:**

```javascript
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
```

---

#### Step 1.3: Update `extractComplaintSubmitDate()` to use new logic

**File to modify:** `content.js` (lines 261-325)

**Replace existing function with:**

```javascript
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
    for (const date of state.dateRangeArray) {
      if (str.includes(date)) {
        console.log(`📅 Найдена дата из диапазона: ${date}`);

        // Парсим дату из диапазона (формат: DD.MM)
        const [day, month] = date.split('.').map(Number);
        const fullYear = inferYearForComplaintDate(day, month);

        const formattedDate = `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${fullYear}`;
        console.log(`✅ Дата с автоопределением года: ${formattedDate}`);

        return formattedDate;
      }
    }
  }

  console.warn(`⚠️ Дата подачи жалобы не найдена в тексте: "${str}"`);
  return null;
}
```

---

### Part 2: Update Google Sheets Integration

#### Step 2.1: Save dates in DD.MM.YYYY format

**File to modify:** `content.js` (around line 1404)

**Current code:**
```javascript
const row = {
  clientName: state.cabinetName,
  article: articul,
  complaintDate: date, // ⚠️ Формат DD.MM (БЕЗ ГОДА!)
  totalComplaints: counts.total,
  approvedComplaints: counts.approved
};
```

**Updated code:**
```javascript
const row = {
  clientName: state.cabinetName,
  article: articul,
  complaintDate: date, // ✅ Теперь формат DD.MM.YYYY (с годом!)
  totalComplaints: counts.total,
  approvedComplaints: counts.approved
};
```

**Note:** Since `extractComplaintSubmitDate()` now returns `DD.MM.YYYY`, this change is automatic. No code modification needed here - just validation that it works correctly.

---

### Part 3: Handle Human Input Errors

#### Step 3.1: Add input sanitization

**Add new function before `extractComplaintSubmitDate()`:**

```javascript
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
```

**Update `extractComplaintSubmitDate()` to use sanitization:**

```javascript
function extractComplaintSubmitDate(str) {
  if (!str) return null;

  // Сначала исправляем типичные ошибки
  str = sanitizeComplaintDateInput(str);

  // ... остальной код без изменений ...
}
```

---

### Part 4: Visual Console Feedback

#### Step 4.1: Add summary log after parsing

**Add at the end of complaint processing loop (around line 1100):**

```javascript
// После успешного парсинга даты подачи
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`📋 ДАТА ПОДАЧИ ЖАЛОБЫ`);
console.log(`   Исходный текст: "${sidebarText}"`);
console.log(`   Извлечена дата: ${dateInText}`);
console.log(`   Формат: ${dateInText.includes('.') && dateInText.split('.').length === 3 ? 'DD.MM.YYYY ✅' : 'DD.MM ⚠️ (нет года)'}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
```

---

## Testing & Validation

### Test Cases

**Test 1: December 2025 complaint (current month = January 2026)**
```javascript
Input:       "Жалоба от 31.12"
Expected:    "31.12.2025"
Validation:  ✅ Not from future, after project start
```

**Test 2: January 2026 complaint (current month = January 2026)**
```javascript
Input:       "Жалоба от 05.01"
Expected:    "05.01.2026"
Validation:  ✅ Not from future, after project start
```

**Test 3: September 2025 complaint (current month = January 2026)**
```javascript
Input:       "Жалоба от 15.09"
Expected:    "15.09.2025"
Validation:  ✅ Not from future, after project start
```

**Test 4: Explicit year provided**
```javascript
Input:       "Жалоба от 03.12.2025"
Expected:    "03.12.2025"
Validation:  ✅ Uses explicit year
```

**Test 5: Future date (should fail validation)**
```javascript
Input:       "Жалоба от 15.06.2026"
Expected:    Fallback to "15.06" (with error log)
Validation:  ❌ Future date detected
```

**Test 6: Before project start (should fail validation)**
```javascript
Input:       "Жалоба от 01.08.2025"
Expected:    Fallback to "01.08" (with error log)
Validation:  ❌ Before September 2025
```

**Test 7: Invalid date (32nd day)**
```javascript
Input:       "Жалоба от 32.01.2026"
Expected:    Fallback to "32.01" (with error log)
Validation:  ❌ Invalid date (doesn't exist in calendar)
```

**Test 8: Human error - missing leading zeros**
```javascript
Input:       "Жалоба от 5.1"
Sanitized:   "Жалоба от 05.01"
Expected:    "05.01.2026"
Validation:  ✅ Sanitization worked
```

---

## Edge Cases to Handle

### Edge Case 1: Year boundary (December → January)

**Scenario:** Current date = January 5, 2026
```javascript
"Жалоба от 31.12" → 31.12.2025 ✅ (last year)
"Жалоба от 01.01" → 01.01.2026 ✅ (this year)
```

### Edge Case 2: Multiple years in the future

**Scenario:** Current date = January 2027 (future)
```javascript
"Жалоба от 31.12" → 31.12.2026 ✅ (last year, correct)
"Жалоба от 15.09" → 15.09.2026 ✅ (last year, correct)
```

**Protection:** `PROJECT_START_YEAR` ensures we never return year < 2025.

### Edge Case 3: Leap year handling

**Scenario:** February 29 in non-leap year
```javascript
Input:       "Жалоба от 29.02.2025"
Validation:  ❌ Invalid date (2025 is not a leap year)
Fallback:    "29.02" (with error log)
```

### Edge Case 4: Empty or malformed input

```javascript
Input:       ""
Expected:    null

Input:       "Жалоба от abc"
Expected:    null

Input:       "Жалоба от 99.99"
Validation:  ❌ Invalid date
Fallback:    "99.99" (with error log)
```

---

## Non-goals (explicitly do NOT implement)

- Do NOT migrate existing data in Google Sheets (user confirmed dates are already correct there)
- Do NOT change Google Sheets API structure (column order, etc.)
- Do NOT add UI for manual year selection (can be future enhancement)
- Do NOT modify date range selection in dashboard (that's a separate feature)

---

## Required documentation

After implementation, update:

1. **README.md** - Add troubleshooting section:
   ```markdown
   ### Даты подачи жалоб интерпретируются неправильно

   Расширение автоматически определяет год для дат в формате `DD.MM`:
   - Если месяц жалобы **больше** текущего месяца → прошлый год
   - Если месяц жалобы **меньше или равен** текущему → текущий год

   **Пример (январь 2026):**
   - "Жалоба от 31.12" → 31.12.**2025** (декабрь > январь)
   - "Жалоба от 05.01" → 05.01.**2026** (январь ≤ январь)

   **Валидация:**
   - ❌ Даты из будущего отклоняются
   - ❌ Даты до сентября 2025 отклоняются
   - ✅ Проверка корректности календарной даты

   Если дата не проходит валидацию, расширение вернется к формату `DD.MM` (без года).
   ```

2. **manifest.json** - Update version to 2.3.2

3. **Create CHANGELOG entry:**
   ```markdown
   ### v2.3.2 (2026-01-XX) - Умное определение года для дат жалоб
   - 🧠 **Автоматическое определение года** для дат в формате DD.MM
   - ✅ **Валидация дат**: защита от будущих дат и дат до старта проекта
   - 🔧 **Исправление ошибок ввода**: автокоррекция типичных опечаток
   - 📅 **Формат даты в Sheets**: DD.MM.YYYY вместо DD.MM
   - 📊 **Улучшенная визуализация** в консоли при парсинге дат
   ```

---

## Definition of Done

- [ ] Implemented `inferYearForComplaintDate()` function
- [ ] Implemented `validateComplaintDate()` function
- [ ] Implemented `sanitizeComplaintDateInput()` function
- [ ] Updated `extractComplaintSubmitDate()` to use new logic
- [ ] Dates are now returned in `DD.MM.YYYY` format (with year)
- [ ] All 8 test cases pass successfully
- [ ] Edge cases handled correctly (year boundary, leap year, invalid dates)
- [ ] Console logs provide clear feedback on date parsing and validation
- [ ] Updated README.md with troubleshooting guide
- [ ] Updated manifest.json to v2.3.2
- [ ] Tested on real WB page with complaints from December 2025 and January 2026
- [ ] Verified Google Sheets receives `DD.MM.YYYY` format correctly
- [ ] No breaking changes to existing functionality

---

## Output format for implementation

### Phase 1: Core Logic
1. Add `inferYearForComplaintDate()` function
2. Add `validateComplaintDate()` function
3. Update `extractComplaintSubmitDate()` to use new logic

### Phase 2: Input Sanitization
1. Add `sanitizeComplaintDateInput()` function
2. Integrate sanitization into date parsing

### Phase 3: Testing
1. Test all 8 test cases manually
2. Test edge cases (year boundary, leap year, invalid dates)
3. Verify console logs are helpful

### Phase 4: Documentation
1. Update README.md
2. Update manifest.json
3. Add changelog entry

---

**Priority:** HIGH (data integrity issue)
**Estimated effort:** 2-3 hours
**Impact:** Critical - prevents data corruption and incorrect reporting
**Risk:** Low - fallback to old behavior if validation fails

---

## Example workflow (before vs after)

### BEFORE (January 2026)

```
Parse: "Жалоба от 31.12"
Logic: Uses state.year = 2026
Result: 31.12.2026 ❌ (FUTURE DATE - impossible!)
Saved: 31.12 (no year in Sheets)
```

### AFTER (January 2026)

```
Parse: "Жалоба от 31.12"
Sanitize: No changes needed
Infer Year: month 12 > current month 1 → year = 2025
Validate: 31.12.2025 < today ✅, > 01.09.2025 ✅
Result: 31.12.2025 ✅ (CORRECT!)
Saved: 31.12.2025 (with year in Sheets)
Console:
  📅 [INFER YEAR] Определяем год для 31.12 (сейчас: 1.2026)
  → Месяц 12 > текущий 1, год = 2025 (прошлый год)
  ✅ [VALIDATE] Проверяем дату: 31.12.2025
  ✅ Дата валидна
  ✅ Итоговая дата подачи: 31.12.2025
```

---

## Business Impact

**Problem severity:** HIGH
- Incorrect dates lead to wrong statistics in Google Sheets
- Reports show future complaints (impossible)
- Cannot distinguish December 2025 from December 2026

**Solution benefits:**
- ✅ Accurate year determination for all dates
- ✅ Data integrity validation (no future dates, no pre-project dates)
- ✅ Better user experience (auto-correction of typos)
- ✅ Clear console feedback for debugging
- ✅ Forward-compatible (works for years 2026, 2027, etc.)

**User value:** Reliable data → accurate reporting → better business decisions
