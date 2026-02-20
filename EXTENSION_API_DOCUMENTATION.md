# Chrome Extension API Documentation

**Version:** 2.1.0
**Last Updated:** 2026-02-20
**Production URL:** http://158.160.217.236

---

## Overview

This API provides endpoints for the Chrome Extension "R5 подача жалоб" to fetch and submit generated complaints to Wildberries.

## Authentication

All API requests (except `/api/health`) require Bearer token authentication:

```http
Authorization: Bearer your_api_token_here
```

### Getting Your API Token

1. Log into the WB Reputation Manager dashboard
2. Navigate to Settings → API Tokens
3. Generate a new token for your store
4. Copy the token securely (shown only once)

### Token Security

- Keep your token secret - it provides full access to your store's data
- Don't commit tokens to version control
- Rotate tokens periodically
- Each token is scoped to a single store

---

## Rate Limiting

- **Limit:** 100 requests per minute per API token
- **Headers:** Every response includes rate limit information:
  ```http
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 95
  X-RateLimit-Reset: 2026-01-28T15:30:00.000Z
  ```
- **429 Response:** When limit exceeded, wait until `resetAt` timestamp

---

## Core Endpoints

### 1. GET /api/stores/:storeId/complaints

Fetch list of pending complaints ready for submission.

**URL:** `GET /api/stores/{storeId}/complaints`

**Query Parameters:**
- `skip` (optional) - Number of records to skip for pagination (default: 0)
- `take` (optional) - Number of records to return (default: 100, max: 200)

**Request Example:**
```http
GET /api/stores/cm5abc123/complaints?skip=0&take=50
Authorization: Bearer your_api_token_here
```

**Response Example:**
```json
[
  {
    "id": "rev_xyz789",
    "productId": "123456789",
    "rating": 1,
    "reviewDate": "2026-01-28T10:15:30.000Z",
    "reviewText": "Плохое качество товара",
    "authorName": "Иван И.",
    "createdAt": "2026-01-28T11:00:00.000Z",
    "complaintText": "```json\n{\"reasonId\":\"1\",\"reasonName\":\"Оскорбление\",\"complaintText\":\"Отзыв содержит оскорбительные выражения...\"}\n```",
    "status": "draft",
    "attempts": 0,
    "lastAttemptAt": null
  }
]
```

**Response Codes:**
- `200` - Success
- `400` - Invalid parameters (skip/take out of range)
- `401` - Invalid or missing API token
- `403` - Token doesn't have access to this store
- `404` - Store not found
- `429` - Rate limit exceeded
- `500` - Internal server error

---

### 2. POST /api/stores/:storeId/reviews/:reviewId/complaint/sent

Mark complaint as successfully sent to Wildberries.

**URL:** `POST /api/stores/{storeId}/reviews/{reviewId}/complaint/sent`

**Idempotency:** Safe to call multiple times - if already marked as sent, returns 200 with existing data.

**Request Example:**
```http
POST /api/stores/cm5abc123/reviews/rev_xyz789/complaint/sent
Authorization: Bearer your_api_token_here
```

**Response Example:**
```json
{
  "success": true,
  "message": "Complaint marked as sent",
  "data": {
    "reviewId": "rev_xyz789",
    "status": "sent",
    "sentAt": "2026-01-28T12:00:00.000Z"
  }
}
```

**Response Codes:**
- `200` - Success (complaint marked or already marked)
- `400` - Review doesn't belong to specified store
- `401` - Invalid or missing API token
- `403` - Token doesn't have access to this store
- `404` - Store, review, or complaint not found
- `429` - Rate limit exceeded
- `500` - Internal server error

---

### 3. GET /api/health

Check API health status (no authentication required).

**URL:** `GET /api/health`

**Response Example:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-28T12:00:00.000Z",
  "uptime_seconds": 86400,
  "uptime_human": "1d 0h 0m 0s",
  "version": "2.0.0",
  "environment": "production",
  "services": {
    "database": {
      "status": "healthy",
      "message": "Connected",
      "details": {
        "latency_ms": 15
      }
    },
    "cronJobs": {
      "status": "healthy",
      "message": "Running"
    },
    "rateLimiter": {
      "status": "healthy",
      "message": "Operational"
    }
  }
}
```

