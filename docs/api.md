# REST API contracts

**Status:** Complete T02 is owner-accepted after successful physical-iPhone testing on 2026-11-07. The health/catalog APIs and their mobile consumers are implemented and verified. Authentication and write workflows remain unimplemented. Cursor/offset pagination remains deferred.

T01 database health returns HTTP 200 with `{"status":"ok","database":"connected"}` or HTTP 503 with `{"status":"error","database":"unavailable"}`. Process health works independently of MySQL. Unknown routes return HTTP 404 with `{"status":"error","message":"Route not found"}`. Unexpected errors return a sanitized HTTP 500; malformed JSON returns HTTP 400. No raw errors are returned. Local browser CORS uses `CORS_ORIGINS`; native requests without Origin are supported.

## Initial endpoints
| Method | Route | Goal | Stage |
|---|---|---|---|
| GET | `/api/health` | Backend process check | Setup Task 1 |
| GET | `/api/health/db` | Sanitized MySQL connectivity check | Setup Task 1 (local/dev) |
| GET | `/api/products?search=coca&limit=50` | Active product/name/alias search | T02-B implemented |
| GET | `/api/products/:id` | Active canonical product detail | T02-B implemented |
| GET | `/api/products/:id/prices` | Eligible USD demonstration observations | T02-B implemented |
| GET | `/api/supermarkets` | Chains with nested branches | T02-B implemented |

## T02-B behavior

- Product list envelope: `{ "products": [...] }`; details: `{ "product": {...} }`. Product fields are `id`, `name`, `brand`, `variant`, numeric `size`, `unit`, `packQuantity`, `category`, nullable `imageUrl`. An unspecified variant is an empty string. Internal activity/creation fields are omitted. Sizes, variants and multipacks remain separate identities. Inactive products are hidden on list/detail/price routes.
- `search` is optional, single-valued and at most 255 characters. SQL applies the database alias normalization to input and searchable fields: lowercase, remove ASCII spaces and hyphens. Literal normalized substrings match name, brand, category and registered aliases under the case/accent-insensitive collation. `%`, `_` and backslashes have no wildcard meaning. This is search, never a declaration of product equivalence; no fuzzy matching, AI or unit conversion. Empty or normalization-empty input browses the catalog. Alias matching uses `EXISTS` to prevent duplicates.
- `limit` defaults to 50; accepted integers are 1–100. Invalid/repeated search or limit values return 400. Order: name, brand, variant, size, unit, pack quantity, ID. Results are capped without total count or pagination cursor. No matches return `products: []`.
- Product IDs must be decimal integers 1–4294967295, without leading zeros, signs, fractions or exponent notation. Invalid IDs return 400 with `{"status":"error","message":"Invalid product ID"}`. Missing/inactive products return 404 with `{"status":"error","message":"Product not found"}` on both detail/price routes.
- Price eligibility is restricted to `status='verified'`, `currency='USD'`, `source_type='seed'`. Filter first, then select the latest per branch for the requested product by `observed_at DESC, id DESC`. An earlier cheaper price is not substituted. Order selected rows by numeric price ascending, then branch ID. Pending, flagged, rejected, LBP, manual and online observations are excluded; history is unchanged.
- Comparison envelope includes `productId`, `displayCurrency: "USD"`, `demonstrationData: true`, a `dataLabel` beginning `DEMONSTRATION DATA`, `freshness: "not_evaluated"`, `availability: "check_with_store"`, and `prices`. Existing products without eligible observations return HTTP 200 with `prices: []` and all the same metadata. Missing branch amounts are not filled in.
- Each price includes `supermarketId`, `supermarket`, `branchId`, `branch`, decimal-string `price` (two fractional digits), `currency`, UTC `observedAt` with six fractional digits, `status`, `demonstrationData: true`, `availability: "check_with_store"`. SQL formats UTC-convention `DATETIME` observations without interpreting them in the Node host timezone. Source notes/internal price IDs are omitted. Simulated verification establishes neither actual verification nor current pricing. No freshness cutoff, currency conversion or availability inference is implemented.
- `/api/supermarkets` returns `{ "supermarkets": [{ "id", "name", "branches": [...] }] }`. Branches contain `id`, `name`, `address`, nullable numeric `latitude` and `longitude`. Unknown coordinates stay null. Chains without branches have `branches: []`; an empty catalog has `supermarkets: []`. Order by chain name/ID, then branch name/ID. Imported names/addresses explicitly identify fictional demonstration scenarios. No separate branch route.
- All business SQL is SELECT-only, with bound search, IDs and limits. Database failures use the existing sanitized 500 response. Unsupported write methods return the existing route-not-found 404; no contributions or verification transitions are exposed. These demo routes do not settle the future guest/authentication policy.

