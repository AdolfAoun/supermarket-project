# REST API contracts

## T05-C fuel-aware comparison

`POST /api/shopping-lists/:id/fuel-optimization` is authenticated, owned, no-store
and read-only. Body contains only `journey` (existing numeric endpoints, ordered
waypoints and 0–30 minute allowance), `fuel` (`consumption` decimal string in
L/100 km >0 through 100; `price` decimal string per liter >=0; `currency` USD/LBP),
and optional numeric `maxStores` 1/2/3 (default 2). Both fuel decimals allow at most
two fractional digits; price supports the existing DECIMAL(12,2) range. No query
parameters, client grocery prices/totals or distance-policy overrides.

Different endpoints charge max(0, full shopping meters minus the original baseline
meters); identical endpoints charge full shopping meters. Existing stops keep
their order. Response plans contain complete T04 grocery allocations, fuel and
combined display amounts, exact USD numerator/denominator pairs, full/charged
distance, liters, ordered branch IDs and complete navigation points. It includes
baseline/request identity, active list/inactive exclusions, location/route exclusion
diagnostics, evaluation counts/completeness and `scope:"best_evaluated_plans"`.
Only three nearest price-bearing corridor branches and at most 24 shopping routes
are evaluated; this is not a global optimum. Missing routes/prices are not zero.
`status:"unavailable"` with empty plans is a valid HTTP 200 outcome.

400 invalid/empty/all-inactive; 401 auth; 404 missing/foreign list; 422 unusable
baseline route; 503 busy/provider baseline failure; sanitized 500 unexpected error.
After a usable baseline, preserved partial work uses HTTP 200 and incomplete
metadata. Grocery-only GET endpoints retain their existing contracts. Detailed
response fields, formula and example are in [T05-C verification](t05c-verification.md).

**Status:** T02–T04 are complete and owner-accepted; T04 physical-iPhone acceptance was confirmed 2026-11-17. T04 adds the optimization endpoint below. Existing T02/T03 wire contracts are preserved. Cursor/offset pagination remains deferred.

## T05-B route-aware supermarket discovery

T05-B2 preserves this contract. Its approved offline OSM imports appear through
the same catalog repository; no import HTTP endpoint was added. The conservative
envelope before exact corridor filtering does not raise routing-request budgets.
Import approval, provenance and limitations are documented in t05b2-data-import.md.

`POST /api/journeys/supermarkets` requires the existing bearer session and sets
no-store. Body keys are only `origin`, `destination`, optional ordered `waypoints`
and optional `maxDetourMinutes` (default 30, whole 0–30). Points have exactly
numeric latitude/longitude in geographic ranges. No query parameters, user IDs,
client prices, routing URLs or policy overrides. At most eight original stops;
the geographic sum of input legs must be at most 500 km for this demonstration.

The client requests all estimates up to 30 minutes once, then filters locally at
the selected default-eight-minute threshold. Discovery is independent of lists;
an explicitly selected saved list uses the owned T04 maxStores=1 request for
optional basket prices. Exploration alone sends neither a list nor a T04 request.
The discovery endpoint never accepts or ranks client-provided grocery totals.

| Response field | Meaning |
|---|---|
| `journey` | Validated request, echoed for client identity checking |
| `baseline` | `distanceMeters`, `durationSeconds` from OSRM road routing |
| `options` | Evaluated branches within the requested unrounded detour threshold, ordered by extra time, distance change and branch ID |
| Option identity | Branch/chain IDs/names, address, numeric latitude/longitude |
| Option metrics | Complete `journeyDistanceMeters`, `journeyDurationSeconds`, signed `additionalDistanceMeters`, nonnegative `additionalDurationSeconds`, `rawDurationDeltaSeconds`, zero-based `insertionIndex` amongst original stops |
| `exclusions` | Branch ID and reason: missing/invalid coordinates, outside corridor, duplicate location, evaluation limit, no route, excessive snapping, provider failure, inconsistent route or above threshold. Distinct insertion failures accumulate; a branch may have multiple reasons and may also have a usable option |
| `evaluationComplete` | False if limits/provider errors/inconsistent estimates prevented full corridor-candidate evaluation; never means national coverage |
| `evaluatedAt`, `estimated`, `liveTraffic` | UTC timestamp, always true and false respectively |
| `attribution` | Provider/source label, safe credit URL and OSM correction link |

