// ============================================
// DASHBOARD STATE
// ============================================
let cabinetsData = [];
let selectedCabinet = null;
let isCheckRunning = false;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 [DASHBOARD] Dashboard загружен");

  // Устанавливаем даты по умолчанию
  setDefaultDates();

  // Загружаем email пользователя
  loadUserEmail();

  // Автоматически загружаем кабинеты
  await loadCabinets();

  // Добавляем обработчики событий
  setupEventListeners();

  // Слушаем сообщения от background для обновления статистики
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
});

// ============================================
// USER INFO
// ============================================
async function loadUserEmail() {
  try {
    const response = await chrome.runtime.sendMessage({ action: "getUserEmail" });
    if (response.email) {
      document.getElementById("userEmail").textContent = response.email;
    } else {
      document.getElementById("userEmail").textContent = "Не авторизован";
    }
  } catch (error) {
    console.error("❌ [DASHBOARD] Ошибка загрузки email:", error);
    document.getElementById("userEmail").textContent = "Ошибка";
  }
}

async function handleLogout() {
  try {
    console.log("🚪 [DASHBOARD] Выполняем выход...");
    await chrome.runtime.sendMessage({ action: "signOut" });

    // Закрываем dashboard и возвращаемся к popup
    window.close();
  } catch (error) {
    console.error("❌ [DASHBOARD] Ошибка выхода:", error);
    showError("Ошибка при выходе: " + error.message);
  }
}

// ============================================
// LOAD CABINETS
// ============================================
async function loadCabinets() {
  const SPREADSHEET_ID = "1-mxbnv0qkicJMVUCtqDGJH82FhLlDKDvICb-PAVbxfI";
  const FOLDER_SHEET_NAME = "Список клиентов";
  const dropdownEl = document.getElementById("cabinetDropdown");

  dropdownEl.innerHTML = '<div class="cabinet-dropdown-item loading">⏳ Загрузка кабинетов...</div>';

  try {
    console.log("📤 [DASHBOARD] Запрашиваем список магазинов из API...");

    // Шаг 1: Получаем активные магазины из R5 API
    const storesResponse = await chrome.runtime.sendMessage({
      action: "getStoresFromAPI"
    });

    if (!storesResponse.success) {
      throw new Error(storesResponse.error || "Ошибка загрузки магазинов из API");
    }

    const stores = storesResponse.stores;
    console.log("✅ [DASHBOARD] Получено магазинов из API:", stores.length);

    // Шаг 2: Получаем маппинг папок Drive из Google Sheets
    let folderMappings = [];
    try {
      console.log("📤 [DASHBOARD] Запрашиваем маппинг папок из Sheets...");
      const foldersResponse = await chrome.runtime.sendMessage({
        action: "getFolderMappings",
        spreadsheetId: SPREADSHEET_ID,
        sheetName: FOLDER_SHEET_NAME
      });

      if (foldersResponse.success) {
        folderMappings = foldersResponse.mappings;
        console.log("✅ [DASHBOARD] Получен маппинг папок:", folderMappings.length);
      } else {
        console.warn("⚠️ [DASHBOARD] Не удалось загрузить маппинг папок:", foldersResponse.error);
      }
    } catch (folderError) {
      console.warn("⚠️ [DASHBOARD] Ошибка загрузки маппинга папок:", folderError);
    }

    // Шаг 3: Объединяем данные API + Sheets
    cabinetsData = stores.map(store => {
      // Ищем маппинг по имени (основной) или по ID (fallback)
      const folders = folderMappings.find(
        f => f.name.toLowerCase() === store.name.toLowerCase() || f.clientId === store.id
      );

      return {
        clientId: store.id,
        name: store.name,
        articuls: [],                // Загрузятся при выборе кабинета
        folderId: folders?.folderId || null,
        screenshotsFolderId: folders?.screenshotsFolderId || null,
        driveFolderId: folders?.driveFolderId || null,
        reportSheetId: '10Im1KF16nMHrObMMOLeH8tRVKBHRFv6RRnc6s_q4bK0',
        status: 'Активен',
        articulCount: 0              // Обновится после загрузки артикулов
      };
    });

    console.log("✅ [DASHBOARD] Объединено кабинетов:", cabinetsData.length);

    // Отображаем кабинеты в dropdown
    renderCabinets();
  } catch (error) {
    console.error("❌ [DASHBOARD] Ошибка загрузки кабинетов:", error);
    dropdownEl.innerHTML = `<div class="cabinet-dropdown-item no-results">❌ Ошибка: ${error.message}</div>`;
  }
}

