# REST API contracts — initial draft

**Status:** T01 implements only the two health endpoints below. All business endpoints remain planned. JSON over HTTP from mobile to Express; authentication and pagination remain deferred.

T01 database health returns HTTP 200 with `{"status":"ok","database":"connected"}` or HTTP 503 with `{"status":"error","database":"unavailable"}`. Process health works independently of MySQL. Unknown routes return HTTP 404 with `{"status":"error","message":"Route not found"}`. Unexpected errors return a sanitized HTTP 500; malformed JSON returns HTTP 400. No raw errors are returned. Local browser CORS uses `CORS_ORIGINS`; native requests without Origin are supported.

## Initial endpoints
| Method | Route | Goal | Stage |
|---|---|---|---|
| GET | `/api/health` | Backend process check | Setup Task 1 |
| GET | `/api/health/db` | Sanitized MySQL connectivity check | Setup Task 1 (local/dev) |
| GET | `/api/products?search=coca` | Product/name/alias search | First vertical slice |
| GET | `/api/products/:id` | Canonical product detail | First vertical slice |
| GET | `/api/products/:id/prices` | Current eligible branch prices | First vertical slice |
| GET | `/api/supermarkets` | Chains and branch overview | First vertical slice |

## Response examples (illustrative, not actual prices)
`GET /api/health`
```json
{"status":"ok","message":"Backend is running"}
```
`GET /api/products?search=coca`
```json
{"products":[{"id":1,"name":"Coca-Cola","brand":"Coca-Cola","size":1.5,"unit":"L","category":"Beverages"}]}
```
`GET /api/products/1/prices` (assuming only USD display or successful documented conversion)
```json
{
  "productId": 1,
  "displayCurrency": "USD",
  "prices": [
    {"branchId":2,"supermarket":"Example Market A","branch":"Branch 1","price":1.65,"currency":"USD","lastUpdated":"2026-11-04","status":"verified","availability":"check_with_store"},
    {"branchId":1,"supermarket":"Example Market B","branch":"Branch 2","price":1.80,"currency":"USD","lastUpdated":"2026-11-03","status":"verified","availability":"check_with_store"}
  ]
}
```

## API rules
- Never accept trusted verification or authoritative prices merely because the client submits them.
- Server enforces permissions and derives comparisons from eligible validated prices. Flagged/pending/rejected data does not count as verified.
- Missing or stale data must be called out; no manufactured availability or missing price.
- Search uses normalized catalog fields and approved aliases, not broad fuzzy equivalence by default.
- `GET /api/health/db` returns safe success/failure metadata without credentials or raw SQL errors; restrict exposure if deploying publicly.
- Use consistent validation, meaningful HTTP status codes, and helpful error messages (without sensitive internals).

## Deferred route groups (design placeholders, not finalized contracts)
- `/api/auth/*` registration/login; `/api/shopping-lists/*` CRUD + compare.
- `/api/receipts/*` intake/review/confirmation; `/api/prices/*` reporting, alerts, verification.
- `/api/optimization/*` basket and route options; `/api/preferences/*`, `/api/favorites/*`.
- AI assistant is postponed until core backend functions exist.
