// ============================================
// R5 API Client — rating5.ru
// ============================================

class R5ApiClient {
  constructor() {
    this.baseUrl = API_BASE_URL;
    this.token = API_TOKEN;
  }

  // Базовый метод запроса
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
}

// Глобальная переменная для service worker
var r5ApiClient = new R5ApiClient();