// ============================================
// RENDER CABINETS
// ============================================
function renderCabinets() {
  const dropdownEl = document.getElementById("cabinetDropdown");
  dropdownEl.innerHTML = '';

  if (cabinetsData.length === 0) {
    dropdownEl.innerHTML = '<div class="cabinet-dropdown-item no-results">Нет доступных кабинетов</div>';
    return;
  }

  // Рендерим все кабинеты
  cabinetsData.forEach((cabinet, index) => {
    const item = document.createElement("div");
    item.className = "cabinet-dropdown-item";
    item.dataset.index = index;
    item.dataset.name = cabinet.name.toLowerCase();

    const articulCount = cabinet.articuls.length;

    // Название кабинета
    const nameSpan = document.createElement("span");
    nameSpan.className = "cabinet-name";
    nameSpan.textContent = cabinet.name;

    // Количество артикулов справа (или индикатор загрузки)
    const countSpan = document.createElement("span");
    countSpan.className = "cabinet-count";
    countSpan.id = `cabinet-count-${index}`;

    if (articulCount === 0 && !cabinet._articulesLoaded) {
      countSpan.innerHTML = '📦 выберите для загрузки';
    } else if (articulCount === 0) {
      countSpan.innerHTML = '⚠️ нет артикулов';
    } else if (articulCount === 1) {
      countSpan.innerHTML = `📦 ${articulCount} артикул`;
    } else if (articulCount < 5) {
      countSpan.innerHTML = `📦 ${articulCount} артикула`;
    } else {
      countSpan.innerHTML = `📦 ${articulCount} артикулов`;
    }

    item.appendChild(nameSpan);
    item.appendChild(countSpan);

    // Клик по элементу
    item.addEventListener("click", () => selectCabinetFromDropdown(index, cabinet.name));

    dropdownEl.appendChild(item);
  });
}

// ============================================
// DROPDOWN TOGGLE & SEARCH
// ============================================
function showDropdown() {
  document.getElementById("cabinetDropdown").classList.add("show");
}

function hideDropdown() {
  document.getElementById("cabinetDropdown").classList.remove("show");
}

function filterCabinetList(searchTerm) {
  const dropdownEl = document.getElementById("cabinetDropdown");
  const items = dropdownEl.querySelectorAll('.cabinet-dropdown-item:not(.loading):not(.no-results)');

  searchTerm = searchTerm.toLowerCase().trim();

  let visibleCount = 0;

  items.forEach(item => {
    const cabinetName = item.dataset.name || '';

    if (searchTerm === '' || cabinetName.includes(searchTerm)) {
      item.style.display = 'flex';
      visibleCount++;
    } else {
      item.style.display = 'none';
    }
  });

  // Показываем сообщение если ничего не найдено
  if (visibleCount === 0 && items.length > 0) {
    let noResults = dropdownEl.querySelector('.no-results');
    if (!noResults) {
      noResults = document.createElement('div');
      noResults.className = 'cabinet-dropdown-item no-results';
      noResults.textContent = '🔍 Кабинеты не найдены';
      dropdownEl.appendChild(noResults);
    }
    noResults.style.display = 'flex';
  } else {
    const noResults = dropdownEl.querySelector('.no-results');
    if (noResults) {
      noResults.style.display = 'none';
    }
  }
}

