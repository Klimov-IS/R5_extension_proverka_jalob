// ============================================
// Google Drive OAuth2 авторизация через launchWebAuthFlow
// (Authorization Code Flow with PKCE)
// ============================================

// ============================================
// PKCE Helper Functions
// ============================================

// Генерация code_verifier (случайная строка для PKCE)
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

// Генерация code_challenge (SHA-256 хеш от verifier)
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

// Base64 URL encoding (без padding)
function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ============================================
// GoogleDriveAuth Class
// ============================================

class GoogleDriveAuth {
  constructor() {
    this.CLIENT_ID = OAUTH_CLIENT_ID;
    this.CLIENT_SECRET = OAUTH_CLIENT_SECRET;
    this.SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';
    this.REDIRECT_URI = `https://${chrome.runtime.id}.chromiumapp.org/`;
    this.tokenKey = 'googleDriveToken';
    this.refreshTokenKey = 'googleDriveRefreshToken';
  }

  // Получить токен (из кеша или новый)
  async getToken() {
    try {
      console.log('🔍 Проверяем наличие токена...');

      // Проверяем есть ли токен в storage
      const stored = await chrome.storage.local.get([this.tokenKey, this.refreshTokenKey]);

      // ✅ МИГРАЦИЯ: Если есть старый токен без refresh token (Implicit Flow)
      if (stored[this.tokenKey] && !stored[this.refreshTokenKey]) {
        console.warn('⚠️ Обнаружен старый токен без refresh token (Implicit Flow).');
        console.warn('🔄 Требуется реавторизация для получения refresh token.');

        // Удаляем старый токен
        await chrome.storage.local.remove([this.tokenKey]);

        // Запускаем новую авторизацию (Authorization Code Flow)
        console.log('🔐 Запускаем повторную авторизацию...');
        return await this.authorize();
      }

      if (stored[this.tokenKey]) {
        const tokenData = stored[this.tokenKey];

        // Проверяем не истек ли токен
        if (tokenData.expiresAt && tokenData.expiresAt > Date.now()) {
          console.log('✅ Используем кешированный токен');
          return tokenData.token;
        } else {
          console.log('⚠️ Токен истек');

          // Пытаемся обновить токен через refresh token
          if (stored[this.refreshTokenKey]) {
            console.log('🔄 Пытаемся обновить токен через refresh token...');
            try {
              const newToken = await this.refreshAccessToken(stored[this.refreshTokenKey]);
              return newToken;
            } catch (refreshError) {
              console.warn('⚠️ Не удалось обновить токен, требуется повторная авторизация');
            }
          }
        }
      }

      // Получаем новый токен
      console.log('🔐 Требуется новая авторизация');
      return await this.authorize();
    } catch (error) {
      console.error('❌ Ошибка получения токена:', error);
      throw error;
    }
  }

