# T03-B — single-branch basket comparison verification

Implemented and tested 2026-11-09. T03-A is committed and owner-accepted
(`1a32ca1`); the working tree was clean when T03-B started. T03-B is complete and
owner-approved after successful local WampServer MySQL API acceptance. Overall
T03 remains incomplete; T03-C and T05 are not part of this checkpoint.

## 2026-11-09 — Owner acceptance

The owner verified Coca-Cola 1.5 L × 2 and Master Potato Chips 90 g × 1 against
the local WampServer MySQL database and explicitly approved T03-B:

| Physical branch | Basket USD | Result |
|---|---|---|
| Carrefour Baabda | 3.90 | Rank 1 |
| Spinneys Beirut | 4.20 | Rank 2 |
| Spinneys Metn | 4.50 | Rank 3 |
| Le Charcutier Jounieh | — | Excluded: product ID 13 lacks eligible price coverage |

These are owner-reported manual acceptance results, distinct from automated
verification. The owner authorized a descriptive T03-B commit and ordinary push
to existing `main`. T03-C may proceed as a separate milestone after that push;
complete T03 remains subject to later owner acceptance.

Final checkpoint checks: backend tests with `RUN_CATALOG_DB_TESTS=1` passed
**59 tests, 0 failed, 2 disposable integration groups skipped**. The earlier full
91-test database run remains recorded below. Backend typecheck, test typecheck,
production build and staged whitespace checks passed. Reviewed files contain no
credentials, real session tokens, generated output or unrelated milestone changes.

## Calculation algorithm

`GET /api/shopping-lists/:id/compare` uses the existing authentication middleware
and derives the owner from the session. Repository input comes from the stored
list, never client-provided prices, totals, products, quantities or user IDs.

1. Start a transaction with explicitly scoped REPEATABLE READ isolation. Read the
   owned list header with `FOR SHARE`. Missing and foreign lists share the existing
   404. Read the list items and package-aware product details; an empty list is 400.
2. In that same snapshot, batch-read all physical catalog branches and selected
   prices for every list product. There are four SELECTs, independent of the item
   and branch counts, plus transaction setup/commit. SQL values are bound with
   mysql2 `execute`; no dynamic client SQL or per-item/per-branch query loop.
3. Select only verified seed-source observations, supporting USD and LBP in this
   new endpoint. Rank history by `(product_id,branch_id)` and
   `observed_at DESC,id DESC`, filter before ranking, and retain position one.
   Currency is not part of the partition. A newer eligible LBP observation wins
   over an older USD observation, even if the older price is cheaper.
4. Commit the materialized snapshot, releasing the list lock. Calculation is pure
   and uses only these returned inputs. Product activity, quantities and selected
   prices cannot change beneath that calculation.
5. If any required product is inactive, return `inactive_products`, preserve all
   required items and quantities, list inactive IDs, and return no eligible ranks
   or recommendation. Never compare an active-only subset.
6. For each branch, map selected observations by canonical product ID. A branch
   missing any required eligible price goes only into `incompleteBranches`, with
   missing IDs and no rank or partial subtotal. Physical branches of one chain
   cannot share coverage in this milestone.
7. Normalize each complete branch's original package price to exact USD units,
   multiply by requested package count, and sum exact line costs. Product size is
   descriptive identity and is never used as the shopping quantity.
8. Rank complete branches by unrounded exact totals, then branch ID. Exact ties
   share a dense rank (1,1,2); all exact minimum branch IDs are returned. If none
   qualifies, return `no_complete_branches` with no recommendation. No catalog
   branches is the same no-recommendation outcome.

## Eligibility and compatibility

- T02's verified/seed-source policy is retained. Pending, flagged, rejected,
  manual and online observations do not count. No freshness cutoff or future-date
  eligibility rule is invented. `freshness` remains `not_evaluated`.
- T03-B's approved currency scope admits both USD and LBP; T02's individual product
  comparison remains USD-only with its existing DTO, selection and ordering.
- Canonical product/branch IDs prevent size, variant, chain and branch mixing.
  Missing eligible coverage is not an inventory claim.
- Original amounts, currencies and UTC observation timestamps are retained. Root
  and cost-line demonstration indicators identify invented seed data and simulated
  verification. This feature makes no real-world price/stock/freshness claims.
