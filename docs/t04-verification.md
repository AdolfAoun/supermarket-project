# T04 — Shopping basket optimization

Implemented 2026-11-15. On 2026-11-17 the owner confirmed successful physical-iPhone
acceptance, stated that optimization works as expected, and authorized finalization,
commit and push to main. T04 is complete and owner-accepted.
Original requirements are unchanged. No T05 routing or fuel calculation is present.

## Implementation and architecture

The existing saved-list editor now opens **Find Cheapest Basket**. One authenticated
request returns ranked complete single branches plus the exact cheapest allocation
within maximum 1, 2 (default), or 3 physical branches. A maximum never forces visits.
All quantities of one exact registered product/package go to one branch.

The repository retains the four batched SELECTs and existing owned-parent FOR SHARE
lock inside REPEATABLE READ. Items, activity, branches and prices share a snapshot.
It commits before CPU calculation, so list writes wait only during materialization.
There is no N+1 retrieval, optimization persistence, global mutable request state,
schema change, seed change or new dependency.

`basket/pricing.ts` supplies cost lines shared by accepted comparison and optimization.
`shared/money.ts` retains the owner-approved fixed 90,000 LBP/USD rate, using BigInt
units of exactly 1/9,000,000 USD. Original DECIMAL amounts and currencies survive.
Quantities, lines, subtotals, ranking, ties and savings use unrounded units. Display
strings alone round half up to two decimals. Rounded components may not sum to the
rounded total; this is explained in the UI. Savings percentages round half up to
two decimal places from exact amounts; no valid single baseline means null savings.

`basket/optimize.ts` is deterministic and independent of Express, React and MySQL.
It rejects duplicate products, invalid quantities and inconsistent product IDs.
It uses prepared product/branch cost maps, omits branches without useful coverage,
and enumerates all sets up to the requested maximum. Each product selects its
cheapest member, with lower branch ID resolving equal prices. Complete singles
rank by exact total, with dense ties. The split optimum compares exact total,
actual number of branches used, then lexicographic branch IDs. Enumerating smaller
sets ensures equal-cost assignments using fewer visits are considered.

`generateBasketCandidates` yields feasible branch allocations, including more
expensive branch sets. T05 can evaluate these with travel costs instead of receiving
only today's merchandise winner. It need not rewrite price selection or arithmetic.
Distance, routing sequence, detour, fuel, final-stop constraints and overall-cost
ranking remain outside T04.

## Price and data-quality policies

SQL filters `status='verified'`, `source_type='seed'`, supported USD/LBP currencies
and positive prices **before** selecting one `(product,branch)` observation by
`observed_at DESC, id DESC`. Newer pending/flagged/rejected or unapproved-source
observations never replace an eligible one. Corrupt selected monetary values fail
closed; missing prices never become zero. No brand/package substitution is allowed.

`PRICE_FRESHNESS_DAYS` defaults to 30, validated as an integer 1–65535 at startup.
The pure engine accepts a clock and policy for repeatable tests. Selected lines are
`recent`, `older` (strictly over the threshold), or `future`. Old observations stay
eligible with caution; future timestamps are explicitly cautioned. Observation and
evaluation timestamps retain the API's six-digit UTC format. The embedded legacy
comparison's `freshness: not_evaluated` is retained for compatibility; the new
per-line freshness fields are authoritative for T04 and are what its screen uses.

The schema contains no stock/unavailability field. Every selected line therefore
has `availability:'unknown'`; complete coverage means price-covered, never confirmed
stock. Simulated verification and invented demonstration data remain visible.
Potential merchandise savings exclude all travel/fuel costs, including tiny savings.

Inactive items are explicitly excluded and returned with names/packages in
`excludedItems`, without modifying the stored list. This follows the new T04 task.
The accepted `/compare` endpoint still blocks an inactive basket. Empty or entirely
inactive optimization returns 400 rather than recommending a fake zero-cost store.
The item reader now detects missing product references with LEFT JOIN and fails
closed, preventing silently reduced baskets even if legacy FK corruption exists.

## Complexity and limits

For P active products, B useful branches and maximum K ≤ 3, enumeration costs
O(P × sum(k × C(B,k), k=1..K)); prepared pricing uses O(PB) space. Candidates are
streamed and only the best is retained by the current service. The generator can
yield duplicate actual branch sets when unused members collapse; this cannot alter
the optimum and avoids retaining a large deduplication cache.

Before enumeration the service estimates `P × K × sum(C(B,k))`. Above 10,000,000
checks it returns explicit HTTP 422 with advice to reduce the maximum. It never
truncates useful candidates or claims an approximate result is exact. This protects
the demo's event loop, but the largest accepted workloads still consume measurable
synchronous CPU; large production coverage would need a revised execution budget
or worker strategy. No production-scale performance claim is made.

