# T05-C — Fuel-aware shopping costs

Implemented for owner review on 2026-11-22. Physical-iPhone acceptance is pending.
No application database changes, migrations, location imports, commits or pushes
were performed. No dependency or lockfile changed. Earlier audit evidence remains
historical; this document records T05-C behavior and checks.

## Inspection findings and selected boundary

Before implementation, T04 optimized merchandise only across at most three physical
branches. Its exact monetary units, eligibility, freshness, inactive exclusions,
snapshot ownership and candidate generator were reusable. T05-B already supplied
OSRM driving distance/time, complete multi-stop requests, full baseline geometry,
stop-order preservation, cache/throttling, Google Maps import and foreground GPS.
Geographic distance was a corridor filter, never a replacement road distance.
There was no vehicle/fuel setting, fuel calculation or persisted user preference.
Default demo branches had no coordinates; imported real locations had no prices.

The owner confirmed this policy before implementation:

- Different endpoints: charge `max(0, shoppingMeters - baselineMeters)`. The
  original baseline includes the original ordered intermediate stops.
- Identical endpoints: charge the full shopping route distance, even when original
  intermediate stops exist. The route returns to the specified starting point.
- Neither endpoint is assumed to be home. There is no separate round-trip mode.
- Preserve grocery-only comparison independently of routing.

The new authenticated read-only POST endpoint and UI mode reuse existing modules.
Shared basket preparation was extracted without changing the T04 algorithm.
Coordinates are materialized inside the same four-SELECT basket snapshot, then
SQL commits/releases before any routing. Location data is an internal snapshot
sidecar; existing compare/optimization JSON shapes remain unchanged.

## Fuel calculation and precision

User consumption is a decimal string in L/100 km, greater than 0 and at most 100,
with at most two decimals. Price is a decimal string per **one liter**, USD or LBP,
from 0 through 9,999,999,999.99, at most two decimals. Whitespace, exponent syntax,
negative/missing/nonfinite/numeric-JSON values and unsupported currencies are
rejected. Decimal points are required. Zero price is an explicit free-fuel
assumption; zero consumption is invalid. No supposedly current Lebanese fuel
price or live fuel API is supplied. Manual price is not a claim to satisfy the
full future latest-fuel-price sourcing requirement.

`liters = chargedMeters / 1000 × consumption / 100`

`fuelUsd = liters × pricePerLiterUsd`

`combinedUsd = exactGroceryUsd + fuelUsd`

The existing fixed 90,000 LBP/USD rate is preserved. Provider number decimal
representations are parsed into BigInt numerator/denominator pairs, including
scientific notation. Baseline subtraction, the nonnegative clamp, consumption,
currency conversion and combined totals remain exact fractions. Rankings compare
fractions by cross multiplication. Monetary display alone rounds half up to cents;
liters display six decimal places. Displayed lines may not sum to displayed totals.
Serialized exact fractions permit reconciliation without introducing a financial
library. OSRM distances themselves remain estimates, not exact physical measurements.

Worked example: baseline 10 km, shopping journey 30 km, consumption 10 L/100 km,
price USD 1/L. Charged distance is 20 km, fuel is 2 L / USD 2. With USD 40 groceries,
the combined comparison is USD 42; the pre-existing journey's fuel is not charged.
For identical endpoints and a 20 km shopping route, all 20 km are charged.

Another example: a USD 40 basket with USD 10 incremental fuel loses to a USD 44
basket with USD 3 fuel: USD 50 versus USD 47. Grocery-only mode can still recommend
the USD 40 merchandise basket and explicitly excludes travel.

## Candidate selection and routing limits

1. Validate the owned basket, retain T04 active-item exclusions and eligible latest
   verified seed prices. Missing prices never become zero and incomplete single
   branches are not complete plans. Inactive exclusions are named in results.
2. Obtain one OSRM baseline for origin → original stops → destination. Reject
   unavailable/malformed baseline metrics/geometry rather than inventing a route.
3. Use the conservative envelope and exact 3 km spherical corridor. Consider only
   price-bearing branches with valid coordinates. Select the nearest three by
   corridor distance, then branch ID. Same-chain identical six-decimal locations
   keep the lower ID and disclose the duplicate; prices are never merged.
4. Generate every complete merchandise allocation within the selected branches and
   chosen maximum of 1/2/3 stores, using the T04 generator. Deduplicate branch sets.
   Evaluate sets in increasing branch count and stable ID-string order.
5. Lazily enumerate supermarket visit permutations interleaved with existing stops;
   original stops keep their relative order. Route the entire journey once per
   evaluated order, instead of adding independent store round trips. Maximum nine
   intermediate points, 24 shopping-route evaluations plus one baseline, and a
   60-second request deadline. Larger combined stop sets are disclosed as skipped.
