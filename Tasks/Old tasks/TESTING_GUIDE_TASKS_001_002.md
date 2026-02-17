# Testing Guide: TASK-001 + TASK-002

**Implementation Date:** 2025-12-01
**Status:** Ready for User Testing
**Chrome Extension:** WB Feedback Checker v2.0

---

## Pre-Testing Setup

### 1. Load Updated Extension
1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select folder: `c:\Users\79025\Desktop\проекты\WB подача жалоб\WB\wb-отчет`
5. Verify extension loaded without errors

### 2. Open Chrome DevTools Console
1. Click extension icon → Open Dashboard
2. Press `F12` to open DevTools
3. Go to "Console" tab
4. Keep this open during testing to see logs

### 3. Prepare Test Cabinet
- Choose a cabinet with 2-3 articuls for quick testing
- Note cabinet name for tracking

---

## Test Suite

### ✅ TEST 1: Normal Operation (No Duplicates)

**Purpose:** Verify persistent cache prevents duplicate folder creation

**Steps:**
1. Open dashboard → Select test cabinet
2. Select "Все в одну папку" mode
3. Click "Запустить проверку"
4. Wait for completion

**Expected Results:**
- ✅ Console shows: `📁 [getOrCreateFolder] Получаем/создаем папку "скриншоты: жалобы WB"`
- ✅ Console shows: `➕ [getOrCreateFolder] Папка "скриншоты: жалобы WB" не найдена, создаем новую...`
- ✅ Folder created on Google Drive: `Скриншоты/скриншоты: жалобы WB/`
- ✅ Screenshots uploaded successfully

**Second Run:**
1. Wait **2 minutes** (service worker will restart)
2. Run check again for SAME cabinet
3. Watch console logs

**Expected Results:**
- ✅ Console shows: `🔍 [CACHE] Проверяем кешированную папку "скриншоты: жалобы WB"`
- ✅ Console shows: `✅ Папка ... валидна`
- ✅ Console shows: `✅ [CACHE] Кешированная папка "скриншоты: жалобы WB" валидна`
- ✅ **NO duplicate folder created**
- ✅ New screenshots added to EXISTING folder

**Pass/Fail:**
- [ ] PASS - No duplicate folders
- [ ] FAIL - Duplicate created (check console for errors)

---

### ✅ TEST 2: Folder Deleted (In Trash)

**Purpose:** Verify system detects trashed folders and creates new ones