- One top-level `availabilityNotice` contains exactly:
  "Product availability is not verified in real time. Please check with the supermarket before visiting."
  Future mobile results should render it once at the bottom.

## Monetary precision and rounding

The approved **fixed** rate is 1 USD = 90,000 LBP. It is centralized in
`modules/shared/money.ts`, with owner-approved-policy metadata; no network rate
lookup, billing or live-market timestamp is implied.

Existing prices are DECIMAL(12,2), so a hundredth of one LBP is an exact common
unit for both currencies: **one unit = 1/9,000,000 USD**.

| Input | Exact USD units |
|---|---|
| USD decimal-string amount | Parse integer hundredths and multiply by 90,000 |
| LBP decimal-string amount | Parse integer hundredths directly |
| Package line cost | Multiply units by the positive integer package quantity |
| Basket cost | Sum exact BigInt line costs |

No division/truncation occurs during conversion. Repeating USD fractions remain
exact. Arithmetic uses BigInt, including values above JavaScript's safe-integer
range. There is no authoritative JS Number calculation. JSON transports exact
values as decimal integer strings named `*UsdUnits`, with the denominator in
`monetaryPolicy.usdUnitDenominator`. Product sizes/IDs/quantities remain ordinary
numeric metadata within their existing bounds.

Only `formatUsd` rounds for display, half up to two decimals. Formatting is applied
after exact quantity multiplication and basket summation. Unit/line display
amounts are supplied for presentation only and must not be summed to reconstruct
a total. Rounded unit values can be zero for small positive LBP prices; exact units
remain positive. Different exact totals can display identically and still have
different ranks. Display equality must not be interpreted as an exact tie.

Proof case covered by tests:

- Branch A: LBP 441 + 441 = USD 0.0098. Rounding unit prices first gives 0.00.
- Branch B: LBP 9 + 864 = USD 0.0097. Rounding unit prices first gives 0.01.
- The correct winner is B. Both final totals display USD 0.01, but exact totals
  are 87,300 versus 88,200 units. The engine chooses B and does not declare a tie.

The reusable utility accepts positive decimal **strings** within DECIMAL(12,2)
range, with zero to two fractional digits. It rejects zero/negative prices,
non-finite or numeric JS inputs, exponents, extra precision, invalid formatting,
out-of-range values and currencies other than exact `USD`/`LBP`. Invalid internal
observations fail safely through centralized 500 responses, without SQL details.

## API contract and response example