6. Apply the 0–30 minute driving allowance: incremental time for different
   endpoints, full trip time for identical endpoints. Reject time deltas below
   -1 second using the established route-consistency check. Signed shorter route
   distances remain valid but incremental fuel is clamped to zero.
7. Keep each set's cheapest evaluated combined total. Rank by exact combined cost,
   fewer used branches, lower sorted branch IDs, shorter route distance/time, then
   stable visit-order string. All product quantities remain at one assigned branch.

This is explicitly **best among evaluated plans**, not a global optimum. Branches
outside the corridor are outside scope. More than three price-bearing corridor
candidates, missing/invalid/duplicate locations, stop/call/deadline limits and
provider failures disclose incomplete evaluation. NoRoute/snapping are definitive
unusable orders; above-allowance orders are also excluded from valid plans.
Existing stop insertion can consume the budget before all multi-store orders are
checked. A required fourth candidate may be omitted even when it would complete
the basket; unavailable results do not claim no solution exists anywhere.

The existing OSRM adapter retains serial public-provider calls at least one second
apart, seven-second provider deadlines, five-minute/128-route cache, in-flight
coalescing and bounded queue. Fuel changes reuse cached routes; comparison is
explicitly submitted instead of requested for every keystroke. Two simultaneous
fuel calculations are allowed per application instance. No matrix provider,
distributed cache, paid API or new dependency was introduced. Normal three-branch
journeys without original stops require at most 15 shopping orders plus baseline.
Provider road routes are time-optimized estimates; this is not an exhaustive
search of all alternative roads for the minimum fuel distance.

The focused 17-test fuel suite completed in approximately 656 ms locally, including
test startup and HTTP fixture tests; most small injected-route scenarios took less
than 1 ms after warm-up. These are fixture timings, not live-provider benchmarks.
Public-service throttling and latency dominate a real calculation, which may take
up to the 60-second deadline. No live routing latency is claimed in this task.

## API and failure behavior

`POST /api/shopping-lists/:id/fuel-optimization`

```json
{
  "maxStores": 2,
  "journey": {
    "origin": { "latitude": 34, "longitude": 35.6 },
    "destination": { "latitude": 34.02, "longitude": 35.6 },
    "waypoints": [],
    "maxDetourMinutes": 8
  },
  "fuel": { "consumption": "10", "price": "1", "currency": "USD" }
}
```

Coordinates in this example illustrate the contract, not store locations or a
claim about actual road distances. No query parameters, user IDs, client prices,
totals, routing URLs, distance policies or candidate overrides are accepted.

Response: owned active `shoppingList`, `excludedItems`, echoed `journey`/`fuel`,
`maximumStores`, derived `distancePolicy`, `baseline`, `status` (`available` or
`unavailable`), sorted `plans`, `candidateBranchIds`, `excludedBranches`,
`routeFailures`, `routeEvaluations`, `evaluationComplete`,
`scope:"best_evaluated_plans"`, estimated/liveTraffic flags, timestamp, freshness
threshold, demonstration flag and provider attribution.

Each plan includes T04 `grocery` allocation, total road meters/seconds, charged
meters, displayed liters/fuel/combined USD, `fuelExactUsd` and `totalExactUsd`
numerator/denominator strings, `visitOrder` and complete ordered `routePoints`.
Only complete active baskets appear, including split-only plans without a complete
single-store alternative. Google Maps handoff uses those exact ordered points.

All endpoint responses set no-store. Missing/expired auth uses 401; foreign/missing
list uses the same 404; invalid inputs/empty/all-inactive lists use 400. Unusable
baseline routes/snapping use 422; baseline provider failures or busy use 503;
unexpected database/corruption errors remain sanitized 500. After a usable baseline,
successful work survives provider failure/deadline with incomplete metadata.
Client disconnects cancel normally. If no complete route-qualified plan survives,
HTTP 200 explicitly returns unavailable and empty plans, never zero fuel defaults.

## Mobile behavior and persistence

The existing Grocery prices screen adds Grocery only / Groceries + fuel controls.
The fuel mode reuses the existing journey import/GPS controls without running
standalone discovery or loading grocery optimization automatically. After choosing
a journey, enter consumption, per-liter price/currency and driving allowance;
maximum branches remains the existing 1–3 control. Currency changes do not silently
convert the input. Explicit calculation shows groceries, fuel, combined total,
whole/charged distance, liters, branch visit order, per-product quantities/prices,
freshness and limitations. Navigation preserves the destination/original stops.

Fuel preferences use the already-installed SecureStore under a separate device
key; browser values are memory-only until reload. These are device preferences,
shared across accounts on that device, not a new account profile. No precise
location, journey URL or list is persisted with them. Restore errors allow manual
entry; save errors disclose that calculation can proceed without persistence.
Journey coordinates go to the existing routing provider and transient cache only.

