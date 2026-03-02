// ============================================
// КЭШ ДЕДУПЛИКАЦИИ - Модуль проверки дубликатов жалоб
// ============================================
// Архитектура (v2 — record-based):
// 1. dashboard.js загружает записи (артикул + рейтинг + дата подачи) из Complaints
// 2. Сохраняет в chrome.storage.local
// 3. content.js проверяет дубликаты по ключу (артикул_рейтинг_датаПодачи)
//
// Преимущество: не зависит от формата даты отзыва WB (который может меняться)
// ============================================

const DeduplicationCache = {
  RECORDS_KEY: 'complaints_records_cache',
  CACHE_TTL: 30 * 60 * 1000, // 30 минут

  // ============================================
  // Сохранение записей в кэш (используется в dashboard.js)
  // ============================================
  async saveRecords(records, cabinetId) {
    try {
      const cacheData = {
        records: Array.from(new Set(records)), // Убираем дубликаты
        cabinetId: cabinetId,
        timestamp: Date.now(),
        count: records.length
      };

      await chrome.storage.local.set({
        [this.RECORDS_KEY]: cacheData
      });

      console.log(`[Cache] ✅ Сохранено ${cacheData.count} записей для кабинета ${cabinetId}`);
      return true;
    } catch (error) {
      console.error('[Cache] ❌ Ошибка сохранения кэша:', error);
      return false;
    }
  },

  // ============================================
  // Загрузка записей из кэша (используется в content.js)
  // ============================================
  async loadRecords(cabinetId) {
    try {
      const result = await chrome.storage.local.get(this.RECORDS_KEY);
      const cacheData = result[this.RECORDS_KEY];

      if (!cacheData) {
        console.log('[Cache] ⚠️ Кэш записей пуст');
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

      console.log(`[Cache] ✅ Загружено ${cacheData.count} записей (возраст: ${Math.round(age / 1000)}с)`);
      return new Set(cacheData.records);
    } catch (error) {
      console.error('[Cache] ❌ Ошибка загрузки кэша:', error);
      return null;
    }
  },

  // ============================================
  // Проверка дубликата по записи (артикул + рейтинг + дата подачи)
  // ============================================
  checkDuplicateByRecord(recordsSet, articul, rating, complaintDate) {
    if (!recordsSet || recordsSet.size === 0) {
      return false;
    }

    if (!articul || !complaintDate) {
      return false;
    }

    const key = `${articul}_${rating || ''}_${complaintDate}`;
    const isDuplicate = recordsSet.has(key);

    if (isDuplicate) {
      console.log(`[Cache] ⏭️ Дубликат найден (запись): ${key}`);
    }

    return isDuplicate;
  },

  // ============================================
  // Очистка кэша
  // ============================================
  async clear() {
    try {
      await chrome.storage.local.remove(this.RECORDS_KEY);
      console.log('[Cache] ✅ Кэш очищен');
      return true;
    } catch (error) {
      console.error('[Cache] ❌ Ошибка очистки кэша:', error);
      return false;
    }
  }
};

// Делаем доступным глобально
if (typeof window !== 'undefined') {
  window.DeduplicationCache = DeduplicationCache;
}

console.log('✅ Deduplication Cache модуль загружен');
