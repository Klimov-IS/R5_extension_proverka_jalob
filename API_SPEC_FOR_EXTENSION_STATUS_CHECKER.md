# API Спецификация: Расширение для проверки статусов жалоб

> **Статус:** API уже реализован и работает в продакшене.
> **Новых эндпоинтов создавать НЕ нужно.**
> **Base URL:** `https://rating5.ru`

---

## Оглавление

1. [Контекст](#контекст)
2. [Аутентификация](#аутентификация)
3. [Рабочий процесс расширения](#рабочий-процесс-расширения)
4. [Эндпоинт 1: Список магазинов](#1-список-магазинов)
5. [Эндпоинт 2: Активные артикулы магазина](#2-активные-артикулы-магазина)
6. [Эндпоинт 3: Задачи на парсинг статусов](#3-задачи-на-парсинг-статусов)
7. [Эндпоинт 4: Отправка результатов парсинга](#4-отправка-результатов-парсинга)
8. [Маппинг: Google Sheets → API](#маппинг-google-sheets--api)
9. [Коды ошибок](#коды-ошибок)
10. [Лимиты и ограничения](#лимиты-и-ограничения)

---

## Контекст

Второе расширение R5 проверяет статусы жалоб на WB. Его задачи:
1. Получить список **активных магазинов** (кабинетов)
2. Получить **активные артикулы** для каждого магазина
3. Получить **список отзывов**, которым нужна проверка статуса
4. Отправить обратно **результаты парсинга** (одобрена/отклонена/на проверке)

Все 4 шага уже обеспечены существующими API-эндпоинтами.

---

## Аутентификация

Все запросы требуют API-токен в заголовке `Authorization`.

```
Authorization: Bearer wbrm_XXXXXXXXXXXXXXXXXXXXX
```

**Формат токена:** начинается с `wbrm_`
**Где хранится:** таблица `user_settings`, поле `api_key`
**Один токен = один пользователь = все его магазины**

### Проверка токена (опционально)

```
GET /api/extension/auth/verify
```

**Response 200:**
```json
{
  "valid": true,
  "user": {
    "id": "user_abc123",
    "email": "ivan@example.com",
    "name": "Иван"
  },
  "stores": ["store_id_1", "store_id_2", "store_id_3"]
}
```

**Response 401:**
```json
{
  "error": "Unauthorized",
  "message": "Invalid token"
}
```

---

## Рабочий процесс расширения

```
┌──────────────────────────────────────────────────────────────┐
│                      АЛГОРИТМ РАБОТЫ                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. GET /api/extension/stores                                │
│     → Получить список магазинов                              │
│     → Отфильтровать: isActive === true                       │
│                                                              │
│  2. GET /api/extension/stores/{storeId}/active-products      │
│     → Получить активные артикулы (wb_product_id)             │
│     → Это список артикулов для ввода на странице жалоб WB    │
│                                                              │
│  3. Для каждого артикула на странице жалоб WB:               │
│                                                              │
│     3a. Расширение вводит артикул на странице жалоб WB       │
│     3b. Парсит карточки отзывов:                             │
│         → Артикул (nmId) — уже известен                      │
│         → Рейтинг (1-5)                                      │
│         → Дата отзыва (до минуты)                            │
│         → Статус жалобы (русская строка)                     │
│     3c. Формирует reviewKey: "{nmId}_{rating}_{date}"        │
│                                                              │
│  4. POST /api/extension/complaint-statuses                   │
│     → Отправить батч: [{reviewKey, status}, ...]             │
│     → 2 SQL-запроса на весь батч (не на каждый отзыв!)       │
│     → Максимальная скорость обновления                       │
│                                                              │
│  5. Готово. Бэкенд обновил reviews + review_complaints       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. Список магазинов

```
GET /api/extension/stores
```

**Headers:**
```
Authorization: Bearer wbrm_XXXXXXXXXXXXXXXXXXXXX
```

**Response 200:**
```json
[
  {
    "id": "7kKX9WgLvOPiXYIHk6hi",
    "name": "ИП Артюшина",
    "isActive": true,
    "draftComplaintsCount": 45
  },
  {
    "id": "abc123def456",
    "name": "MariKollection",
    "isActive": true,
    "draftComplaintsCount": 12
  },
  {
    "id": "xyz789",
    "name": "Старый магазин",
    "isActive": false,
    "draftComplaintsCount": 0
  }
]
```

### Описание полей

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Уникальный ID магазина (используется в URL других эндпоинтов) |
| `name` | string | Название магазина (= название кабинета WB) |
| `isActive` | boolean | `true` = магазин активен, `false` = приостановлен/отключён |
| `draftComplaintsCount` | number | Количество готовых черновиков жалоб (для UI статистики) |

### Фильтрация на стороне расширения

Расширение должно работать **только с активными магазинами**:
```javascript
const stores = await fetchStores();
const activeStores = stores.filter(s => s.isActive);
```

### Rate Limit
- **100 запросов в минуту** на один токен
- При превышении: `429 Too Many Requests`
- Заголовки ответа: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 2. Активные артикулы магазина

```
GET /api/extension/stores/{storeId}/active-products
```

**Headers:**
```
Authorization: Bearer wbrm_XXXXXXXXXXXXXXXXXXXXX
```

**Response 200:**
```json
{
  "products": [
    {
      "id": "7kKX9WgLvOPiXYIHk6hi_766104062",
      "wb_product_id": "766104062",
      "vendor_code": "ART-001-BLK",
      "name": "Футболка мужская оверсайз хлопок",
      "work_status": "active",
      "rules": {
        "submit_complaints": true,
        "complaint_rating_1": true,
        "complaint_rating_2": true,
        "complaint_rating_3": false,
        "complaint_rating_4": false,
        "work_in_chats": true,
        "chat_strategy": null
      }
    },
    {
      "id": "7kKX9WgLvOPiXYIHk6hi_123456789",
      "wb_product_id": "123456789",
      "vendor_code": "ART-002-WHT",
      "name": "Платье летнее",
      "work_status": "active",
      "rules": {
        "submit_complaints": true,
        "complaint_rating_1": true,
        "complaint_rating_2": false,
        "complaint_rating_3": false,
        "complaint_rating_4": false,
        "work_in_chats": false,
        "chat_strategy": null
      }
    }
  ]
}
```

### Описание полей

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Внутренний ID продукта (формат: `{storeId}_{nmId}`) |
| `wb_product_id` | string | **Артикул WB (nmId)** — используется для навигации по WB |
| `vendor_code` | string | Артикул поставщика |
| `name` | string | Название товара |
| `work_status` | string | Всегда `"active"` (неактивные не возвращаются) |
| `rules.submit_complaints` | boolean | Подавать ли жалобы на этот товар |
| `rules.complaint_rating_1..4` | boolean | На какие рейтинги подавать жалобы |
| `rules.work_in_chats` | boolean | Работать ли с чатами по этому товару |

### Важно
- Этот эндпоинт возвращает **только активные** товары (`work_status = 'active'`)
- Фильтрация уже применена на бэкенде, дополнительная не нужна
- `wb_product_id` — это то, что на WB называется "nmId" или "артикул"

---

## 3. Задачи на парсинг статусов

```
GET /api/extension/stores/{storeId}/tasks
```

Это **главный эндпоинт** для расширения-чекера. Возвращает все задачи, сгруппированные по артикулу.

**Headers:**
```
Authorization: Bearer wbrm_XXXXXXXXXXXXXXXXXXXXX
```

**Response 200:**
```json
{
  "storeId": "7kKX9WgLvOPiXYIHk6hi",
  "articles": {
    "766104062": {
      "nmId": "766104062",
      "statusParses": [
        {
          "reviewId": "review_abc123",
          "reviewKey": "766104062_1_2026-01-15T10:30",
          "rating": 1,
          "date": "2026-01-15T10:30:37.000Z",
          "authorName": "Покупатель А.",
          "text": "Ужасное качество, швы расходятся...",
          "currentComplaintStatus": "draft",
          "currentChatStatus": null,
          "currentReviewStatus": null
        },
        {
          "reviewId": "review_def456",
          "reviewKey": "766104062_2_2026-01-20T14:15",
          "rating": 2,
          "date": "2026-01-20T14:15:22.000Z",
          "authorName": "Мария К.",
          "text": "Не соответствует описанию...",
          "currentComplaintStatus": null,
          "currentChatStatus": null,
          "currentReviewStatus": null
        }
      ],
      "chatOpens": [],
      "complaints": []
    },
    "123456789": {
      "nmId": "123456789",
      "statusParses": [
        {
          "reviewId": "review_ghi789",
          "reviewKey": "123456789_1_2026-02-01T09:45",
          "rating": 1,
          "date": "2026-02-01T09:45:11.000Z",
          "authorName": "Елена В.",
          "text": "Пришло с браком...",
          "currentComplaintStatus": "pending",
          "currentChatStatus": null,
          "currentReviewStatus": null
        }
      ],
      "chatOpens": [],
      "complaints": []
    }
  },
  "totals": {
    "statusParses": 3,
    "chatOpens": 0,
    "chatOpensNew": 0,
    "chatLinks": 0,
    "complaints": 0,
    "articles": 2
  },
  "totalCounts": {
    "statusParses": 150,
    "chatOpens": 0,
    "chatOpensNew": 0,
    "chatLinks": 0,
    "complaints": 0
  },
  "limits": {
    "maxChatsPerRun": 50,
    "maxComplaintsPerRun": 300,
    "cooldownBetweenChatsMs": 3000,
    "cooldownBetweenComplaintsMs": 1000
  }
}
```

### Для расширения-чекера важно поле `statusParses`

| Поле | Тип | Описание |
|------|-----|----------|
| `reviewId` | string | Внутренний ID отзыва (для справки) |
| `reviewKey` | string | **Ключ для поиска отзыва на странице WB** — формат: `{nmId}_{rating}_{YYYY-MM-DDTHH:mm}` |
| `rating` | number | Рейтинг отзыва (1-5) |
| `date` | string | Дата отзыва (ISO 8601) |
| `authorName` | string | Имя автора (для визуальной верификации) |
| `text` | string | Текст отзыва (для поиска на странице) |
| `currentComplaintStatus` | string\|null | Текущий статус жалобы в нашей БД (`null`, `draft`, `pending`, `approved`, `rejected`) |
| `currentChatStatus` | string\|null | Текущий статус чата в нашей БД |
| `currentReviewStatus` | string\|null | Текущий статус отзыва на WB |

### Остальные поля ответа

`chatOpens` и `complaints` предназначены для **первого расширения** (подача жалоб и открытие чатов). Расширение-чекер может их игнорировать.

### Лимиты
- `statusParses` возвращает до **500 отзывов** за запрос
- `totalCounts.statusParses` показывает **общее количество** (без LIMIT) — для прогресс-бара
- Данные уже отфильтрованы: только активные товары, только WB, только не-удалённые отзывы

---

## 4. Отправка статусов жалоб (быстрый эндпоинт)

```
POST /api/extension/complaint-statuses
```

Специализированный эндпоинт для расширения-чекера жалоб. **Минимальный контракт, максимальная скорость:** всего 2 поля на отзыв, 2 SQL-запроса на весь батч.

**Headers:**
```
Authorization: Bearer wbrm_XXXXXXXXXXXXXXXXXXXXX
Content-Type: application/json
```

**Request Body:**
```json
{
  "storeId": "7kKX9WgLvOPiXYIHk6hi",
  "results": [
    { "reviewKey": "766104062_1_2026-01-15T10:30", "status": "Жалоба одобрена" },
    { "reviewKey": "766104062_2_2026-01-20T14:15", "status": "Жалоба отклонена" },
    { "reviewKey": "123456789_1_2026-02-01T09:45", "status": "Проверяем жалобу" },
    { "reviewKey": "123456789_3_2026-02-05T16:22", "status": "Жалоба пересмотрена" }
  ]
}
```

### Описание полей запроса

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `storeId` | string | Да | ID магазина |
| `results` | array | Да | Массив результатов (макс. **500** шт.) |
| `results[].reviewKey` | string | Да | Ключ отзыва: `{nmId}_{rating}_{YYYY-MM-DDTHH:mm}` |
| `results[].status` | string | Да | **Русская строка** статуса жалобы с WB |

> **Всего 2 поля на отзыв!** reviewKey уже содержит артикул, рейтинг и дату — бэкенд парсит их сам.

### Формирование reviewKey

Расширение на странице жалоб WB видит для каждого отзыва:
- **Артикул** (nmId) — уже известен (расширение его вводит)
- **Рейтинг** — количество звёзд (1-5)
- **Дата** — дата и время отзыва

```javascript
// Формирование reviewKey в расширении:
function buildReviewKey(nmId, rating, reviewDate) {
  // reviewDate: "15 января 2026 г., 10:30" → "2026-01-15T10:30"
  const d = parseWbDate(reviewDate); // ваш парсер даты WB
  const iso = d.toISOString().slice(0, 16); // "2026-01-15T10:30"
  return `${nmId}_${rating}_${iso}`;
}

// Пример:
buildReviewKey("766104062", 1, "2026-01-15T10:30:37Z")
// → "766104062_1_2026-01-15T10:30"
```

### Маппинг статусов WB → Наша система

Расширение передаёт **оригинальные русские строки** — бэкенд маппит автоматически:

| Статус на WB (поле `status`) | Наш статус | Описание |
|------------------------------|------------|----------|
| `"Жалоба одобрена"` | `approved` | Жалоба принята, отзыв удалён/скрыт |
| `"Жалоба отклонена"` | `rejected` | Жалоба отклонена |
| `"Проверяем жалобу"` | `pending` | На рассмотрении |
| `"Жалоба пересмотрена"` | `reconsidered` | Пересмотр после отклонения |

> Если расширение передаёт строку, которой нет в маппинге — она будет пропущена (попадёт в `skipped`).

**Response 200:**
```json
{
  "success": true,
  "data": {
    "received": 4,
    "valid": 4,
    "reviewsUpdated": 3,
    "complaintsUpdated": 3,
    "skipped": 0
  },
  "elapsed": 45
}
```

### Описание полей ответа

| Поле | Тип | Описание |
|------|-----|----------|
| `received` | number | Сколько записей получено в запросе |
| `valid` | number | Сколько прошло валидацию (известный статус + валидный reviewKey) |
| `reviewsUpdated` | number | Сколько отзывов обновлено в таблице `reviews` |
| `complaintsUpdated` | number | Сколько записей обновлено в таблице `review_complaints` |
| `skipped` | number | Пропущено (неизвестный статус или невалидный ключ) |
| `skippedDetails` | array? | Детали пропусков (первые 20, если есть) |
| `elapsed` | number | Время выполнения в миллисекундах |

### Что происходит на бэкенде

1. **Один bulk UPDATE** на таблицу `reviews`: устанавливает `complaint_status`, очищает черновик
2. **Один bulk UPDATE** на таблицу `review_complaints`: синхронизирует статус жалобы
3. Итого: **2 SQL-запроса** на весь батч (а не N * 4 как в старом эндпоинте)

### Сравнение с POST /api/extension/review-statuses

| | `review-statuses` (старый) | `complaint-statuses` (новый) |
|---|---|---|
| **Назначение** | Все статусы (чат + жалоба + отзыв) | Только статус жалобы |
| **Полей на отзыв** | 8 обязательных | **2** |
| **SQL на батч** | N * 4 (цикл) | **2** (bulk) |
| **Лимит** | 100 за запрос | **500** за запрос |
| **Скорость** | ~2-5 сек на 100 | **~50 мс на 500** |
| **Используется** | Первое расширение (парсер отзывов) | Второе расширение (чекер жалоб) |

---

## Маппинг: Google Sheets → API

Для команды расширения — как текущая структура из Google Sheets соотносится с API:

| Google Sheets (текущее) | API (новое) | Эндпоинт |
|-------------------------|-------------|----------|
| `clientId` | `id` | `GET /api/extension/stores` |
| `name` | `name` | `GET /api/extension/stores` |
| `status: "Активен"` | `isActive: true` | `GET /api/extension/stores` |
| `articuls: ["766104062", ...]` | `products[].wb_product_id` | `GET /api/extension/stores/{storeId}/active-products` |
| `articulCount` | `products.length` | Вычислить из ответа `active-products` |
| `folderId` | — | Остаётся в Google Sheets (не связано с API) |
| `screenshotsFolderId` | — | Остаётся в Google Sheets |
| `driveFolderId` | — | Остаётся в Google Sheets |
| `reportSheetId` | — | Остаётся в Google Sheets |

### Пример миграции кода

**Было (Google Sheets):**
```javascript
// dashboard.js
const cabinets = await getCabinets(); // Google Sheets API
const activeCabinets = cabinets.filter(c => c.status === "Активен");
const articuls = activeCabinets[0].articuls; // ["766104062", "123456789"]
```

**Стало (R5 API):**
```javascript
// api-client.js
const API_BASE = 'https://rating5.ru';
const TOKEN = 'wbrm_XXXXXXXXXXXXXXXXXXXXX';

// Шаг 1: Получить магазины
const stores = await fetch(`${API_BASE}/api/extension/stores`, {
  headers: { 'Authorization': `Bearer ${TOKEN}` }
}).then(r => r.json());

const activeStores = stores.filter(s => s.isActive);

// Шаг 2: Получить артикулы для магазина
const { products } = await fetch(
  `${API_BASE}/api/extension/stores/${activeStores[0].id}/active-products`,
  { headers: { 'Authorization': `Bearer ${TOKEN}` } }
).then(r => r.json());

const articuls = products.map(p => p.wb_product_id);
// ["766104062", "123456789"]
```

---

## Коды ошибок

| HTTP код | Код ошибки | Описание |
|----------|------------|----------|
| 401 | `UNAUTHORIZED` | Отсутствует или невалидный токен |
| 403 | `FORBIDDEN` | Нет доступа к этому магазину |
| 404 | `NOT_FOUND` | Магазин не найден |
| 400 | `VALIDATION_ERROR` | Невалидные данные в запросе |
| 400 | `LIMIT_EXCEEDED` | Превышен лимит (100 отзывов за запрос) |
| 429 | `RATE_LIMIT_EXCEEDED` | Превышен rate limit (100 запросов/мин) |
| 500 | `INTERNAL_ERROR` | Внутренняя ошибка сервера |

---

## Лимиты и ограничения

| Параметр | Значение |
|----------|----------|
| Rate limit (stores) | 100 запросов/мин на токен |
| Max результатов в POST complaint-statuses | **500** за запрос |
| Max statusParses в tasks | 500 за запрос |
| CORS | Разрешён для всех Origin (`*`) |
| Протокол | HTTPS обязателен |

---

## Резюме: что НЕ нужно делать

1. **НЕ нужно** создавать новые бэкенд-эндпоинты — всё уже готово
2. **НЕ нужно** хранить артикулы в Google Sheets — берём из API
3. **НЕ нужно** маппить русские статусы жалоб в расширении — бэкенд делает это сам
4. **НЕ нужно** передавать лишние поля (дата, рейтинг, productId отдельно) — всё внутри reviewKey

## Что нужно сделать в расширении

1. Заменить вызовы Google Sheets API на REST-запросы к `rating5.ru`
2. Реализовать Bearer-авторизацию через `wbrm_*` токен
3. Получать список магазинов и артикулов через API
4. На странице жалоб WB: формировать `reviewKey` из артикула + рейтинга + даты
5. Отправлять результаты через `POST /api/extension/complaint-statuses` (быстрый bulk-эндпоинт)