// ============================================
// SELECT CABINET FROM DROPDOWN
// ============================================
async function selectCabinetFromDropdown(index, cabinetName) {
  const inputEl = document.getElementById("cabinetSearchInput");
  const hiddenInputEl = document.getElementById("selectedCabinetIndex");

  // Устанавливаем значения
  inputEl.value = cabinetName;
  inputEl.classList.add("has-selection");
  hiddenInputEl.value = index;

  // Скрываем dropdown
  hideDropdown();

  // Выбираем кабинет
  selectedCabinet = cabinetsData[parseInt(index)];
  console.log("📂 [DASHBOARD] Выбран кабинет:", selectedCabinet);

  // ============================================
  // ЗАГРУЗКА АРТИКУЛОВ ИЗ API
  // ============================================
  if (!selectedCabinet._articulesLoaded) {
    try {
      console.log(`📤 [DASHBOARD] Загружаем артикулы для магазина ${selectedCabinet.clientId}...`);

      // Обновляем счётчик в dropdown
      const countEl = document.getElementById(`cabinet-count-${index}`);
      if (countEl) countEl.innerHTML = '⏳ загрузка...';

      const productsResponse = await chrome.runtime.sendMessage({
        action: "getActiveProducts",
        storeId: selectedCabinet.clientId
      });

      if (productsResponse.success) {
        selectedCabinet.articuls = productsResponse.articuls;
        selectedCabinet.articulCount = productsResponse.articuls.length;
        selectedCabinet._articulesLoaded = true;
        console.log(`✅ [DASHBOARD] Загружено артикулов: ${selectedCabinet.articuls.length}`);

        // Обновляем счётчик в dropdown
        if (countEl) {
          const count = selectedCabinet.articuls.length;
          if (count === 0) countEl.innerHTML = '⚠️ нет артикулов';
          else if (count === 1) countEl.innerHTML = `📦 ${count} артикул`;
          else if (count < 5) countEl.innerHTML = `📦 ${count} артикула`;
          else countEl.innerHTML = `📦 ${count} артикулов`;
        }
      } else {
        console.error("❌ [DASHBOARD] Ошибка загрузки артикулов:", productsResponse.error);
        showError("Ошибка загрузки артикулов: " + productsResponse.error);
      }
    } catch (error) {
      console.error("❌ [DASHBOARD] Ошибка загрузки артикулов:", error);
      showError("Ошибка загрузки артикулов: " + error.message);
    }
  }

  // ============================================
  // ЗАГРУЗКА ДАННЫХ ДЕДУПЛИКАЦИИ
  // ============================================
  const REPORT_SHEET_ID = '10Im1KF16nMHrObMMOLeH8tRVKBHRFv6RRnc6s_q4bK0';
  const cabinetId = selectedCabinet.clientId || selectedCabinet.name;

  try {
    console.log('[DASHBOARD] 🔄 Загрузка данных дедупликации...');
    console.log('[DASHBOARD] 🔑 Cabinet ID для кэша:', cabinetId);
    console.log('[DASHBOARD] 📋 selectedCabinet.clientId:', selectedCabinet.clientId);
    console.log('[DASHBOARD] 📋 selectedCabinet.name:', selectedCabinet.name);

    const response = await chrome.runtime.sendMessage({
      action: "getComplaintsRecords",
      reportSheetId: REPORT_SHEET_ID
    });

    if (response && response.success) {
      await DeduplicationCache.saveRecords(response.records, cabinetId);
      console.log(`[DASHBOARD] ✅ Загружено ${response.records.length} записей для дедупликации`);
      console.log(`[DASHBOARD] 💾 Сохранено в кэш с ключом: ${cabinetId}`);
    } else {
      console.warn('[DASHBOARD] ⚠️ Не удалось загрузить данные дедупликации:', response?.error);
    }
  } catch (error) {
    console.error('[DASHBOARD] ❌ Ошибка загрузки данных дедупликации:', error);
  }

  // Показываем секции выбора артикулов и скриншотов
  document.getElementById("articulSection").style.display = "block";
  document.getElementById("screenshotSection").style.display = "block";

  // Заполняем чекбоксы артикулов
  populateArticulCheckboxes();

  // Обновляем визуальное выделение
  updateSelectedItem(index);
}

