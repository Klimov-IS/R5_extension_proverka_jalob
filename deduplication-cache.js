// ============================================
// КЭШ ДЕДУПЛИКАЦИИ - Простой модуль для работы с chrome.storage
// ============================================
// Назначение: Хранение списка существующих скриншотов из Complaints
// для быстрой проверки дубликатов без сетевых запросов.
//
// Архитектура:
// 1. popup.js загружает данные из Complaints при выборе кабинета
// 2. Сохраняет в chrome.storage.local
// 3. content.js читает из кэша и проверяет дубликаты мгновенно
// ============================================

const DeduplicationCache = {
  CACHE_KEY: 'complaints_filenames_cache',
  CACHE_TTL: 30 * 60 * 1000, // 30 минут

  // ============================================
  // Сохранение данных в кэш (используется в popup.js)
  // ============================================
  async save(filenames, cabinetId) {
    try {
      const cacheData = {
        filenames: Array.from(new Set(filenames)), // Убираем дубликаты
        cabinetId: cabinetId,
        timestamp: Date.now(),
        count: filenames.length
      };

      await chrome.storage.local.set({
        [this.CACHE_KEY]: cacheData
      });

      console.log(`[Cache] ✅ Сохранено ${cacheData.count} имён файлов для кабинета ${cabinetId}`);
      return true;
    } catch (error) {
      console.error('[Cache] ❌ Ошибка сохранения кэша:', error);
      return false;
    }
  },

  // ============================================
  // Загрузка данных из кэша (используется в content.js)
  // ============================================
  async load(cabinetId) {
    try {
      const result = await chrome.storage.local.get(this.CACHE_KEY);
      const cacheData = result[this.CACHE_KEY];

      if (!cacheData) {
        console.log('[Cache] ⚠️ Кэш пуст');
        return null;
      }

      // Проверяем, что кэш для нужного кабинета
      if (cacheData.cabinetId !== cabinetId) {
        console.log(`[Cache] ⚠️ Кэш для другого кабинета (кэш: ${cacheData.cabinetId}, нужен: ${cabinetId})`);
        return null;
      }

      // Проверяем актуальность кэша
      const age = Date.now() - cacheData.timestamp;
      if (age > this.CACHE_TTL) {
        console.log(`[Cache] ⚠️ Кэш устарел (возраст: ${Math.round(age / 1000)}с)`);
        return null;
      }

      console.log(`[Cache] ✅ Загружено ${cacheData.count} имён файлов (возраст: ${Math.round(age / 1000)}с)`);
      return new Set(cacheData.filenames);
    } catch (error) {
      console.error('[Cache] ❌ Ошибка загрузки кэша:', error);
      return null;
    }
  },

  // ============================================
  // Очистка кэша
  // ============================================
  async clear() {
    try {
      await chrome.storage.local.remove(this.CACHE_KEY);
      console.log('[Cache] ✅ Кэш очищен');
      return true;
    } catch (error) {
      console.error('[Cache] ❌ Ошибка очистки кэша:', error);
      return false;
    }
  },

  // ============================================
  // Генерация имени файла из данных отзыва
  // ============================================
  // Формат: {Артикул}_{DD.MM.YY_HH-mm}.png
  // Пример: 38726376_12.12.25_20-14.png
  generateFilename(articul, feedbackDate) {
    if (!articul || !feedbackDate) {
      console.warn('[Cache] ⚠️ Недостаточно данных для генерации имени файла');
      return null;
    }

    try {
      // Парсим дату из формата "12 дек. 2025 г. в 20:14"
      const dateStr = feedbackDate.replace(/\u00A0/g, ' ').trim().toLowerCase();

      // Мапа месяцев
      const months = {
        'янв': '01', 'января': '01', 'январь': '01',
        'фев': '02', 'февраля': '02', 'февраль': '02',
        'мар': '03', 'марта': '03', 'март': '03',
        'апр': '04', 'апреля': '04', 'апрель': '04',
        'май': '05', 'мая': '05',
        'июн': '06', 'июня': '06', 'июнь': '06',
        'июл': '07', 'июля': '07', 'июль': '07',
        'авг': '08', 'августа': '08', 'август': '08',
        'сен': '09', 'сентября': '09', 'сент': '09', 'сентябрь': '09',
        'окт': '10', 'октября': '10', 'октябрь': '10',
        'ноя': '11', 'ноября': '11', 'ноябрь': '11',
        'дек': '12', 'декабря': '12', 'декабрь': '12',
      };

      // Regex для парсинга даты
      const datePattern = /(\d{1,2})\s+([а-яё]+)\.?\s+(\d{4})\s*(?:г\.?)?\s*(?:в\s*)?(\d{1,2}):(\d{2})/i;
      const match = dateStr.match(datePattern);

      if (!match) {
        console.warn('[Cache] ⚠️ Не удалось распарсить дату:', feedbackDate);
        return null;
      }

      let [, day, monthName, year, hour, minute] = match;

      // Нормализуем значения
      day = day.padStart(2, '0');
      hour = hour.padStart(2, '0');
      minute = minute.padStart(2, '0');

      // Находим месяц
      let month = months[monthName];
      if (!month) {
        // Пробуем найти по префиксу
        for (const key in months) {
          if (monthName.startsWith(key)) {
            month = months[key];
            break;
          }
        }
      }

      if (!month) {
        console.warn('[Cache] ⚠️ Не удалось определить месяц:', monthName);
        return null;
      }

      // Формат года: последние 2 цифры
      const shortYear = String(year).slice(-2);

      // Итоговое имя файла
      const filename = `${articul}_${day}.${month}.${shortYear}_${hour}-${minute}.png`;

      return filename;
    } catch (error) {
      console.error('[Cache] ❌ Ошибка генерации имени файла:', error);
      return null;
    }
  },

  // ============================================
  // Проверка существования скриншота
  // ============================================
  checkDuplicate(filenamesSet, articul, feedbackDate) {
    if (!filenamesSet || filenamesSet.size === 0) {
      console.warn('[Cache] ⚠️ Набор имён файлов пуст');
      return false;
    }

    const filename = this.generateFilename(articul, feedbackDate);
    if (!filename) {
      return false;
    }

    const isDuplicate = filenamesSet.has(filename);

    if (isDuplicate) {
      console.log(`[Cache] ⏭️ Дубликат найден: ${filename}`);
    }

    return isDuplicate;
  }
};

// Делаем доступным глобально
if (typeof window !== 'undefined') {
  window.DeduplicationCache = DeduplicationCache;
}

console.log('✅ Deduplication Cache модуль загружен');