Input/maximum/journey changes hide the previous result. A keyed focus-owned
resource aborts/invalidate old requests on mode/navigation/account changes, even
if transport ignores AbortSignal. Repeated calculation taps with unchanged inputs
do not launch additional work; retry/refresh explicitly starts a replacement read.
Switching back to Grocery only works without fuel settings or a usable provider.

## Initial implementation verification and evidence (2026-11-22)

All mathematical tests use deterministic injected routing. Database suites target
the existing loopback-only disposable MySQL instance on 3308 and verify its datadir
before fixture DDL/writes. The catalog SELECT group is redirected to a separate
disposable catalog and SELECT-only test account. New SQL/browser fuel cases attach
clearly synthetic coordinates to disposable demo rows only, then restore NULLs
and assert original catalog data unchanged. No owner record is modified and no
price is attached to a real/imported business for demonstration.

| Check | Result |
|---|---|
| Backend full suite with all isolated DB groups | 200 passed, 0 failed, 0 skipped |
| Mobile unit/contract/race suite | 111 passed, 0 failed, 0 skipped |
| Mobile → Express → SQL and rendered Chrome | 12 passed, 0 failed, 0 skipped |
| Backend/mobile application and test typechecks | Passed |
| Both packages' unused-symbol checks | Passed |
| Backend production build | Passed |
| Expo iOS/Android/web export and separate browser export | Passed |
| Git whitespace checks | Passed |
| Expo compatibility check | Existing patch drift; failed exit 1, packages unchanged |
| Physical iPhone | Not executed; pending owner acceptance |
| Fresh live OSRM requests | Not executed; tests use injected routing |

### Final currency validation review (2026-11-23)

The final review reproduced a validation defect: coercing currency through String
accepted arrays such as `["USD"]`, then nonzero fuel calculation failed internally.
The correction accepts only primitive strings exactly equal to USD or LBP, without
coercion. HTTP regressions exercise 20 malformed/missing currency values with both
positive and zero prices (40 requests), requiring 400 before any repository/routing
work. Direct validation also rejects boxed String objects. Valid USD 1/L and LBP
90,000/L both produce 2 L / USD 2 fuel for 20 km at 10 L/100 km; adding USD 1
groceries produces the same exact USD 3 combined plan in both currencies.

Post-correction checks:

- Backend `npm test`: 140 passed, 0 failed, 5 database groups skipped (145 total).
- Focused fuel/formula/HTTP integration suite: 19 passed, 0 failed/skipped; included
  in the backend count, not additional tests to sum with it.
- Mobile `npm test`: 112 passed, 0 failed/skipped. This includes a new real mobile
  HTTP client → Express test with in-memory repository/routing fixtures, verifying
  USD/LBP totals, malformed currency rejection and independent grocery-only results.
- Backend/mobile application/test TypeScript checks and backend build: passed.
- Git whitespace and final scope/sensitive-file review: passed.

The initial 200-test database-enabled backend and 12-test SQL/browser results above
remain historical evidence, not claimed reruns after this fix. No database service,
migration, importer or write fixture was executed during this correction/review;
the owner's latest instruction prohibited migrations and existing-record changes.
The mobile production code did not change during this correction, so the initial
Expo export/browser evidence remains applicable without another expensive run.
Known Expo patch drift and pending physical-iPhone acceptance remain unchanged.
The owner separately authorized committing and pushing the reviewed complete T05-C
implementation after this correction; original implementation Git restrictions
below record the earlier handoff state.

Commands: backend `npm test` with T03_TEST_PORT/T03_TEST_DATADIR and
RUN_CATALOG_DB_TESTS=1; mobile `npm test`, `npm run test:private-live` with the
disposable variables and RUN_T03_BROWSER_TESTS=1; both packages `npm run typecheck`,
`npm run typecheck:tests`, `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`;
backend `npm run build`; mobile `npx expo export --platform all`,
`npx expo export --platform web --output-dir dist/web`, `npx expo install --check`;
root `git diff --check`. DB_HOST/PORT/NAME/USER/PASSWORD for catalog tests are
explicitly redirected to the disposable fixture, never the configured owner DB.

New coverage includes hand-calculated A–L scenarios, exact sub-cent fuel ranks,
zero-cost assumption versus unavailable routes, quantity 999, mixed currencies,
three-store allocation, visit permutations, retained original stop order, full
return distance, clamped shorter distance, invalid/missing/duplicate coordinates,
provider/stop/call bounds, partial deadline, auth/ownership and unchanged T04 output.
Mobile tests validate complete product coverage, amount reconciliation, bad payloads,
fuel boundaries, parameter identity, stale success/failure suppression, preference
serialization and navigation. Chrome exercises valid/invalid inputs, updated price
recalculation, immediate result invalidation, mode switching and widths 320/390/430.
SQL tests verify missing-coordinate results, changed quantities and full/incremental
fuel through the actual client/Express/repository chain.