The internal corridor is 3000 meters from full baseline GeoJSON geometry. All
original stop insertion positions are evaluated for each selected candidate.
Work caps are 20 branches and 24 insertion evaluations, with explicit exclusions.
Missing road routes never become straight-line estimates. Tiny negative time
deltas down to -1 second become zero with raw delta retained; more-negative time
is excluded. Negative distance changes can be legitimate faster-route tradeoffs
and remain signed. Equal endpoints have a zero baseline and full shopping-trip
driving costs, not independent round-trip sums or a fabricated commute.

400: invalid body/query/coordinates/threshold. 401: invalid session. 422: unusable
road route/snapping or demo distance limit. 503: baseline provider failure/timeout or busy.
After a usable baseline exists, candidate failures or the overall deadline return
HTTP 200 with preserved successful options and incomplete evaluation metadata.
Unavailable routes/snapping are definitive unusable insertion outcomes; provider
failures, inconsistent estimates, skipped work and deadlines prevent completeness.
500 remains sanitized for unexpected SQL/corruption failures. Maximum two active
discoveries; 60-second total request deadline. Each external call has a seven-
second deadline, 1 MB response cap and bounded geometry. No database transaction
is held during routing. Transient shared cache: 128 routes, five minutes, hashed
keys, no persistent journey storage. See [T05-B report](t05b-verification.md).

## Google Maps import — retained T05-A foundation

`POST /api/locations/import-google-maps` requires an existing bearer session,
accepts only `{ "url": "https://…" }` and no query parameters, and sets no-store.
It does not access lists, branches or prices, nor change their ownership checks.
Input URL length is at most 8192 characters. Invalid input/unsafe host uses 400;
unsupported formats, unsafe DNS/redirect resolution, service errors, busy or
timeout outcomes use 422 and the existing `{status:'error',message}` envelope.
Unexpected failures are sanitized 500; invalid/expired sessions use 401.

Successful response fields:

| Field | Meaning |
|---|---|
| `kind` | `journey` or `location` |
| `status` | `complete` only when both journey endpoints and all supplied stops have usable coordinates; otherwise `partial` |
| `origin`, `destination` | Nullable imported location; both null for a single-place import |
| `location` | Single imported place; null for journeys |
| `waypoints` | Ordered intermediate locations, maximum nine, never silently dropped when unresolved |
| `travelMode` | `driving`, `walking`, `bicycling`, `transit`, `two-wheeler` or `unknown`; never defaulted to driving |

A location has nullable `name`, `placeId`, `latitude`, `longitude`, and
`coordinateSource`. Coordinates are both null or finite/in-range. Sources are
`explicit`, `google_url_data`, `google_geocode` or null. Names/IDs without
coordinates remain unresolved. Legacy geocode values have six-decimal precision;
the more precise explicit saddr is preserved when consistent. Unknown tagged
encodings are not decoded. Viewport @ coordinates never become endpoints.

No distances, prices, routes or persistent IDs are returned. The client holds
device-origin state locally. T05-B retires the uncommitted requiresConfirmation
field and separate confirmation workflow. See [format/security details](t05a-verification.md).

## T04 shopping basket optimization

`GET /api/shopping-lists/:id/optimization?maxStores=2` requires the existing bearer
session and list ownership. `maxStores` is optional (default `2`), and accepts only
one string `1`, `2` or `3`. Repeated/array/unknown query keys, request bodies and
noncanonical IDs return 400. User IDs, prices, totals and policies are server-derived.
Missing/foreign/deleted lists share 404 `Shopping list or item not found`; invalid,
expired or revoked sessions use 401. Empty/all-inactive lists return 400. Unexpected
SQL or corrupted persisted inputs use sanitized 500. All responses set no-store.