  // Авторизация через launchWebAuthFlow (Authorization Code Flow with PKCE)
  async authorize() {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🔐 Запуск OAuth2 Authorization Code Flow with PKCE...');

        // Генерируем PKCE параметры
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        console.log('🔑 PKCE code_verifier сгенерирован');
        console.log('🔐 PKCE code_challenge сгенерирован');

        // Формируем URL для авторизации
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.append('client_id', this.CLIENT_ID);
        authUrl.searchParams.append('response_type', 'code'); // ✅ Authorization Code Flow
        authUrl.searchParams.append('redirect_uri', this.REDIRECT_URI);
        authUrl.searchParams.append('scope', this.SCOPES);
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');
        authUrl.searchParams.append('prompt', 'consent');
        authUrl.searchParams.append('access_type', 'offline'); // ✅ Получить refresh token

        console.log('🌐 URL авторизации:', authUrl.toString());
        console.log('🔗 Redirect URI:', this.REDIRECT_URI);

        // Открываем окно авторизации
        chrome.identity.launchWebAuthFlow(
          {
            url: authUrl.toString(),
            interactive: true
          },
          async (redirectUrl) => {
            if (chrome.runtime.lastError) {
              console.error('❌ Ошибка launchWebAuthFlow:', chrome.runtime.lastError);
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            if (!redirectUrl) {
              console.error('❌ Redirect URL не получен');
              reject(new Error('Авторизация отменена или не выполнена'));
              return;
            }

            console.log('✅ Получен redirect URL:', redirectUrl);

            // Парсим authorization code из redirect URL
            try {
              const url = new URL(redirectUrl);
              const params = new URLSearchParams(url.search); // ✅ Парсим из query (не hash!)

              const authCode = params.get('code');

              if (!authCode) {
                console.error('❌ Authorization code не найден в redirect URL');
                reject(new Error('Authorization code не найден в ответе'));
                return;
              }

              console.log('✅ Authorization code получен:', authCode.substring(0, 20) + '...');

              // Обмениваем authorization code на токены
              const tokens = await this.exchangeCodeForTokens(authCode, codeVerifier);

              // Сохраняем access token + refresh token
              const accessToken = await this.saveTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);

              console.log('✅ Авторизация завершена успешно!');
              resolve(accessToken);

            } catch (error) {
              console.error('❌ Ошибка обработки redirect URL:', error);
              reject(error);
            }
          }
        );
      } catch (error) {
        console.error('❌ Ошибка генерации PKCE параметров:', error);
        reject(error);
      }
    });
  }

  // Обмен authorization code на access + refresh tokens
  async exchangeCodeForTokens(authCode, codeVerifier) {
    console.log('🔄 Обмен authorization code на токены...');

    const tokenUrl = 'https://oauth2.googleapis.com/token';

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: authCode,
        client_id: this.CLIENT_ID,
        client_secret: this.CLIENT_SECRET,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: this.REDIRECT_URI
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка обмена кода: ${response.status} ${errorText}`);
    }

    const tokens = await response.json();
    console.log('✅ Токены получены:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in
    });

    return tokens;
  }

  // Сохранение токенов (access + refresh) в chrome.storage
  async saveTokens(accessToken, refreshToken, expiresIn) {
    const tokenData = {
      token: accessToken,
      expiresAt: Date.now() + (expiresIn * 1000) - 60000 // Минус 1 минута для безопасности
    };

    console.log('💾 Сохраняем токены в storage...');
    console.log('📅 Access token истекает:', new Date(tokenData.expiresAt).toLocaleString());
    console.log('🔑 Refresh token:', refreshToken ? 'Есть ✅' : 'Нет ❌');

    await chrome.storage.local.set({
      [this.tokenKey]: tokenData,
      [this.refreshTokenKey]: refreshToken
    });

    console.log('✅ Токены успешно сохранены');
    return accessToken;
  }

  // Обновление access token через refresh token
  async refreshAccessToken(refreshToken) {
    console.log('🔄 Обновление access token через refresh token...');

    const tokenUrl = 'https://oauth2.googleapis.com/token';

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.CLIENT_ID,
          client_secret: this.CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });

      if (!response.ok) {
        if (response.status === 400) {
          // Refresh token недействителен - требуется реавторизация
          console.warn('⚠️ Refresh token недействителен. Требуется повторная авторизация.');
          await chrome.storage.local.remove([this.tokenKey, this.refreshTokenKey]);
          return await this.authorize();
        }

        const errorText = await response.text();
        throw new Error(`Ошибка обновления токена: ${response.status} ${errorText}`);
      }

      const tokens = await response.json();
      console.log('✅ Access token обновлен, срок действия:', tokens.expires_in, 'секунд');

      // Сохраняем новый access token (refresh token остается прежним)
      const tokenData = {
        token: tokens.access_token,
        expiresAt: Date.now() + (tokens.expires_in * 1000) - 60000
      };

      await chrome.storage.local.set({ [this.tokenKey]: tokenData });
      console.log('💾 Новый access token сохранен');

      return tokens.access_token;

    } catch (error) {
      console.error('❌ Ошибка обновления токена:', error);
      throw error;
    }
  }

  // Проверка авторизации
  async isAuthorized() {
    try {
      console.log('🔍 Проверяем авторизацию в isAuthorized()...');
      const stored = await chrome.storage.local.get([this.tokenKey]);

      console.log('📦 Данные из storage:', stored);

      if (!stored[this.tokenKey]) {
        console.log('❌ Токен не найден в storage');
        return false;
      }

      const tokenData = stored[this.tokenKey];
      console.log('📋 Token data:', {
        hasToken: !!tokenData.token,
        expiresAt: tokenData.expiresAt,
        now: Date.now(),
        isValid: tokenData.expiresAt > Date.now()
      });

      // Проверяем не истек ли токен
      if (tokenData.expiresAt && tokenData.expiresAt > Date.now()) {
        console.log('✅ Токен валиден');
        return true;
      }

      console.log('❌ Токен истек');
      return false;
    } catch (error) {
      console.error('❌ Ошибка проверки авторизации:', error);
      return false;
    }
  }

  // Выход (удаление токена)
  async signOut() {
    try {
      console.log('🚪 Выполняем выход из Google Drive...');

      // Удаляем токены из storage
      await chrome.storage.local.remove([this.tokenKey, this.refreshTokenKey]);

      console.log('✅ Токены удалены, выход выполнен');
    } catch (error) {
      console.error('❌ Ошибка выхода:', error);
      throw error;
    }
  }
}

// Создаем глобальную переменную для использования в service worker
var googleDriveAuth = new GoogleDriveAuth();