**Response Codes:**
- `200` - Healthy or degraded
- `503` - Unhealthy (critical services down)

---

## Important: Date Format

### reviewDate Field

**Format:** ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)

**Example:** `"2026-01-28T10:15:30.000Z"`

**Timezone:** Always UTC (Z suffix)

**Extension Responsibility:**
The Extension team should handle conversion to Russian format (DD.MM.YYYY) for display purposes if needed. The API will always send dates in ISO 8601 format.

**JavaScript Conversion Example:**
```javascript
// API returns ISO 8601
const reviewDate = "2026-01-28T10:15:30.000Z";

// Convert to DD.MM.YYYY for WB submission
function formatToRussianDate(isoString) {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

const formattedDate = formatToRussianDate(reviewDate);
// Result: "28.01.2026"
```

---

## complaintText Format

The `complaintText` field contains complaint data wrapped in markdown code block:

**Format:**
```
```json
{"reasonId":"1","reasonName":"Оскорбление","complaintText":"..."}
```
```

**Parsing Example:**
```javascript
// Extract JSON from markdown code block
function parseComplaintText(complaintText) {
  const match = complaintText.match(/```json\n(.*?)\n```/s);
  if (match) {
    return JSON.parse(match[1]);
  }
  throw new Error('Invalid complaintText format');
}

const complaint = parseComplaintText(response.complaintText);
// Result: { reasonId: "1", reasonName: "Оскорбление", complaintText: "..." }
```

---

## Error Handling

All errors follow this format:

```json
{
  "error": "Error Type",
  "message": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

**Common Error Codes:**
- `INVALID_TOKEN` - Missing or invalid API token
- `STORE_ACCESS_DENIED` - Token doesn't have access to requested store
- `STORE_NOT_FOUND` - Store ID doesn't exist
- `REVIEW_NOT_FOUND` - Review ID doesn't exist
- `COMPLAINT_NOT_FOUND` - No complaint exists for this review
- `STORE_MISMATCH` - Review belongs to different store
- `INVALID_PARAMS` - Invalid query parameters
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `DB_ERROR` - Database error (temporary)

---

## Best Practices

### 1. Pagination
Always use pagination for large datasets:
```javascript
async function fetchAllComplaints(storeId, token) {
  const allComplaints = [];
  let skip = 0;
  const take = 100;

  while (true) {
    const response = await fetch(
      `http://158.160.217.236/api/stores/${storeId}/complaints?skip=${skip}&take=${take}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    const complaints = await response.json();
    if (complaints.length === 0) break;

    allComplaints.push(...complaints);
    skip += take;
  }

  return allComplaints;
}
```

### 2. Rate Limit Handling
Respect rate limits and implement backoff:
```javascript
async function apiRequest(url, options) {
  const response = await fetch(url, options);

  // Check rate limit headers
  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining'));
  const resetAt = response.headers.get('X-RateLimit-Reset');

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After'));
    console.warn(`Rate limited. Retry after ${retryAfter} seconds`);
    await sleep(retryAfter * 1000);
    return apiRequest(url, options); // Retry
  }

  return response;
}
```

### 3. Error Recovery
Implement proper error handling:
```javascript
try {
  const response = await apiRequest(url, options);

  if (!response.ok) {
    const error = await response.json();
    console.error(`API Error [${error.code}]:`, error.message);

    // Handle specific errors
    if (error.code === 'INVALID_TOKEN') {
      // Prompt user to re-authenticate
    } else if (error.code === 'STORE_NOT_FOUND') {
      // Invalid store configuration
    }

    return null;
  }

  return await response.json();
} catch (error) {
  console.error('Network error:', error);
  return null;
}
```

### 4. Idempotency
The `/complaint/sent` endpoint is idempotent - safe to retry:
```javascript
async function markAsSent(storeId, reviewId, token) {
  const maxRetries = 3;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(
        `http://158.160.217.236/api/stores/${storeId}/reviews/${reviewId}/complaint/sent`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        return await response.json();
      }

      // Don't retry 4xx errors (except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`Client error: ${response.status}`);
      }
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

---

## CORS Configuration

The API supports CORS for Chrome Extensions:

**Allowed Origins:**
- `chrome-extension://*` (all Chrome Extension origins)

**Allowed Methods:**
- GET, POST, PUT, DELETE, OPTIONS

**Allowed Headers:**
- Content-Type
- Authorization

**Preflight Caching:**
- 24 hours (86400 seconds)

---

### 4. POST /api/extension/complaint-details

Receive full approved complaint data from Chrome Extension. Called after each successful screenshot of an approved complaint. Source of truth for billing, client reporting, AI training.

**URL:** `POST /api/extension/complaint-details`

**Request Example:**
```http
POST /api/extension/complaint-details
Authorization: Bearer your_api_token_here
Content-Type: application/json

{
  "storeId": "store_123",
  "complaint": {
    "checkDate": "20.02.2026",
    "cabinetName": "МойМагазин",
    "articul": "149325538",
    "reviewId": "",
    "feedbackRating": 1,
    "feedbackDate": "18 февр. 2026 г. в 21:45",
    "complaintSubmitDate": "15.02.2026",
    "status": "Одобрена",
    "hasScreenshot": true,
    "fileName": "149325538_18.02.26_21-45.png",
    "driveLink": "https://drive.google.com/file/d/abc123/view",
    "complaintCategory": "Отзыв не относится к товару",
    "complaintText": "Жалоба от: 20.02.2026\n\nОтзыв покупателя не содержит оценки качества..."
  }
}
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `checkDate` | string | Yes | Дата проверки, DD.MM.YYYY |
| `cabinetName` | string | Yes | Название магазина WB |
| `articul` | string | Yes | Артикул WB (nmId) |
| `reviewId` | string | No | ID отзыва (зарезервировано, пока пустая строка) |
| `feedbackRating` | number/string | Yes | Рейтинг отзыва 1-5 |
| `feedbackDate` | string | Yes | Дата отзыва в оригинальном формате WB |
| `complaintSubmitDate` | string | No | Дата подачи жалобы DD.MM.YYYY или DD.MM |
| `status` | string | No | Всегда "Одобрена" |
| `hasScreenshot` | boolean | No | Всегда true |
| `fileName` | string | Yes | Имя файла скриншота |
| `driveLink` | string | No | Ссылка на скриншот в Google Drive |
| `complaintCategory` | string | Yes | Категория жалобы WB |
| `complaintText` | string | Yes | Полный текст жалобы |

**Deduplication:** `storeId` + `articul` + `feedbackDate` + `fileName`

**filed_by detection:** If `complaintText` starts with "Жалоба от:" → `r5`, otherwise → `seller`.

**Response — Created:**
```json
{
  "success": true,
  "data": {
    "created": true
  }
}
```

**Response — Duplicate:**
```json
{
  "success": true,
  "data": {
    "created": false,
    "reason": "duplicate"
  }
}
```

**Response Codes:**
- `200` - Success (created or duplicate)
- `400` - Invalid request body or missing required fields
- `401` - Invalid or missing API token
- `403` - Token doesn't have access to this store
- `404` - Store not found
- `500` - Internal server error

---

## Support

**Issues:** Report bugs or request features via GitHub Issues
**Production Dashboard:** http://158.160.217.236
**Technical Contact:** See project README

---

## Changelog

### Version 2.1.0 (2026-02-20)
- POST /api/extension/complaint-details — approved complaint data from extension (source of truth for billing/reporting)

### Version 2.0.0 (2026-01-28)
- GET /api/stores/:storeId/complaints endpoint
- POST /api/stores/:storeId/reviews/:reviewId/complaint/sent endpoint
- Bearer token authentication
- Rate limiting (100 req/min per token)
- CORS support for Chrome Extensions
- Enhanced health check endpoint
- ISO 8601 date format for reviewDate field
- Markdown-wrapped JSON for complaintText field