The known Expo mismatch remains: expo 58.0.23 vs ~58.0.26, constants 58.0.15 vs
~58.0.16, font 58.0.11 vs ~58.0.12, linking 58.0.16 vs ~58.0.17, router 58.0.30 vs
~58.0.32, secure-store 58.0.2 vs ~58.0.3, status-bar 58.0.4 vs ~58.0.5.
Exports/browser tests are not physical-device verification.

## Owner acceptance and remaining limitations

1. Restart the backend and reload Expo. No new environment setting, migration,
   database import, account or dependency install is required for this code.
2. Confirm Grocery only still loads the accepted basket results without a journey.
3. Choose Groceries + fuel, import an ordinary driving journey (or use GPS for the
   start), enter settings and calculate. Check that only additional distance is
   charged, original stops/endpoints are retained and navigation opens as intended.
4. For matching endpoints, check that full route distance is charged. Neither
   endpoint is described as home. Check existing stops are never dropped.
5. Try consumption 0/negative/too large, decimal values, both currencies, a zero
   price, edited parameters and maxima 1/2/3. Verify disabled invalid submission,
   stale results disappearing and clear USD grocery/fuel/total breakdowns.
6. Switch tabs/modes or log out during loading. Simulate unavailable networking,
   retry and verify grocery-only mode remains usable. Check quantity changes are
   reflected after returning to comparison.
7. Relaunch native Expo to check fuel preference persistence and keyboard/safe-area
   behavior. Web intentionally forgets preferences on reload. Review long labels
   and route/price cautions on the physical iPhone.

Successful fuel comparisons require **both** eligible prices and genuine branch
coordinates. Existing demo rows lack coordinates, while location datasets contain
no prices. Unavailable fuel results may therefore be the correct owner-environment
outcome. This task does not invent coordinates/prices or approve importing data to
make a demonstration succeed. Review future coverage separately. The synthetic
positive cases above are isolated tests, not actual Lebanese supermarket facts.

No formal requirement was waived or marked complete. Manual fuel pricing, limited
candidate/order evaluation, missing real coverage, approximate entrance access,
time-optimized OSRM roads and pending native acceptance remain explicit limits.
T05-D final polish is still separate; this owner-assigned T05-C includes bounded
multi-store fuel evaluation without claiming unrestricted final route optimization.

## Changed-file and architecture summary

Backend: new `basket/fuel.ts` and `basket/trip.ts`; shared preparation in
`basket/optimize.ts`; internal snapshot locations in `basket/repository.ts`; new
POST orchestration in `basket/routes.ts` and routing injection in `app.ts`.
New deterministic fixtures/tests: `tests/fixtures/fuel.ts`, `tests/fuel.test.ts`.
Mobile: new FuelComparison component, fuel contracts/preferences/storage services
and tests; account API method; optional journey renderer; optimization mode controls;
expanded disposable SQL/browser journeys. README, roadmap, API/frontend/architecture/
decisions and engineering explanations now describe the implemented boundary.
No database schema, import tooling, dependencies or existing wire contracts changed.

Working tree on `main`: 17 modified files and 10 new files. Exact inventory:

- Modified: `README.md`; `backend/src/app.ts`;
  `backend/src/modules/basket/optimize.ts`, `repository.ts`, `routes.ts`;
  `docs/api.md`, `architecture.md`, `database.md`, `decisions.md`,
  `engineering-audit-and-explanations.md`, `frontend.md`, `roadmap.md`;
  `mobile/app/lists/[id]/optimization.tsx`; `mobile/components/RouteDiscovery.tsx`;
  `mobile/services/account-api.ts`; `mobile/tests/private-browser.ts`,
  `private.integration.ts`.
- New: `backend/src/modules/basket/fuel.ts`, `trip.ts`;
  `backend/tests/fixtures/fuel.ts`; `backend/tests/fuel.test.ts`;
  `docs/t05c-verification.md`; `mobile/components/FuelComparison.tsx`;
  `mobile/services/fuel.ts`, `fuel-preferences.ts`, `fuel-storage.ts`;
  `mobile/tests/fuel.test.ts`.

The initial worktree was clean. No unrelated changes were discarded, staged,
committed or pushed. Generated exports/screenshots/test logs remain ignored.
The disposable test schema/account were removed and test server shut down after
verification; its pre-existing datadir was preserved. The owner's MySQL service,
schema, observations, branch information and environment files were untouched.
