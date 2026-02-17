// ============================================
// POPUP - ТОЛЬКО АВТОРИЗАЦИЯ
// ============================================

async function checkAuthAndOpenDashboard() {
  const statusEl = document.getElementById("status");
  const authBtn = document.getElementById("authBtn");

  console.log("🔍 [POPUP] Проверяем авторизацию...");

  try {
    const response = await chrome.runtime.sendMessage({ action: "checkDriveAuth" });
    console.log("📥 [POPUP] Ответ от background:", response);

    if (response.authorized) {
      console.log("✅ [POPUP] Авторизован! Открываем dashboard...");

      // Авторизован - открываем dashboard
      statusEl.style.background = "#e8f5e9";
      statusEl.style.border = "1px solid #4caf50";
      statusEl.style.color = "#2e7d32";
      statusEl.textContent = "✅ Открываем dashboard...";

      // Открываем dashboard в новой вкладке
      await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });

      // Закрываем popup
      window.close();
    } else {
      console.log("⚠️ [POPUP] Не авторизован, показываем кнопку входа");

      // Не авторизован - показываем кнопку входа
      statusEl.style.background = "#fff3e0";
      statusEl.style.border = "1px solid #ff9800";
      statusEl.style.color = "#e65100";
      statusEl.textContent = "⚠️ Требуется авторизация";
      authBtn.style.display = "block";
    }
  } catch (error) {
    console.error("❌ [POPUP] Ошибка проверки авторизации:", error);
    statusEl.style.background = "#ffebee";
    statusEl.style.border = "1px solid #f44336";
    statusEl.style.color = "#c62828";
    statusEl.textContent = "❌ Ошибка подключения";
    authBtn.style.display = "block";
  }
}

// Авторизация по кнопке
async function handleAuth() {
  const statusEl = document.getElementById("status");
  const authBtn = document.getElementById("authBtn");

  console.log("🔐 [POPUP] Начинаем авторизацию...");

  statusEl.style.background = "#e3f2fd";
  statusEl.style.border = "1px solid #2196F3";
  statusEl.style.color = "#1565C0";
  statusEl.textContent = "⏳ Авторизация...";
  authBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ action: "authorizeDrive" });
    console.log("📥 [POPUP] Результат авторизации:", response);

    if (response.success) {
      console.log("✅ [POPUP] Авторизация успешна! Открываем dashboard...");

      statusEl.style.background = "#e8f5e9";
      statusEl.style.border = "1px solid #4caf50";
      statusEl.style.color = "#2e7d32";
      statusEl.textContent = "✅ Открываем dashboard...";

      // Открываем dashboard
      await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });

      // Закрываем popup
      window.close();
    } else {
      console.error("❌ [POPUP] Ошибка авторизации:", response.error);

      statusEl.style.background = "#ffebee";
      statusEl.style.border = "1px solid #f44336";
      statusEl.style.color = "#c62828";
      statusEl.textContent = `❌ Ошибка: ${response.error || "Не удалось авторизоваться"}`;
      authBtn.disabled = false;
    }
  } catch (error) {
    console.error("❌ [POPUP] Ошибка авторизации:", error);

    statusEl.style.background = "#ffebee";
    statusEl.style.border = "1px solid #f44336";
    statusEl.style.color = "#c62828";
    statusEl.textContent = `❌ Ошибка: ${error.message}`;
    authBtn.disabled = false;
  }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 [POPUP] Popup загружен");

  // Добавляем обработчик кнопки авторизации
  document.getElementById("authBtn").addEventListener("click", handleAuth);

  // Проверяем авторизацию при открытии
  checkAuthAndOpenDashboard();
});