## Response examples (illustrative, not actual prices)
`GET /api/health`
```json
{"status":"ok","message":"Backend is running"}
```
`GET /api/products?search=coca`
```json
{"products":[{"id":1,"name":"Coca-Cola","brand":"Coca-Cola","variant":"Original","size":1.5,"unit":"L","packQuantity":1,"category":"Beverages","imageUrl":null},{"id":2,"name":"Coca-Cola","brand":"Coca-Cola","variant":"Original","size":330,"unit":"ml","packQuantity":1,"category":"Beverages","imageUrl":null}]}
```
`GET /api/products/1/prices` (imported USD-only demonstration seed)
```json
{
  "productId": 1,
  "displayCurrency": "USD",
  "demonstrationData": true,
  "dataLabel": "DEMONSTRATION DATA: invented USD prices and simulated verification; not current or accurate store prices.",
  "freshness": "not_evaluated",
  "availability": "check_with_store",
  "prices": [
    {"supermarketId":2,"supermarket":"Carrefour - DEMONSTRATION DATA","branchId":3,"branch":"Baabda - DEMO","price":"1.60","currency":"USD","observedAt":"2026-01-15T12:00:00.000000Z","status":"verified","demonstrationData":true,"availability":"check_with_store"},
    {"supermarketId":1,"supermarket":"Spinneys - DEMONSTRATION DATA","branchId":1,"branch":"Beirut - DEMO","price":"1.70","currency":"USD","observedAt":"2026-01-15T12:00:00.000000Z","status":"verified","demonstrationData":true,"availability":"check_with_store"},
    {"supermarketId":3,"supermarket":"Le Charcutier - DEMONSTRATION DATA","branchId":4,"branch":"Jounieh - DEMO","price":"1.75","currency":"USD","observedAt":"2026-01-15T12:00:00.000000Z","status":"verified","demonstrationData":true,"availability":"check_with_store"},
    {"supermarketId":1,"supermarket":"Spinneys - DEMONSTRATION DATA","branchId":2,"branch":"Metn - DEMO","price":"1.80","currency":"USD","observedAt":"2026-01-15T12:00:00.000000Z","status":"verified","demonstrationData":true,"availability":"check_with_store"}
  ]
}
```

## API rules
- T02-F: catalog SQL values are server-bound with mysql2 `execute`, including search/IDs/limit; wire fields, eligibility and ordering are unchanged. The mobile reader now treats a blank optional image string as missing instead of rejecting the product. See [the audit](t02f-audit.md) for reproduced defects and current checks.
- T02-E correction: malformed URL-encoded route parameters return sanitized HTTP 400 with `{"status":"error","message":"Invalid URL parameter"}` instead of 500. Eligibility, verification, freshness and currency policies are unchanged. A regression test covers detail and price routes without querying MySQL.
- Mobile runtime readers validate IDs, package fields, decimal strings, UTC timestamps, statuses, branch identities and demonstration metadata. Nullable images/locations remain nullable. Inconsistent required fields, duplicate IDs/branches or an unsorted comparison reject the response rather than silently repairing ranking or showing partial winners. Supported enum changes require an explicit contract update; the client does not introduce new eligibility rules.
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
