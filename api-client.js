// ============================================
// R5 API Client — rating5.ru
// ============================================

class R5ApiClient {
  constructor() {
    this.baseUrl = API_BASE_URL;
    this.token = API_TOKEN;
  }

  // Базовый метод запроса (GET)
  async request(endpoint) {
    const url = `${this.baseUrl}${endpoint}`;
    console.log(`🌐 [API] GET ${url}`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [API] Ошибка ${response.status}: ${errorText}`);
      throw new Error(`API ошибка: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  // Базовый метод запроса (POST)
  async requestPost(endpoint, body) {
    const url = `${this.baseUrl}${endpoint}`;
    console.log(`🌐 [API] POST ${url}`, `(${body.results?.length || 0} записей)`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [API] Ошибка POST ${response.status}: ${errorText}`);
      throw new Error(`API ошибка: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  // GET /api/extension/stores — список магазинов
  async getStores() {
    try {
      const stores = await this.request('/api/extension/stores');
      const activeStores = stores.filter(s => s.isActive);
      console.log(`✅ [API] Получено магазинов: ${stores.length}, активных: ${activeStores.length}`);
      return activeStores;
    } catch (error) {
      console.error('❌ [API] Ошибка получения магазинов:', error);
      throw error;
    }
  }

  // GET /api/extension/stores/{storeId}/active-products — артикулы магазина
  async getActiveProducts(storeId) {
    try {
      const data = await this.request(`/api/extension/stores/${storeId}/active-products`);
      const articuls = data.products.map(p => p.wb_product_id);
      console.log(`✅ [API] Магазин ${storeId}: получено ${articuls.length} артикулов`);
      return { products: data.products, articuls };
    } catch (error) {
      console.error(`❌ [API] Ошибка получения артикулов для ${storeId}:`, error);
      throw error;
    }
  }

  // POST /api/extension/complaint-statuses — отправка статусов жалоб
  async postComplaintStatuses(storeId, results) {
    const BATCH_SIZE = 500;
    let totalReceived = 0, totalUpdated = 0, totalSkipped = 0;

    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE);
      console.log(`📤 [API] Отправка батча ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} статусов`);

      const response = await this.requestPost('/api/extension/complaint-statuses', {
        storeId,
        results: batch
      });

      if (response.data) {
        totalReceived += response.data.received || 0;
        totalUpdated += response.data.reviewsUpdated || 0;
        totalSkipped += response.data.skipped || 0;
      }
    }

    console.log(`✅ [API] Статусы отправлены: получено ${totalReceived}, обновлено ${totalUpdated}, пропущено ${totalSkipped}`);
    return { received: totalReceived, updated: totalUpdated, skipped: totalSkipped };
  }

  // POST /api/extension/complaint-details — отправка данных одобренной жалобы
  async postComplaintDetails(storeId, complaint) {
    console.log(`📤 [API] Отправка complaint-details: ${complaint.articul}, ${complaint.fileName}`);

    const response = await this.requestPost('/api/extension/complaint-details', {
      storeId,
      complaint
    });

    console.log(`✅ [API] complaint-details: created=${response.data?.created}`);
    return response;
  }
}

// Глобальная переменная для service worker
var r5ApiClient = new R5ApiClient();