**Steps:**
1. Complete Test 1 first (folder exists)
2. Go to Google Drive
3. Find folder: `Скриншоты/скриншоты: жалобы WB/`
4. **Right-click → Remove** (folder goes to trash, DON'T empty trash yet)
5. Return to dashboard
6. Run check again for same cabinet

**Expected Console Logs:**
```
🔍 [CACHE] Проверяем кешированную папку "скриншоты: жалобы WB" (...)
🔍 Валидация папки ...
🗑️ Папка ... в корзине
❌ [CACHE] Кешированная папка невалидна, удаляем из кеша
🗑️ Кеш удален: folder_...
🔍 [API] Ищем папку "скриншоты: жалобы WB" через Drive API...
➕ [API] Папка "скриншоты: жалобы WB" не найдена
➕ [getOrCreateFolder] Папка "скриншоты: жалобы WB" не найдена, создаем новую...
✅ Папка "скриншоты: жалобы WB" создана: ...
```

**Expected Results:**
- ✅ System detects folder is in trash
- ✅ Cache invalidated
- ✅ **NEW folder created** (not in trash)
- ✅ Screenshots uploaded to new folder
- ✅ No errors during upload

**Pass/Fail:**
- [ ] PASS - New folder created, screenshots uploaded
- [ ] FAIL - Errors or files uploaded to trash

---

### ✅ TEST 3: Folder Permanently Deleted (404)

**Purpose:** Verify system handles permanently deleted folders

**Steps:**
1. After Test 2, you should have folder in trash
2. Go to Google Drive → Trash
3. Find "скриншоты: жалобы WB" folder
4. **Permanently delete** (Empty trash)
5. Return to dashboard
6. Run check again for same cabinet

**Expected Console Logs:**
```
🔍 [CACHE] Проверяем кешированную папку "скриншоты: жалобы WB" (...)
🔍 Валидация папки ...
❌ Папка ... не существует (404)
❌ [CACHE] Кешированная папка невалидна, удаляем из кеша
🗑️ Кеш удален: folder_...
🔍 [API] Ищем папку "скриншоты: жалобы WB" через Drive API...
➕ [API] Папка "скриншоты: жалобы WB" не найдена
➕ [getOrCreateFolder] Папка "скриншоты: жалобы WB" не найдена, создаем новую...
✅ Папка "скриншоты: жалобы WB" создана: ...
```

**Expected Results:**
- ✅ System detects 404 error
- ✅ Cache invalidated
- ✅ New folder created
- ✅ Screenshots uploaded successfully

**Pass/Fail:**
- [ ] PASS - New folder created after permanent deletion
- [ ] FAIL - Stuck or errors

---

### ✅ TEST 4: Multiple Delete/Recreate Cycles

**Purpose:** Verify system handles repeated deletions without issues

**Steps:**
1. Run check → folder created
2. Delete folder (trash) → run check → new folder created
3. Delete folder (permanently) → run check → new folder created
4. Repeat step 3 one more time

**Expected Results:**
- ✅ Each cycle creates new folder successfully
- ✅ No zombie cache entries
- ✅ No accumulated errors

**Pass/Fail:**
- [ ] PASS - All cycles work correctly
- [ ] FAIL - System breaks after N cycles

---

### ✅ TEST 5: Articul Folder Deleted (By Articul Mode)

**Purpose:** Verify articul-specific folders are validated

**Steps:**
1. Select cabinet
2. **Change mode to:** "По папкам (каждый артикул в своей папке)"
3. Run check for 2-3 articuls
4. Verify structure on Drive:
   ```
   Скриншоты/
   └── скриншоты: жалобы WB/
       ├── 123456789/  ← articul folder
       ├── 987654321/  ← articul folder
       └── ...
   ```
5. Delete ONE articul folder (e.g., `123456789`)
6. Run check again for SAME articuls

**Expected Results:**
- ✅ Deleted articul folder recreated
- ✅ Other articul folders reused (not recreated)
- ✅ Screenshots uploaded correctly

**Pass/Fail:**
- [ ] PASS - Only deleted folder recreated
- [ ] FAIL - All folders recreated or errors

---

### ✅ TEST 6: Parent Folder Deleted (Cabinet Screenshots Folder)

**Purpose:** Verify recovery when parent "Screenshots" folder is deleted

**Steps:**
1. Run check → folders created
2. Go to Google Drive
3. Delete the PARENT folder "Скриншоты" (the one from Google Sheets link)
4. Run check again

**Expected Console Logs:**
```
❌ [BACKGROUND] Ошибка создания папки "скриншоты: жалобы WB": ...
🗑️ [BACKGROUND] Очищаем кеш для кабинета ...
🔄 [BACKGROUND] Повторная попытка создания папки...
✅ [BACKGROUND] Папка создана после очистки кеша: ...
```

**Expected Results:**
- ✅ Error detected
- ✅ Cabinet cache cleared
- ✅ Retry succeeds (creates new folder structure)
- ✅ Screenshots uploaded

**Note:** This test may require manual recreation of "Screenshots" folder or relinking in Google Sheets.

**Pass/Fail:**
- [ ] PASS - Recovery successful
- [ ] FAIL - Unrecoverable error

---

## Console Log Patterns to Look For

### ✅ Good Signs
```
✅ [CACHE] Кешированная папка "..." валидна
💾 Кеш сохранен: folder_...
✅ Папка ... (название) валидна
✅ [getOrCreateFolder] Папка "..." найдена: ...
```

### ⚠️ Warning Signs (Acceptable)
```
❌ [CACHE] Кешированная папка невалидна, удаляем из кеша
🗑️ Папка ... в корзине
❌ Папка ... не существует (404)
```

### 🚫 Bad Signs (Report These)
```
❌ Ошибка создания папки: ...
❌ Не удалось загрузить скриншот после 3 попыток
❌ Папка ... не существует или в корзине. Невозможно загрузить файл
```

---

## Acceptance Criteria Checklist

### TASK-001: Duplicate Folders
- [ ] ✅ AC-1: No duplicate folders created on second run
- [ ] ✅ AC-2: Cache persists across service worker restarts
- [ ] ✅ AC-3: Existing folders found after browser restart
- [ ] ✅ AC-4: Console logs show source (CACHE/API/CREATE)
- [ ] ✅ AC-5: All tests pass

### TASK-002: Deleted Folders
- [ ] ✅ AC-1: Files NOT uploaded to trashed folders
- [ ] ✅ AC-2: Cache auto-clears when folder deleted
- [ ] ✅ AC-3: New folder created after permanent deletion
- [ ] ⏳ AC-4: User notified of errors (console only, UI pending)
- [ ] ✅ AC-5: All tests pass

---

## Troubleshooting

### Problem: Extension won't load
**Solution:**
1. Check console for errors
2. Verify all files present: `google-drive-api.js`, `background.js`, `manifest.json`
3. Try: Remove extension → Reload unpacked

### Problem: "Ошибка авторизации Google Drive"
**Solution:**
1. Click extension icon
2. Click "Войти в Google Drive"
3. Complete OAuth flow
4. Try check again

### Problem: Console shows "this.validateFolder is not a function"
**Solution:**
1. Extension didn't reload properly
2. Go to `chrome://extensions/`
3. Click "Reload" button under extension
4. Try again

### Problem: Duplicate folders still created
**Check:**
1. Are you testing same cabinet?
2. Did you wait 2 minutes between runs?
3. Check console - is cache being used?
4. Check Drive API quota (unlikely but possible)

---

## Reporting Results

After testing, please report:

### For Each Test:
- ✅ PASS / ❌ FAIL
- Console log screenshots (if failed)
- Description of unexpected behavior

### Overall:
- Total tests passed: __ / 6
- Critical issues found: (list)
- Minor issues found: (list)
- Ready for production: YES / NO

---

## Next Steps After Testing

### If All Tests Pass:
1. Mark tasks as "Closed"
2. Consider adding UI notifications for errors (optional)
3. Monitor production usage

### If Tests Fail:
1. Share console logs
2. Describe reproduction steps
3. Developer will investigate and fix

---

**Prepared by:** Claude Code
**Ready for:** User Testing
**Estimated testing time:** 30-45 minutes