Above the documented exact-search budget, HTTP 422 returns
`{"status":"error","message":"Exact optimization exceeds the computation limit. Try a lower maximum branch count"}`.
No candidate is silently dropped. See [limits and complexity](t04-verification.md#complexity-and-limits).

| Field | Contract |
|---|---|
| `comparison` | T03-B comparison shape for **active items only**, complete single branches with exact dense ranks and all `cheapestBranchIds`, plus separate incomplete branch missing IDs. Selected cost lines additionally contain `freshness` and `availability` below. Legacy `freshness: not_evaluated` at comparison level is preserved; T04 uses the per-line derived field. |
| `excludedItems` | Inactive saved items in ascending product ID order, with the existing complete list-item/product fields. Never removed or charged. Unlike T04, the unchanged `/compare` endpoint still blocks inactive baskets. |
| `evaluatedAt` | Six-digit UTC timestamp from one server clock per calculation |
| `maximumStores` | Requested maximum 1–3; default 2; not required number of visits |
| `freshnessDays` | Configured caution threshold, default 30 (`PRICE_FRESHNESS_DAYS`) |
| `fuelCostsIncluded`, `availabilityGuaranteed` | Both `false` |
| `multiStore.status` | `complete` or `no_solution` |
| `multiStore.solution` | Null only for no solution; otherwise `branchIds`, `totalUsd`, `totalUsdUnits`, `allocations` |
| Allocation | Branch/chain ID/name fields plus `items`, `subtotalUsd`, `subtotalUsdUnits`; no empty allocations, branch IDs ascending |
| Cost line | Existing original amount/currency, product ID, quantity, exact/display unit and line costs, observation time, `status:'verified'`, `sourceType:'seed'`, `demonstrationData:true`; adds `availability:'unknown'` and `freshness:'recent'|'older'|'future'` |
| `multiStore.savings` | `{amountUsd,amountUsdUnits,percentage}` only when solution and complete single baseline exist; otherwise null. Percentage is a two-decimal string. Exact zero uses `amountUsdUnits:'0'`. No invented baseline or negative savings. |
| `missingProductIds` | Active requested products having no usable price in any branch, sorted. Can be empty with no solution when coverage requires more branches than allowed. |

Both modes select the latest positive verified seed USD/LBP observation by
timestamp then observation ID, across currencies. They use the same snapshot and
centralized exact arithmetic. USD/LBP conversion is fixed at 90,000; monetary
`*Units` strings use denominator 9,000,000. `*Usd` and `percentage` strings are
display-rounded half up; clients must not reconstruct totals from rounded parts.
Savings represent potential merchandise savings only. Unknown stock and older
prices never imply confirmed availability or current shelf pricing.

Every active product appears once with its entire quantity in a complete split.
Only branches receiving items count as used. Equal exact costs prefer fewer used
branches, then lexicographic branch IDs. For equal per-product prices within a
set, lower branch ID wins. Incomplete branches never rank against complete ones.
No complete single baseline is required to search combined coverage.

## T03-C mobile contract handling

The shared transport adds POST/PATCH/DELETE, JSON bodies, per-request bearer headers
and empty 204 support without adding authentication to public catalog requests.
Private readers validate list/item/product IDs, quantities, UTC timestamps, activity,
money strings and the complete basket structure. They validate server exact-unit
ordering, dense ranks and cheapest IDs using BigInt only for contract checks, never
to compute totals or conversions. Mutation responses must match requested identities.

Mobile POST duplicate additions use the returned combined quantity; PATCH replaces
explicitly. Writes are not automatically retried. Server errors use safe local
messages instead of trusting raw response text. Protected HTTP 401 invalidates only
the session generation that issued that request. A late former-session response
is cancelled rather than overwriting newer private state. Network/500 failures do
not erase the saved session. See [verification](t03c-verification.md).

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
- `search` is optional, single-valued and at most 255 characters before normalization. The repository collapses pasted whitespace (including tabs, newlines and nonbreaking spaces) to spaces and trims it. SQL then applies database alias normalization: lowercase, remove ASCII spaces and hyphens. Literal normalized substrings match name, brand, category and registered aliases. Accent variants are not folded by the current `LOCATE` search; the database's identity collation alone does not make this substring search accent-insensitive. `%`, `_` and backslashes have no wildcard meaning. This is search, never a declaration of product equivalence; no fuzzy matching, AI or unit conversion. Empty or normalization-empty input browses the catalog. Alias matching uses `EXISTS` to prevent duplicates.
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
- `/api/receipts/*` intake/review/confirmation; `/api/prices/*` reporting, alerts, verification.
- `/api/optimization/*` future route options; T04 merchandise optimization is under shopping lists below. `/api/preferences/*`, `/api/favorites/*` remain deferred.
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
There are no prices, substitutions, inventory statements or basket totals in CRUD
responses; the separate T03-B comparison route is documented below. Empty lists return `items: []`; users without lists get `shoppingLists: []`.
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

## T03-B single-branch basket comparison

`GET /api/shopping-lists/:id/compare` requires the existing bearer session and list
ownership. It accepts no query parameters or JSON body (400 if supplied); prices,
totals and users are derived by the server. Missing/foreign lists share T03-A's
404 `Shopping list or item not found`. Invalid IDs return 400; missing/invalid/
expired/revoked authentication returns 401. Empty lists return 400 `Shopping list
is empty`. Unexpected SQL/monetary failures use sanitized 500. Responses are
`Cache-Control: no-store`.

Price eligibility retains T02's `status='verified' AND source_type='seed'`, with
**both USD and LBP supported for T03-B**. T02's product-price API stays USD-only.
Filter eligible observations before selecting one per `(product_id,branch_id)`
by `observed_at DESC, id DESC`, across currencies together. Never select the
cheapest historical value or combine physical branches. No freshness cutoff,
source-policy expansion or inventory inference is introduced.

| Response field | Meaning |
|---|---|
| `shoppingList` | `id`, `name`, `updatedAt`, and all required `items` with the T03-A item/product fields, sorted by product ID |
| `outcome` | `complete`, `no_complete_branches`, or `inactive_products` |
| `eligibleBranches` | Complete branches only; sorted by exact total, then branch ID. Each contains branch/chain IDs and names, dense `rank`, `totalUsd`, `totalUsdUnits`, and cost `items` |
| Cost `items` | `productId`, package `quantity`, `originalPrice`, `originalCurrency`, `unitPriceUsd`, `unitPriceUsdUnits`, `lineTotalUsd`, `lineTotalUsdUnits`, UTC `observedAt`, `status:"verified"`, `sourceType:"seed"`, `demonstrationData:true` |
| `incompleteBranches` | Branch/chain IDs/names and sorted `missingProductIds`; branches are ordered by ID. No partial subtotal or rank |
| `cheapestBranchIds` | All exact minimum ties in branch-ID order; empty when nothing qualifies |
| `inactiveProductIds` | Sorted inactive required IDs. Any inactive item blocks the entire basket, preserving all items; eligible/incomplete arrays and cheapest IDs are empty |
| `displayCurrency` | `USD` |
| `exchangeRate` | Fixed USD base/LBP quote, `quotePerBase:"90000"`, `policy:"owner_approved_fixed_rate"`, `live:false` |
| `monetaryPolicy` | `usdUnitDenominator:"9000000"`, `displayDecimals:2`, `rounding:"half_up"`, `ranking:"exact_units"` |
| `demonstrationData`, `dataLabel`, `freshness` | `true`, explicit invented-data/simulated-verification label, `not_evaluated` |
| `availabilityNotice` | Exactly one top-level reminder: "Product availability is not verified in real time. Please check with the supermarket before visiting." |

All catalog branches are considered, including those with zero eligible prices.
If no complete branch exists, return HTTP 200 with empty eligible/cheapest arrays
and missing-price diagnostics, without a recommendation. Missing coverage means
missing eligible prices, never an out-of-stock statement. No catalog branches also
produces `no_complete_branches`. Any inactive required product produces HTTP 200
`inactive_products`; do not rank a smaller active-only basket.

Monetary strings preserve the original DECIMAL amounts/currencies. Exact integer
units represent **1/9,000,000 USD** each: USD hundredths multiply by 90,000;
LBP hundredths already are units. BigInt sums/multiplication/comparison prevent
binary floating-point error and repeating-decimal truncation. `*UsdUnits` fields
are decimal integer **strings**, divided by `usdUnitDenominator` for exact USD.
Only displayed `*Usd` fields round half up to two decimals. Unit/line display
values must never be summed to reconstruct a basket: only the exact values are
authoritative. Rounded totals may look equal while ranks differ; exact ties share
one dense rank and all minimum ties appear in `cheapestBranchIds`.

Illustrative **response excerpt** for one product at quantity two (omitted fields
are defined above; this is not a claim about current real prices):

```json
{
  "outcome": "complete",
  "eligibleBranches": [{
    "branchId": 3, "rank": 1, "totalUsd": "3.20", "totalUsdUnits": "28800000",
    "items": [{
      "productId": 1, "quantity": 2,
      "originalPrice": "1.60", "originalCurrency": "USD",
      "unitPriceUsd": "1.60", "unitPriceUsdUnits": "14400000",
      "lineTotalUsd": "3.20", "lineTotalUsdUnits": "28800000",
      "observedAt": "2026-01-15T12:00:00.000000Z",
      "status": "verified", "sourceType": "seed", "demonstrationData": true
    }]
  }],
  "cheapestBranchIds": [3],
  "availabilityNotice": "Product availability is not verified in real time. Please check with the supermarket before visiting."
}
```

Comparison reads the owned parent under `FOR SHARE` in a scoped REPEATABLE READ
transaction, then reads items/products, branches and prices on the same consistent
snapshot. T03-A mutations require the parent's exclusive lock and wait until
these reads finish. The transaction commits before pure calculation; later edits
cannot change the already materialized response inputs. See
[T03-B verification](t03b-verification.md) for precision proofs and owner commands.