Measured in the automated suite after caching exact line costs:

| Products / branches | Maximum 2 | Maximum 3 |
|---|---:|---:|
| 10 / 5 | 0.8 ms | 1.2 ms |
| 30 / 10 | 2.7 ms | 4.3 ms |
| 50 / 20 | 16.0 ms | 57.8 ms |
| 100 / 50 | 76.3 ms | 1149.7 ms |

These are one observed run, not guarantees; concurrent exports/typechecks affect timing.

## Verification

### Finalization checks — 2026-11-17

Reviewed all 28 intended changed/new files against `0241357`. No unrelated changes,
credentials, personal data, temporary fixtures or generated output are included.
Finalization edits record owner acceptance and strengthen the existing candidate
regression test to retain a more expensive grocery option for future travel
evaluation. No T05 code was added. The roadmap marks T04 complete and owner-accepted.

The table below was rerun successfully for finalization, including all optional
database groups (zero skips), both browser workflows and both Expo exports.
Backend tests were rerun after the regression-test change, followed by the test
TypeScript check. T01 health, T02 catalog and T03 auth/list/comparison regressions
are covered by these suites. Both projects' production/test TypeScript checks
and the backend production build passed.

The existing `node database/tests/catalog.test.cjs` suite also passed all 12 checks
in a separate disposable schema on loopback MySQL port 3308. Its first attempt
failed authentication because PowerShell removed an empty password environment
variable; explicitly setting the disposable empty password inside Node corrected
the test setup. No application credentials or records were changed.

Commands completed: backend `npm test` with `T03_TEST_PORT`, `T03_TEST_DATADIR`
and `RUN_CATALOG_DB_TESTS=1`; backend `npm run typecheck`, `npm run typecheck:tests`,
`npm run build`; mobile `npm test`, `npm run typecheck`, `npm run typecheck:tests`,
`npm run test:private-live` with `RUN_T03_BROWSER_TESTS=1`, `npm run test:live`,
`npm run test:browser`; `npx expo export --platform all` and
`npx expo export --platform web --output-dir dist/web`; the database suite above.
Public live/browser checks used the built API temporarily on `127.0.0.1:3011`.
Exports, screenshots and command logs are ignored and excluded from the commit.

| Check | Result |
|---|---|
| Backend `npm test` with dedicated MySQL and read-only catalog opt-ins | 114 passed, 0 failed, 0 skipped |
| Mobile `npm test` | 79 passed, 0 failed |
| Mobile `npm run test:private-live`, browser enabled | 9 passed, 0 failed, including rendered browser flow |
| Existing public `npm run test:live` | 6 passed, 0 failed against temporary loopback API |
| Existing public `npm run test:browser` | Passed all catalog/navigation/error-recovery scenarios |
| Existing database catalog schema/seed suite, isolated schema | 12 checks passed |
| Backend `npm run typecheck`, `npm run typecheck:tests`, `npm run build` | Passed |
| Mobile `npm run typecheck`, `npm run typecheck:tests` | Passed |
| `npx expo export --platform all` | iOS, Android and web passed |
| `npx expo export --platform web --output-dir dist/web` | Passed; browser fixture bundle |
| Physical iPhone | Owner confirmed successful acceptance on 2026-11-17 |
| Physical Android device | Not performed/reported |

Tests cover the independently calculated $8.50 single/$8 split/$0.50 and 5.88%
example; quantities; exact mixed currency/sub-cent savings; disjoint coverage;
one/two/three-stop limits; partial cheap branches; ties and zero savings; no baseline;
no prices; stale/future observations; invalid persisted input; unauthorized/deleted
lists; query/body validation; SQL selection ties/status/source rules; no writes;
concurrent list update/snapshot isolation; missing product references; computation
limits; and reconciliation. Thirty generated small matrices additionally use an
independent exhaustive **product-assignment** oracle, checking the branch-set
algorithm's exact optimum and monotonicity under increasing maximum visits.

Mobile tests validate response identity, trust fields, branch membership, exact
line/subtotal/total/savings reconciliation, control query parameters, 401 handling,
late prior-list responses and refresh. Rendered Chrome at a 390×844 mobile viewport
uses real registration/list operations and disposable SQL to verify single-store
results, a real two-branch $0.90 allocation with $3.00/76.92% savings, branch controls,
freshness/demo/package labels, no-savings one-store selection, quantity updates,
refresh and logout. Controlled proxy responses separately verify server-error/retry
and no-price coverage UI; those two response cases are explicitly mocked.

