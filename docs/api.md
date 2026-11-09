# REST API contracts

**Status:** Complete T02 is owner-accepted after successful physical-iPhone testing on 2026-11-07. T03-A backend authentication and private lists are complete and owner-approved after migration 002 import and manual API checks on 2026-11-09. Mobile auth/lists and basket comparison remain deferred. Cursor/offset pagination remains deferred.

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
- All catalog SQL is SELECT-only, with bound search, IDs and limits. Database failures use the existing sanitized 500 response. Unsupported catalog write methods return route-not-found 404; no contributions or verification transitions are exposed. T03-A explicitly preserves public guest access to all T02 routes.

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
- `/api/shopping-lists/*` basket comparison only; authentication and CRUD are implemented below.
- `/api/receipts/*` intake/review/confirmation; `/api/prices/*` reporting, alerts, verification.
- `/api/optimization/*` basket and route options; `/api/preferences/*`, `/api/favorites/*`.
- AI assistant is postponed until core backend functions exist.

## T03-A authentication and shopping-list API

All bodies are JSON objects with exactly the documented keys; unknown keys
(including `userId`) return 400. Names trim surrounding whitespace. Numeric IDs
in bodies must be JSON numbers; route IDs use the T02 decimal unsigned-INT format.
Missing fields and invalid types return 400. Errors retain `{status:"error",message}`.
Malformed/oversized JSON returns 400; unexpected errors are sanitized 500.
Auth/private responses set `Cache-Control: no-store`.

| Method | Route | Body | Success |
|---|---|---|---|
| POST | `/api/auth/register` | `{displayName,email,password}` | 201 `{user}`; separate login required |
| POST | `/api/auth/login` | `{email,password}` | 200 `{token,tokenType:"Bearer",expiresAt,user}` |
| POST | `/api/auth/logout` | None | 204; current session deleted |
| GET | `/api/auth/me` | None | 200 `{user}` |
| GET | `/api/shopping-lists` | None | 200 `{shoppingLists:[...]}`; summaries without items |
| POST | `/api/shopping-lists` | `{name}` | 201 `{shoppingList}` summary |
| GET | `/api/shopping-lists/:id` | None | 200 `{shoppingList}` including `items` |
| PATCH | `/api/shopping-lists/:id` | `{name}` | 200 `{shoppingList}` summary |
| DELETE | `/api/shopping-lists/:id` | None | 204; items cascade |
| POST | `/api/shopping-lists/:id/items` | `{productId,quantity}` | 200 `{item}` for insert or increment |
| PATCH | `/api/shopping-lists/:id/items/:itemId` | `{quantity}` | 200 `{item}`; replaces quantity |
| DELETE | `/api/shopping-lists/:id/items/:itemId` | None | 204; product preserved |

Only register/login are public in these new groups. Every other route requires
`Authorization: Bearer <token>`. Tokens are 64 lowercase hexadecimal characters;
the Bearer scheme is case-insensitive. Missing, malformed, invalid, expired and
logged-out credentials return 401. Login wrong-password and nonexistent-email
responses are identical: `Invalid email or password`. Invalid input syntax is 400.
Duplicate registration email is 409, including case variants/races. No password
hash, token hash or session internals are returned. `expiresAt` is public expiry
metadata, formatted in UTC. Sessions do not slide/refresh; log in after seven days.
Concurrent requests already authenticated before logout may finish; requests
authenticated after completed logout fail. Other login sessions remain valid.

Validation: displayName 1–80 Unicode code points after trim; list name 1–120.
Email trims/lowercases, max 254 ASCII characters, local part max 64; ordinary
dot-domain syntax, no IDNs or quoted local parts. Passwords are exact, untrimmed
8–128 Unicode code points and at most 512 UTF-8 bytes, with no composition rules.
Quantities are JSON integer numbers 1–999 representing complete catalog packages.
Adding a duplicate atomically increases its quantity and rejects totals >999 with
400, leaving existing quantity unchanged. Different package IDs stay separate.
PATCH sets an explicit value. Blank/invalid names/quantities/IDs return 400.

Private ownership comes only from the session. Missing/foreign lists and missing
items (including items belonging to another list) return the same 404:
`Shopping list or item not found`. Missing products on addition return 404
`Product not found`; inactive additions return 400. Existing inactive items are
preserved, returned with `product.isActive=false`, and may be edited or removed.
There are no prices, substitutions, inventory statements or basket totals in list
responses. Empty lists return `items: []`; users without lists get `shoppingLists: []`.
Lists are ordered by ID; items by item ID. No pagination is implemented.

Illustrative registration request and response:

```json
{"displayName":"Demo User","email":"demo@example.com","password":"example password"}
```
```json
{"user":{"id":1,"displayName":"Demo User","email":"demo@example.com"}}
```

Login returns the same user plus a newly generated `token`, `tokenType:"Bearer"`
and `expiresAt`, e.g. `2026-11-16T12:00:00.000000Z`. Use the actual returned token.
POST list body: `{"name":"Weekly"}`. POST item body: `{"productId":1,"quantity":2}`.
PATCH item body: `{"quantity":3}`. Detail response shape:

```json
{
  "shoppingList": {
    "id": 1, "name": "Weekly",
    "createdAt": "2026-11-09T12:00:00.000000Z",
    "updatedAt": "2026-11-09T12:05:00.000000Z",
    "items": [{
      "id": 1, "productId": 1, "quantity": 2,
      "createdAt": "2026-11-09T12:05:00.000000Z",
      "updatedAt": "2026-11-09T12:05:00.000000Z",
      "product": {
        "id": 1, "name": "Coca-Cola", "brand": "Coca-Cola", "variant": "Original",
        "size": 1.5, "unit": "L", "packQuantity": 1,
        "category": "Beverages", "imageUrl": null, "isActive": true
      }
    }]
  }
}
```

POST/PATCH item responses wrap that same item under `item`. Summaries contain all
list fields except `items`. Item operations also update the parent `updatedAt`.
See [T03-A verification](t03a-verification.md) for commands and test evidence.
