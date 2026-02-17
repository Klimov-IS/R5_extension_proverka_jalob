// ============================================
// Google Drive API v3 - Работа с файлами и папками
// ============================================

class GoogleDriveAPI {
  constructor() {
    this.baseUrl = 'https://www.googleapis.com/drive/v3';
    this.uploadUrl = 'https://www.googleapis.com/upload/drive/v3';
    // ❌ Удален in-memory кеш: this.folderCache = {};
    // ✅ Используем chrome.storage.session для persistent кеша
  }

  // ============================================
  // CACHE MANAGEMENT (Persistent)
  // ============================================

  async getCachedFolderId(cacheKey) {
    try {
      const result = await chrome.storage.session.get(`folder_${cacheKey}`);
      return result[`folder_${cacheKey}`] || null;
    } catch (error) {
      console.warn(`⚠️ Ошибка чтения кеша для "${cacheKey}":`, error);
      return null;
    }
  }

  async setCachedFolderId(cacheKey, folderId) {
    try {
      await chrome.storage.session.set({ [`folder_${cacheKey}`]: folderId });
      console.log(`💾 Кеш сохранен: folder_${cacheKey} = ${folderId}`);
    } catch (error) {
      console.warn(`⚠️ Ошибка сохранения кеша для "${cacheKey}":`, error);
    }
  }

  async removeCachedFolderId(cacheKey) {
    try {
      await chrome.storage.session.remove(`folder_${cacheKey}`);
      console.log(`🗑️ Кеш удален: folder_${cacheKey}`);
    } catch (error) {
      console.warn(`⚠️ Ошибка удаления кеша для "${cacheKey}":`, error);
    }
  }

  async clearCabinetCache(cabinetFolderId) {
    try {
      const allKeys = await chrome.storage.session.get();
      const keysToRemove = Object.keys(allKeys).filter(key =>
        key.startsWith(`folder_${cabinetFolderId}/`)
      );

      if (keysToRemove.length > 0) {
        await chrome.storage.session.remove(keysToRemove);
        console.log(`🗑️ Очищен кеш для кабинета ${cabinetFolderId}: ${keysToRemove.length} папок`);
      }
    } catch (error) {
      console.warn(`⚠️ Ошибка очистки кеша кабинета:`, error);
    }
  }

  // ============================================
  // FOLDER VALIDATION
  // ============================================

  async validateFolder(token, folderId) {
    try {
      console.log(`🔍 Валидация папки ${folderId}...`);

      const response = await fetch(
        `${this.baseUrl}/files/${folderId}?fields=id,name,trashed,mimeType`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`❌ Папка ${folderId} не существует (404)`);
          return false;
        }
        throw new Error(`Ошибка проверки папки: ${response.status}`);
      }

      const data = await response.json();

      if (data.trashed) {
        console.log(`🗑️ Папка ${folderId} (${data.name}) в корзине`);
        return false;
      }

      if (data.mimeType !== 'application/vnd.google-apps.folder') {
        console.log(`❌ ${folderId} не является папкой`);
        return false;
      }