The default sandbox initially blocked Node test workers with `spawn EPERM`; approved
test executions with child-process support succeeded. Early tests caught the UTC
millisecond/microsecond mismatch and an omitted product brand in presentation;
both were corrected before final verification. No device testing is implied by
the browser test or native bundle exports.

The optional public smoke commands initially found no API listening on port 3000.
They were rerun successfully against a temporary built API on 127.0.0.1:3011 using
`LIVE_CATALOG_API_URL=http://127.0.0.1:3011/api`. Those checks only read the existing
catalog. The temporary API and disposable test MySQL were stopped after verification.

## Reproducing checks

Use the dedicated temporary server instructions in
[T03-A verification](t03a-verification.md#reproducing-isolated-database-tests).
It binds only loopback port 3308 and uses `%TEMP%/supermarket-t03a-mysql`.
Tests verify server datadir identity before creating separate disposable schemas.
No integration fixture writes target the owner application database. Existing
`RUN_CATALOG_DB_TESTS` checks are SELECT-only against the configured catalog.

```powershell
cd backend
$env:T03_TEST_PORT = '3308'
$env:T03_TEST_DATADIR = Join-Path $env:TEMP 'supermarket-t03a-mysql'
$env:RUN_CATALOG_DB_TESTS = '1'
npm test
npm run typecheck
npm run typecheck:tests
npm run build
cd ../mobile
npm test
npm run typecheck
npm run typecheck:tests
npx expo export --platform all
npx expo export --platform web --output-dir dist/web
$env:RUN_T03_BROWSER_TESTS = '1'
npm run test:private-live
```

The browser's extra price is a clearly labeled disposable fixture and is removed
even if the run fails. Test schemas are dropped in finally blocks. Generated
exports, logs and the browser screenshot remain ignored by git. No application
credentials, accounts, listeners, grants or existing Windows services are changed.

## Files and database actions

New: backend `basket/pricing.ts`, `basket/optimize.ts`, `tests/optimization.test.ts`;
mobile `services/optimization-contracts.ts`, `components/OptimizationResults.tsx`,
`app/lists/[id]/optimization.tsx`, `tests/optimization.test.ts`; this report.

Updated: basket comparison/repository/routes, list-item reference reader, HTTP
error type, server freshness configuration/example, account API and reusable
private validators, list editor entry point, database and browser integration
tests; README, architecture, decisions, frontend, database, API and roadmap docs.

**No phpMyAdmin import, migration, seed reload or dependency installation is needed.**
The optional freshness environment setting can be omitted to use 30 days. Restart
the backend after updating source/configuration; do not share DB access with phones.

## Owner Expo Go acceptance

1. Start existing WAMP/MySQL, then `cd backend; npm run dev`. In another terminal
   run `cd mobile; npm start`. Use the existing PC LAN API URL and Expo Go setup.
2. Log in. Open/create a saved list. Add Coca-Cola 1.5 L ×2 and Master Potato Chips,
   Salted, 90 g ×1. Tap **Find Cheapest Basket**. The unchanged seed gives best
   single USD 3.90, up-to-two USD 3.90 and zero savings; branch four lacks chips.
3. Check package/quantity labels, observation dates, older-price caution, demo
   label, unknown-stock reminder and explicit fuel exclusion. Scroll to incomplete
   branch diagnostics and check that all controls fit below the iOS header.
4. Switch 1/2/3 maximum branches. The seed may still choose one branch; that is
   correct. The true split/positive-savings example is covered by disposable tests,
   without modifying your demonstration seed to manufacture a UI result.
5. Return to edit, change Coca-Cola quantity to 3, reopen optimization and check
   best single total USD 5.50. Test manual refresh, then a different saved list.
6. Temporarily stop the backend. Refresh, confirm a clear error and absence of
   previous results; restart it and retry. Log out and confirm private results hide.
7. Check an empty list: add-products guidance appears and optimization is disabled.
   Repeat basic navigation on Android when a device is available.

## Remaining limitations and Git

Trustworthy real-source ingestion, physical stock, live FX, substitutions, splitting
units across stores, persistent preferences, travel/routing/fuel and receipt OCR
remain unimplemented. T04's maximum is an on-screen request preference only.
The schema cannot express confirmed unavailability. Display rounding can conceal
sub-cent differences; exact units remain authoritative. No total-trip savings claim
or full fulfillment of route-dependent formal requirements is made.

Work was performed on `main`, based on `0241357`. The owner authorized finalization
with commit message `feat: complete T04 shopping basket optimization` and a normal
push to `origin/main`. The final delivery report records the resulting commit and
verified Git state.
T05 should consume multiple feasible candidate allocations, evaluate route/fuel
costs, and then rank total estimated costs while reusing T04's pricing and coverage.