See [the complete field contract](api.md#t03-b-single-branch-basket-comparison).
Authentication and caching conventions match T03-A. Query parameters and JSON
bodies are rejected with 400; no client policy/price/user override is accepted.

| Situation | Result |
|---|---|
| Missing/malformed/expired/revoked bearer session | 401 |
| Invalid list ID or unexpected query/body | 400 |
| Missing or foreign list | Same 404 `Shopping list or item not found` |
| Owned empty list | 400 `Shopping list is empty` |
| Complete branches exist | 200 `complete`; complete ranking and all exact cheapest IDs |
| No complete branch or no catalog branches | 200 `no_complete_branches`; no eligible winner |
| Any inactive required product | 200 `inactive_products`; required items retained, no ranking |
| Unexpected SQL or monetary failure | Sanitized 500 |

Illustrative **excerpt**, showing selected fields for product 1 at quantity two
in the unchanged demonstration seed. The full response additionally includes the
list's T03-A item/product DTOs, branch/chain names, all complete/incomplete branches,
fixed-rate and monetary-policy metadata, and demonstration/freshness labels.

```json
{
  "shoppingList": {"id":1,"name":"Demo basket"},
  "outcome":"complete",
  "displayCurrency":"USD",
  "eligibleBranches":[{
    "branchId":3,"rank":1,"totalUsd":"3.20","totalUsdUnits":"28800000",
    "items":[{
      "productId":1,"quantity":2,"originalPrice":"1.60","originalCurrency":"USD",
      "unitPriceUsd":"1.60","unitPriceUsdUnits":"14400000",
      "lineTotalUsd":"3.20","lineTotalUsdUnits":"28800000",
      "observedAt":"2026-01-15T12:00:00.000000Z",
      "status":"verified","sourceType":"seed","demonstrationData":true
    }]
  }],
  "cheapestBranchIds":[3],
  "inactiveProductIds":[],
  "availabilityNotice":"Product availability is not verified in real time. Please check with the supermarket before visiting."
}
```

## Concurrency and engineering audit

The shared parent lock is acquired before the first consistent item read, so all
T03-A operations that exclusively lock that parent must wait. The subsequent item,
product, branch and price reads share the same REPEATABLE READ snapshot. No server
default, global variable or schema is changed. Comparisons may share the parent
lock; locks last only through data materialization, not calculation or response
serialization. See the [MySQL consistent-read reference](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html)
for the distinction between locking reads and the first consistent-read snapshot.

A real MySQL test pauses the production repository after reading items, starts a
real T03-A quantity replacement and observes its actual lock wait in
`performance_schema`. A new verified price commits concurrently. The paused
comparison returns the old quantity and old price; after it completes, the waiting
update finishes and the next comparison sees the new quantity and new price.
The test uses a connection proxy, not production test hooks. This demonstrates
coherent input materialization rather than assuming request timing is sufficient.

Review verified exact monetary ordering/ties, package identity, unsupported money
rejection, status/source filtering before history ranking, cross-currency latest
selection, inactive whole-basket blocking, no incomplete winners, owner derivation,
sanitized errors, four batch reads and deterministic output. Duplicate selected
price keys fail closed rather than silently choosing one. Existing list DTO mapping
is reused with only its helper exported; no T03-A behavior changes.

Initial validation found two test-code issues: the overloaded mysql2 interceptor
needed explicit SQL/value parameter types, and a seeded expected total omitted the
documented branch offset (correct value USD 5.35, not 5.20). Both were corrected.
No production calculation defect was found in the final audit, and no unresolved
blocking correctness issue remains in the executed checks.

## Executed checks and database safety

Environment: Windows PowerShell, Node 24.11.1, WAMP/MySQL binary 8.4.7. No new
packages or lockfile changes.

| Command | Actual result |
|---|---|
| Backend `npm test`, default opt-ins disabled | **50 passed, 0 failed, 3 database groups skipped** |
| Backend `npm test` with `RUN_CATALOG_DB_TESTS=1`, `T03_TEST_PORT=3308`, dedicated `T03_TEST_DATADIR` | **91 passed, 0 failed, 0 skipped** |
| Backend `npm run typecheck` | Passed |
| Backend `npm run typecheck:tests` | Passed |
| Backend `npm run build` | Passed |
| `git diff --check` and whitespace checks on new files | Passed |

New checks: five exact-money tests, fourteen pure-calculation/HTTP tests, eight
T03-B real-MySQL subtests plus their parent. All 63 existing T01/T02/T03-A checks
also passed with integration enabled. The full initial run failed only the wrong
expected seeded total and its enclosing group; the corrected full run passed all
91. Node tests run with execution escalation because sandboxed worker spawning
was previously known to fail with EPERM.

T03-A and T03-B write fixtures used separate schemas on a **disposable** MySQL
instance bound to loopback port 3308 with its own temporary datadir. Both runners
verify the actual server datadir and refuse port 3306 or an existing test schema.
The new runner imports migrations/seed only there and drops its own schema in
`finally`. Snapshot comparisons prove comparison calls leave product, alias,
chain, branch, price, list and item records unchanged. Fixture-only historical,
status, mixed-currency, activity and concurrency writes never touch the owner's
application database. The disposable server is shut down and its temporary data
removed after verification.

Existing `RUN_CATALOG_DB_TESTS=1` also passed against WAMP using SELECT-only data
access and borrowed-connection session tests. The existing 36-product, three-chain,
four-branch, 125-observation smoke checks, catalog search/details/prices, strict UTC
pool configuration, health, authentication and list regressions all passed.
No migration, application account, grant, credential, global server configuration
or owner price record was changed. No mobile/device testing is claimed.

To reproduce database checks, use the dedicated disposable-server instructions
in [T03-A verification](t03a-verification.md#reproducing-isolated-database-tests).
Both T03 fixture groups automatically use distinct schemas when `T03_TEST_PORT`
and `T03_TEST_DATADIR` are set; the intentional temporary directory name remains
`supermarket-t03a-mysql`. Do not set those variables to the application instance.

## Owner PowerShell acceptance

The basket scenario above has passed owner acceptance. The commands below remain
reference instructions; there is no need to repeat or recreate the accepted data.

No phpMyAdmin action, migration or configuration change is required. Start the
existing WAMP and Express services. From the repository root:

```powershell
cd backend
npm test
npm run typecheck
npm run typecheck:tests
npm run build
npm run dev
```

In a second PowerShell terminal, log in with an existing T03-A account. These
manual steps create a disposable owner test list and later delete that list;
they do not change catalog products or observations.

```powershell
$api = 'http://127.0.0.1:3000/api'
$credential = Get-Credential -UserName 'your-existing-email@example.com' -Message 'Existing T03-A account'
$loginBody = @{ email = $credential.UserName; password = $credential.GetNetworkCredential().Password } | ConvertTo-Json
$login = Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.token)" }
$created = Invoke-RestMethod "$api/shopping-lists" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"name":"T03-B acceptance"}'
$listId = $created.shoppingList.id
# Before adding items, compare should return HTTP 400: Shopping list is empty.
Invoke-RestMethod "$api/shopping-lists/$listId/compare" -Headers $headers
Invoke-RestMethod "$api/shopping-lists/$listId/items" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"productId":1,"quantity":2}' | Out-Null
Invoke-RestMethod "$api/shopping-lists/$listId/items" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"productId":13,"quantity":1}' | Out-Null
$comparison = Invoke-RestMethod "$api/shopping-lists/$listId/compare" -Headers $headers
$comparison.eligibleBranches | Select-Object rank, supermarket, branch, totalUsd, totalUsdUnits
$comparison.incompleteBranches | Select-Object branchId, missingProductIds
$comparison.exchangeRate
$comparison.availabilityNotice
Invoke-RestMethod "$api/shopping-lists/$listId" -Method Delete -Headers $headers
Invoke-RestMethod "$api/auth/logout" -Method Post -Headers $headers
# Expected HTTP 401 after logout:
Invoke-RestMethod "$api/shopping-lists/$listId/compare" -Headers $headers
Remove-Variable credential, loginBody, login, headers
```

With the unchanged seed: branch 3 wins at USD 3.90; branch 1 totals USD 4.20 and
branch 2 USD 4.50. Branch 4 appears only in incomplete diagnostics, missing product
13. All observations remain demonstrative, not current market prices. Expected
HTTP errors are reported by PowerShell; continue after those expected checks.
Cross-account access should return the same 404 as a nonexistent list. Mixed
USD/LBP and precision cases are automated on disposable fixtures; do not alter
the owner's demonstration observations just to recreate those tests manually.
Only the basket scenario listed in the owner acceptance record is claimed as
manually verified; additional error/precision cases remain automated checks.

## Limitations and future reuse

- Owner API acceptance is complete. Mobile screens/storage remain T03-C.
- Only seed-source verified observations qualify. Real source trust and freshness
  remain separate decisions; this is a demonstration comparison engine.
- The rate is fixed, not live. Monetary parsing currently matches the existing
  DECIMAL(12,2) schema; future receipt values with different precision need an
  explicit extension, not silent rounding. Original records remain unchanged.
- Payloads include all catalog branches and required items; no pagination or
  large-scale optimizer/index work was introduced. Parent locks can briefly delay
  edits; unexpected transient SQL failures use the existing sanitized 500 behavior.
- Snapshot results describe a point in time and may be outdated by the next user
  action. No saved quote, reservation, real-time inventory or freshness promise.
- The pure basket engine, batch snapshot/price matrix and shared exact-money
  functions are reusable by T05. Future approved modes are one branch, exactly
  two branches, or automatic one/two branches, never exceeding two physical stops.
  A two-branch result will require combined complete coverage. Product assignment,
  final-stop constraints, routing, fuel and optimization are not implemented here.
- Original requirements are unchanged, and overall T03 is not marked complete.

## Files and repository state

Added: `backend/src/modules/basket/{repository,compare,routes}.ts`,
`backend/src/modules/shared/money.ts`, `backend/tests/{money,basket,basket-db}.test.ts`,
this verification report.

Modified: `backend/src/app.ts` (injected comparison repository/router),
`backend/src/modules/shopping-lists/repository.ts` (export/reuse the item reader),
`README.md`, `docs/api.md`, `docs/database.md`, `docs/architecture.md`,
`docs/decisions.md`, `docs/roadmap.md`.

No migrations/seeds, original requirements, mobile files, auth architecture,
environment files or dependency manifests changed. The initial implementation
made no commit or push; the subsequent owner-approved checkpoint authorizes both.