function updateSelectedItem(selectedIndex) {
  const items = document.querySelectorAll('.cabinet-dropdown-item');
  items.forEach(item => {
    if (item.dataset.index == selectedIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

// ============================================
// ARTICUL SELECTION
// ============================================
function populateArticulCheckboxes() {
  const container = document.getElementById("articulCheckboxes");
  container.innerHTML = "";

  if (!selectedCabinet || selectedCabinet.articuls.length === 0) {
    container.innerHTML = "<p style='color: #999; font-size: 12px;'>Нет артикулов</p>";
    return;
  }

  const articulCount = selectedCabinet.articuls.length;

  // Если артикулов слишком много (>500), показываем предупреждение
  if (articulCount > 500) {
    container.innerHTML = `
      <div style="padding: 10px; background: #fff3e0; border-radius: 4px;">
        <p style="margin: 0; color: #e65100; font-size: 12px;">
          ⚠️ Слишком много артикулов (${articulCount}). Используйте режим "Все артикулы".
        </p>
      </div>
    `;
    document.querySelector('input[name="articulMode"][value="all"]').checked = true;
    document.querySelector('input[name="articulMode"][value="manual"]').disabled = true;
    return;
  }

  // Включаем ручной режим
  document.querySelector('input[name="articulMode"][value="manual"]').disabled = false;

  // Показываем предупреждение для 100-500 артикулов
  if (articulCount > 100) {
    const warning = document.createElement("div");
    warning.style.cssText = "padding: 8px; background: #e3f2fd; border-radius: 4px; margin-bottom: 10px;";
    warning.innerHTML = `
      <p style="margin: 0; color: #1565C0; font-size: 11px;">
        💡 Много артикулов (${articulCount}). Рекомендуем "Все артикулы".
      </p>
    `;
    container.appendChild(warning);
  }

  // Создаем чекбоксы
  selectedCabinet.articuls.forEach(articul => {
    const label = document.createElement("label");
    label.className = "checkbox-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = articul;
    checkbox.checked = true;
    checkbox.addEventListener("change", updateArticulCounter);

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(articul));
    container.appendChild(label);
  });

  updateArticulCounter();
}

function updateArticulCounter() {
  const counter = document.getElementById("articulCounter");
  const checkboxes = document.querySelectorAll('#articulCheckboxes input[type="checkbox"]');
  const checkedBoxes = document.querySelectorAll('#articulCheckboxes input[type="checkbox"]:checked');

  const total = checkboxes.length;
  const selected = checkedBoxes.length;

  counter.innerHTML = `Выбрано: <strong>${selected}</strong> из <strong>${total}</strong>`;

  if (selected === 0) {
    counter.style.background = "#ffebee";
    counter.style.color = "#c62828";
  } else if (selected === total) {
    counter.style.background = "#e8f5e9";
    counter.style.color = "#2e7d32";
  } else {
    counter.style.background = "#e3f2fd";
    counter.style.color = "#1565C0";
  }
}

function filterArticuls(searchTerm) {
  const container = document.getElementById("articulCheckboxes");
  const labels = container.querySelectorAll('label.checkbox-label');

  let visibleCount = 0;

  labels.forEach(label => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    if (!checkbox) return;

    const articul = checkbox.value;

    if (articul.includes(searchTerm)) {
      label.style.display = "flex";
      visibleCount++;
    } else {
      label.style.display = "none";
    }
  });

  // Показываем сообщение если ничего не найдено
  let noResultsMsg = container.querySelector('.no-results-message');

  if (visibleCount === 0 && searchTerm.trim() !== '') {
    if (!noResultsMsg) {
      noResultsMsg = document.createElement('div');
      noResultsMsg.className = 'no-results-message';
      noResultsMsg.style.cssText = 'padding: 10px; text-align: center; color: #999; font-size: 12px;';
      noResultsMsg.textContent = '🔍 Артикул не найден';
      container.appendChild(noResultsMsg);
    }
  } else if (noResultsMsg) {
    noResultsMsg.remove();
  }
}

function selectAllArticuls() {
  const checkboxes = document.querySelectorAll('#articulCheckboxes input[type="checkbox"]');
  checkboxes.forEach(cb => {
    if (cb.parentElement.style.display !== 'none') {
      cb.checked = true;
    }
  });
  updateArticulCounter();
}

function deselectAllArticuls() {
  const checkboxes = document.querySelectorAll('#articulCheckboxes input[type="checkbox"]');
  checkboxes.forEach(cb => {
    if (cb.parentElement.style.display !== 'none') {
      cb.checked = false;
    }
  });
  updateArticulCounter();
}

function invertSelection() {
  const checkboxes = document.querySelectorAll('#articulCheckboxes input[type="checkbox"]');
  checkboxes.forEach(cb => {
    if (cb.parentElement.style.display !== 'none') {
      cb.checked = !cb.checked;
    }
  });
  updateArticulCounter();
}

function onArticulModeChange() {
  const mode = document.querySelector('input[name="articulMode"]:checked').value;
  const manualContainer = document.getElementById("articulManualContainer");

  if (mode === "manual") {
    manualContainer.style.display = "block";
    updateArticulCounter();
  } else {
    manualContainer.style.display = "none";
  }
}

// ============================================
// VALIDATION & START CHECK
// ============================================
function setDefaultDates() {
  const today = new Date();
  const currentDay = String(today.getDate()).padStart(2, '0');
  const currentMonth = String(today.getMonth() + 1).padStart(2, '0');

  document.getElementById("startDate").value = "01.09";
  document.getElementById("endDate").value = `${currentDay}.${currentMonth}`;
}

function isValidDate(dateStr) {
  if (!/^\d{2}\.\d{2}$/.test(dateStr)) return false;
  const [day, month] = dateStr.split(".").map(Number);
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

function showError(message, type = "error") {
  const errorEl = document.getElementById("errorMessage");
  errorEl.textContent = message;
  errorEl.style.display = "block";

  if (type === "success") {
    errorEl.classList.add("success-message");
  } else {
    errorEl.classList.remove("success-message");
  }

  setTimeout(() => {
    errorEl.style.display = "none";
  }, 5000);
}

async function startCheck() {
  // Валидация: выбран ли кабинет
  if (!selectedCabinet) {
    showError("Выберите кабинет из списка");
    return;
  }

  // Проверка наличия Folder ID
  if (!selectedCabinet.folderId) {
    showError("У выбранного кабинета отсутствует корректная ссылка на папку Drive");
    return;
  }

  // Валидация дат
  const startDate = document.getElementById("startDate").value.trim();
  const endDate = document.getElementById("endDate").value.trim();

  if (!isValidDate(startDate)) {
    showError("Введите начальную дату в формате дд.мм");
    return;
  }

  if (!isValidDate(endDate)) {
    showError("Введите конечную дату в формате дд.мм");
    return;
  }

  // Получение списка артикулов
  const articulMode = document.querySelector('input[name="articulMode"]:checked').value;
  let articuls = [];

  if (articulMode === "all") {
    articuls = selectedCabinet.articuls;
  } else {
    const checkboxes = document.querySelectorAll('#articulCheckboxes input[type="checkbox"]:checked');
    articuls = Array.from(checkboxes).map(cb => cb.value);
  }

  if (articuls.length === 0) {
    showError("Выберите хотя бы один артикул");
    return;
  }

  // Получаем режим скриншотов
  const screenshotMode = document.querySelector('input[name="screenshotMode"]:checked').value;

  // Получаем текущий год
  const year = new Date().getFullYear();

  try {
    // Находим или создаем вкладку WB
    const wbTab = await findOrCreateWBTab();

    if (!wbTab) {
      showError("Не удалось открыть страницу Wildberries");
      return;
    }

    // Отправляем данные в content.js
    // ВАЖНО: cabinetId должен совпадать с тем, что используется при сохранении кэша!
    const cabinetIdForCache = selectedCabinet.clientId || selectedCabinet.name;

    console.log('[DASHBOARD] 📤 Отправляем cabinetId в content.js:', cabinetIdForCache);

    await chrome.tabs.sendMessage(wbTab.id, {
      action: "setDateRange",
      start: startDate,
      end: endDate,
      articuls: articuls,
      year: year,
      cabinetName: selectedCabinet.name,
      cabinetFolderId: selectedCabinet.folderId,
      cabinetId: cabinetIdForCache, // Используем ту же логику, что и при сохранении кэша
      reportSheetId: '10Im1KF16nMHrObMMOLeH8tRVKBHRFv6RRnc6s_q4bK0',
      screenshotMode: screenshotMode
    });

    // Готовим статистику (панель покажется при первом обновлении)
    isCheckRunning = true;
    resetStats();

    showError("✅ Проверка запущена!", "success");

    console.log("✅ [DASHBOARD] Проверка запущена на вкладке:", wbTab.id);
  } catch (error) {
    console.error("❌ [DASHBOARD] Ошибка запуска:", error);
    showError(`Ошибка: ${error.message || "Не удалось запустить проверку"}`);
  }
}

// Найти или создать вкладку WB
async function findOrCreateWBTab() {
  try {
    // Ищем существующую вкладку WB
    const tabs = await chrome.tabs.query({ url: "*://*.wildberries.ru/*" });

    if (tabs.length > 0) {
      // Активируем первую найденную вкладку
      await chrome.tabs.update(tabs[0].id, { active: true });
      console.log("✅ [DASHBOARD] Найдена вкладка WB:", tabs[0].id);
      return tabs[0];
    }

    // Если не найдена, создаем новую
    const newTab = await chrome.tabs.create({
      url: "https://seller.wildberries.ru/",
      active: true
    });

    console.log("✅ [DASHBOARD] Создана новая вкладка WB:", newTab.id);

    // Ждем загрузки страницы
    await new Promise(resolve => {
      const listener = (tabId, changeInfo) => {
        if (tabId === newTab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    // Дополнительная задержка для инициализации content script
    console.log("⏳ [DASHBOARD] Ожидаем инициализацию content script...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    return newTab;
  } catch (error) {
    console.error("❌ [DASHBOARD] Ошибка поиска/создания вкладки WB:", error);
    return null;
  }
}

// ============================================
// STATS PANEL
// ============================================
function showStatsPanel() {
  const panel = document.getElementById("statsPanel");
  panel.classList.add("visible");
  // Auto-expand when showing
  setTimeout(() => {
    panel.classList.add("expanded");
  }, 100);
}

function hideStatsPanel() {
  const panel = document.getElementById("statsPanel");
  panel.classList.remove("expanded");
  // Hide after collapse animation
  setTimeout(() => {
    panel.classList.remove("visible");
  }, 300);
}

function toggleStatsPanel() {
  const panel = document.getElementById("statsPanel");
  panel.classList.toggle("expanded");
}

function resetStats() {
  document.getElementById("statChecked").textContent = "0";
  document.getElementById("statApproved").textContent = "0";
  document.getElementById("statRejected").textContent = "0";
  document.getElementById("statScreenshots").textContent = "0";
  document.getElementById("progressBar").style.width = "0%";
  document.getElementById("progressBar").textContent = "0%";
}

function updateStats(stats) {
  document.getElementById("statChecked").textContent = stats.checked || 0;
  document.getElementById("statApproved").textContent = stats.approved || 0;
  document.getElementById("statRejected").textContent = stats.rejected || 0;
  document.getElementById("statScreenshots").textContent = stats.screenshots || 0;

  // Обновляем прогресс-бар
  const progress = stats.progress || 0;
  document.getElementById("progressBar").style.width = progress + "%";
  document.getElementById("progressBar").textContent = Math.round(progress) + "%";
}

function stopCheck() {
  if (!isCheckRunning) return;

  console.log("⏹ [DASHBOARD] Останавливаем проверку...");

  // Отправляем сообщение в content.js для остановки
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "stopCheck" });
    }
  });

  isCheckRunning = false;
  hideStatsPanel();
  showError("⏹ Проверка остановлена", "success");
}

// ============================================
// MESSAGE HANDLER FROM BACKGROUND
// ============================================
function handleBackgroundMessage(message, sender, sendResponse) {
  console.log("📥 [DASHBOARD] Получено сообщение:", message);

  if (message.action === "updateStats") {
    // Показываем панель если еще не показана
    if (!document.getElementById("statsPanel").classList.contains("visible")) {
      showStatsPanel();
    }
    updateStats(message.stats);
  } else if (message.action === "checkComplete") {
    isCheckRunning = false;
    showError("✅ Проверка завершена!", "success");
    // Оставляем статистику видимой после завершения
    console.log("✅ [DASHBOARD] Проверка завершена, статистика остается видимой");
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // Logout
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);

  // Refresh cabinets
  document.getElementById("refreshCabinetsBtn").addEventListener("click", async () => {
    console.log("🔄 [DASHBOARD] Обновление списка кабинетов...");
    await loadCabinets();
    showError("✅ Список кабинетов обновлен!", "success");
  });

  const searchInput = document.getElementById("cabinetSearchInput");
  const dropdown = document.getElementById("cabinetDropdown");

  // Показываем dropdown при фокусе
  searchInput.addEventListener("focus", () => {
    showDropdown();
  });

  // Поиск при вводе
  searchInput.addEventListener("input", (e) => {
    // Убираем выделение если пользователь начал печатать
    searchInput.classList.remove("has-selection");
    document.getElementById("selectedCabinetIndex").value = "";
    selectedCabinet = null;

    // Скрываем секции
    document.getElementById("articulSection").style.display = "none";
    document.getElementById("screenshotSection").style.display = "none";

    filterCabinetList(e.target.value);
    showDropdown();
  });

  // Закрытие dropdown при клике вне
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      hideDropdown();
    }
  });

  // Articul mode change
  document.querySelectorAll('input[name="articulMode"]').forEach(radio => {
    radio.addEventListener("change", onArticulModeChange);
  });

  // Articul search
  document.getElementById("articulSearch").addEventListener("input", (e) => {
    filterArticuls(e.target.value);
  });

  // Articul controls
  document.getElementById("selectAllBtn").addEventListener("click", selectAllArticuls);
  document.getElementById("deselectAllBtn").addEventListener("click", deselectAllArticuls);
  document.getElementById("invertBtn").addEventListener("click", invertSelection);

  // Start check
  document.getElementById("startBtn").addEventListener("click", startCheck);

  // Stats panel toggle
  document.getElementById("statsHeader").addEventListener("click", toggleStatsPanel);

  // Stop check
  document.getElementById("stopBtn").addEventListener("click", stopCheck);
}