      console.log(`✅ Папка ${folderId} (${data.name}) валидна`);
      return true;
    } catch (error) {
      console.error(`❌ Ошибка валидации папки ${folderId}:`, error);
      return false;
    }
  }

  // ============================================
  // FOLDER SEARCH
  // ============================================

  // Поиск папки по имени в родительской папке
  async findFolder(token, folderName, parentId = 'root') {
    try {
      const cacheKey = `${parentId}/${folderName}`;

      // Шаг 1: Проверяем persistent кеш
      const cachedId = await this.getCachedFolderId(cacheKey);
      if (cachedId) {
        console.log(`🔍 [CACHE] Проверяем кешированную папку "${folderName}" (${cachedId})...`);

        // НОВОЕ: Валидируем папку из кеша
        const isValid = await this.validateFolder(token, cachedId);

        if (isValid) {
          console.log(`✅ [CACHE] Кешированная папка "${folderName}" валидна`);
          return cachedId;
        } else {
          console.log(`❌ [CACHE] Кешированная папка невалидна, удаляем из кеша`);
          await this.removeCachedFolderId(cacheKey);
          // Продолжаем поиск через API
        }
      }

      // Шаг 2: Ищем через Google Drive API
      // Экранируем спецсимволы в названии папки
      const escapedFolderName = folderName.replace(/'/g, "\\'");
      const query = `name='${escapedFolderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;

      console.log(`🔍 [API] Ищем папку "${folderName}" через Drive API...`);

      const response = await fetch(
        `${this.baseUrl}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Ошибка поиска папки: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.files && data.files.length > 0) {
        const folderId = data.files[0].id;

        // Сохраняем в persistent кеш
        await this.setCachedFolderId(cacheKey, folderId);

        console.log(`✅ [API] Папка "${folderName}" найдена: ${folderId}`);
        return folderId;
      }

      console.log(`➕ [API] Папка "${folderName}" не найдена`);
      return null;
    } catch (error) {
      console.error(`❌ Ошибка поиска папки "${folderName}":`, error);
      throw error;
    }
  }

  // Создание папки
  async createFolder(token, folderName, parentId = 'root') {
    try {
      const metadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      };

      const response = await fetch(`${this.baseUrl}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      });

      if (!response.ok) {
        throw new Error(`Ошибка создания папки: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const folderId = data.id;

      // Сохраняем в persistent кеш
      const cacheKey = `${parentId}/${folderName}`;
      await this.setCachedFolderId(cacheKey, folderId);

      console.log(`✅ Папка "${folderName}" создана: ${folderId}`);
      return folderId;
    } catch (error) {
      console.error(`❌ Ошибка создания папки "${folderName}":`, error);
      throw error;
    }
  }

  // Получить или создать папку
  async getOrCreateFolder(token, folderName, parentId = 'root') {
    try {
      console.log(`📁 [getOrCreateFolder] Получаем/создаем папку "${folderName}" в родителе ${parentId}`);

      // Шаг 1: Пытаемся найти через findFolder (проверит кеш + API)
      let folderId = await this.findFolder(token, folderName, parentId);

      if (folderId) {
        console.log(`✅ [getOrCreateFolder] Папка "${folderName}" найдена: ${folderId}`);
        return folderId;
      }

      // Шаг 2: Папка не найдена → создаем новую
      console.log(`➕ [getOrCreateFolder] Папка "${folderName}" не найдена, создаем новую...`);
      folderId = await this.createFolder(token, folderName, parentId);
      console.log(`✅ [getOrCreateFolder] Папка "${folderName}" создана: ${folderId}`);

      return folderId;
    } catch (error) {
      console.error(`❌ Ошибка получения/создания папки "${folderName}":`, error);
      throw error;
    }
  }

  // Загрузка файла (base64 image → Google Drive)
  async uploadFile(token, fileName, base64Data, parentFolderId) {
    try {
      // НОВОЕ: Проверяем папку перед загрузкой
      console.log(`🔍 Проверяем папку ${parentFolderId} перед загрузкой файла "${fileName}"...`);
      const folderExists = await this.validateFolder(token, parentFolderId);

      if (!folderExists) {
        throw new Error(`Папка ${parentFolderId} не существует или в корзине. Невозможно загрузить файл "${fileName}".`);
      }

      console.log(`✅ Папка ${parentFolderId} валидна, начинаем загрузку...`);

      // Конвертируем base64 в blob
      const blob = this.base64ToBlob(base64Data);

      // Metadata файла
      const metadata = {
        name: fileName,
        parents: [parentFolderId],
      };

      // Multipart upload
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadataPart = delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata);
      const dataPart = delimiter + 'Content-Type: image/png\r\n' + 'Content-Transfer-Encoding: base64\r\n\r\n' + base64Data.split(',')[1];

      const multipartRequestBody = metadataPart + dataPart + closeDelimiter;

      const response = await fetch(`${this.uploadUrl}/files?uploadType=multipart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка загрузки файла: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Файл "${fileName}" загружен на Drive: ${data.id}`);
      return data.id;
    } catch (error) {
      console.error(`❌ Ошибка загрузки файла "${fileName}":`, error);
      throw error;
    }
  }

  // Конвертация base64 в Blob
  base64ToBlob(base64Data) {
    const parts = base64Data.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = self.atob(parts[1]); // self вместо window для service worker
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
  }

  // Полный процесс: создание структуры папок + загрузка файла
  async uploadScreenshot(token, cabinetName, articul, fileName, base64Data) {
    try {
      console.log(`📁 Загрузка: WB_feedbacks/${cabinetName}/${articul}/${fileName}`);

      // 1. Получаем/создаем корневую папку WB_feedbacks
      const rootFolderId = await this.getOrCreateFolder(token, 'WB_feedbacks', 'root');
      console.log(`📂 Корневая папка WB_feedbacks: ${rootFolderId}`);

      // 2. Получаем/создаем папку кабинета внутри WB_feedbacks
      const cabinetFolderId = await this.getOrCreateFolder(token, cabinetName, rootFolderId);
      console.log(`📂 Папка кабинета ${cabinetName}: ${cabinetFolderId}`);

      // 3. Получаем/создаем папку артикула внутри кабинета
      const articulFolderId = await this.getOrCreateFolder(token, articul, cabinetFolderId);
      console.log(`📂 Папка артикула ${articul}: ${articulFolderId}`);

      // 4. Загружаем файл
      const fileId = await this.uploadFile(token, fileName, base64Data, articulFolderId);

      console.log(`✅ Скриншот успешно загружен на Drive!`);
      return fileId;
    } catch (error) {
      console.error(`❌ Ошибка загрузки скриншота:`, error);
      throw error;
    }
  }

  // Проверка существования файла в папке
  async fileExists(token, folderId, fileName) {
    try {
      console.log(`🔍 Проверяем существование файла "${fileName}" в папке ${folderId}`);

      const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;

      const response = await fetch(
        `${this.baseUrl}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Ошибка проверки файла: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.files && data.files.length > 0) {
        console.log(`✅ Файл "${fileName}" уже существует`);
        return true;
      }

      console.log(`➕ Файл "${fileName}" не найден, можно загружать`);
      return false;
    } catch (error) {
      console.error(`❌ Ошибка проверки существования файла "${fileName}":`, error);
      // В случае ошибки считаем что файла нет (безопаснее загрузить дубликат)
      return false;
    }
  }

  // Очистка всего кеша папок (при необходимости)
  async clearAllCache() {
    try {
      const allKeys = await chrome.storage.session.get();
      const folderKeys = Object.keys(allKeys).filter(key => key.startsWith('folder_'));

      if (folderKeys.length > 0) {
        await chrome.storage.session.remove(folderKeys);
        console.log(`🗑️ Очищен весь кеш папок: ${folderKeys.length} записей`);
      } else {
        console.log('ℹ️ Кеш папок уже пуст');
      }
    } catch (error) {
      console.warn('⚠️ Ошибка очистки кеша:', error);
    }
  }
}

// Создаем глобальную переменную для использования в service worker
var googleDriveAPI = new GoogleDriveAPI();
