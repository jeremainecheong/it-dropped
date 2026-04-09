# DROPRADAR API Documentation

Base URL: `http://localhost:8080` (local) or `https://api.dropradar.dev` (production)

---

## Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 100, "limit": 50, "offset": 0 },
  "error": "Error message (only on failure)"
}
```

---

## Endpoints

### Health Check

#### `GET /health`

Basic health check.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2024-01-09T15:10:36Z"
  }
}
```

---

### System Status

#### `GET /status`

Detailed system status with recent scrape logs.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected",
    "uptime": "1h30m45s",
    "recent_scrapes": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "region": "us",
        "started_at": "2024-01-09T15:00:00Z",
        "completed_at": "2024-01-09T15:00:45Z",
        "status": "success",
        "products_found": 250,
        "new_count": 3,
        "restock_count": 5,
        "price_changes": 1,
        "error_message": "",
        "duration_ms": 45000
      }
    ]
  }
}
```

---

### Products

#### `GET /products`

List products with optional filtering and pagination.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `region` | string | - | Filter by region: `us`, `uk`, `eu`, `jp`, `au` |
| `available` | bool | - | Filter by availability: `true` or `false` |
| `limit` | int | 50 | Results per page (max: 100) |
| `offset` | int | 0 | Pagination offset |

**Example Request:**
```
GET /products?region=us&available=true&limit=20
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "shopify_id": 8123456789012,
      "region": "us",
      "handle": "stussy-basic-tee",
      "title": "STÜSSY BASIC TEE",
      "vendor": "Stüssy",
      "product_type": "T-Shirts",
      "tags": ["new-arrivals", "tees", "basics"],
      "price": 45.00,
      "compare_price": null,
      "currency": "USD",
      "is_available": true,
      "available_sizes": ["S", "M", "L", "XL"],
      "total_variants": 4,
      "image_url": "https://cdn.shopify.com/...",
      "product_url": "https://www.stussy.com/products/stussy-basic-tee",
      "first_seen_at": "2024-01-05T10:00:00Z",
      "last_seen_at": "2024-01-09T15:05:00Z",
      "last_hash": "a1b2c3d4e5f6..."
    }
  ],
  "meta": {
    "total": 1250,
    "limit": 20,
    "offset": 0
  }
}
```

---

### Drops

#### `GET /drops`

List detected product changes (new arrivals, restocks, price changes).

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `region` | string | - | Filter by region |
| `type` | string | - | Filter by change type (see below) |
| `notified` | bool | - | Filter by notification status |
| `limit` | int | 50 | Results per page (max: 100) |
| `offset` | int | 0 | Pagination offset |

**Change Types:**

| Type | Description |
|------|-------------|
| `new` | New product detected |
| `restock` | Previously unavailable product now available |
| `price_drop` | Price decreased |
| `price_increase` | Price increased |
| `size_restock` | New sizes became available |

**Example Request:**
```
GET /drops?region=us&type=new&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "product_id": "550e8400-e29b-41d4-a716-446655440000",
      "shopify_id": 8123456789012,
      "region": "us",
      "change_type": "new",
      "title": "STÜSSY BASIC TEE",
      "price": 45.00,
      "currency": "USD",
      "image_url": "https://cdn.shopify.com/...",
      "product_url": "https://www.stussy.com/products/stussy-basic-tee",
      "old_value": "",
      "new_value": "",
      "available_sizes": ["S", "M", "L", "XL"],
      "detected_at": "2024-01-09T15:05:00Z",
      "notified": true,
      "notified_at": "2024-01-09T15:05:30Z"
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "product_id": "880e8400-e29b-41d4-a716-446655440003",
      "shopify_id": 8123456789099,
      "region": "uk",
      "change_type": "price_drop",
      "title": "STÜSSY HOODIE",
      "price": 89.00,
      "currency": "GBP",
      "image_url": "https://cdn.shopify.com/...",
      "product_url": "https://uk.stussy.com/products/stussy-hoodie",
      "old_value": "120.00",
      "new_value": "89.00",
      "available_sizes": ["M", "L"],
      "detected_at": "2024-01-09T14:30:00Z",
      "notified": true,
      "notified_at": "2024-01-09T14:30:15Z"
    }
  ],
  "meta": {
    "total": 156,
    "limit": 10,
    "offset": 0
  }
}
```

---

## Reference Data

### Regions

| Code | Name | Currency | Store URL |
|------|------|----------|-----------|
| `us` | United States | USD | stussy.com |
| `uk` | United Kingdom | GBP | uk.stussy.com |
| `eu` | Europe | EUR | eu.stussy.com |
| `jp` | Japan | JPY | stussy.jp |
| `au` | Australia | AUD | au.stussy.com |

---

## Error Responses

**Format:**
```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

**HTTP Status Codes:**

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## TypeScript Types

```typescript
interface Product {
  id: string;
  shopify_id: number;
  region: 'us' | 'uk' | 'eu' | 'jp' | 'au';
  handle: string;
  title: string;
  vendor: string;
  product_type: string;
  tags: string[];
  price: number;
  compare_price: number | null;
  currency: string;
  is_available: boolean;
  available_sizes: string[];
  total_variants: number;
  image_url: string;
  product_url: string;
  first_seen_at: string;
  last_seen_at: string;
  last_hash: string;
}

interface Drop {
  id: string;
  product_id: string | null;
  shopify_id: number;
  region: string;
  change_type: 'new' | 'restock' | 'price_drop' | 'price_increase' | 'size_restock';
  title: string;
  price: number;
  currency: string;
  image_url: string;
  product_url: string;
  old_value: string;
  new_value: string;
  available_sizes: string[];
  detected_at: string;
  notified: boolean;
  notified_at: string | null;
}

interface ScrapeLog {
  id: string;
  region: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'failed';
  products_found: number;
  new_count: number;
  restock_count: number;
  price_changes: number;
  error_message: string;
  duration_ms: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    limit: number;
    offset: number;
  };
}
```
