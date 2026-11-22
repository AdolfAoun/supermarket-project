# T05-B — stabilized route-aware supermarket discovery

Implemented and stabilized 2026-11-21. **Owner and physical-iPhone acceptance pending.**
No commit or push was made. The optional real-location fixture was not imported
into the owner's application database. T05-C fuel integration has not started.

T05-B2 now supplies a separately reviewed OSM dataset and approval-gated importer.
See [data expansion and current import status](t05b2-data-import.md). This report
retains the T05-B stabilization evidence; application OSM import remains pending.

## What changed and why

Home now exposes **Supermarkets Along My Route** as an independent authenticated
screen at `/journey`. An account needs no shopping lists or products to import a
journey, discover supermarkets, adjust its allowance or open navigation. The
existing list-specific **Find Cheapest Basket** opens the separate **Grocery
prices** screen with the accepted T04 optimizer and maximum 1–3 branches.

Both features previously shared a list-only screen that unconditionally requested
T04 prices. That coupling is removed. One RouteDiscovery implementation serves
the standalone journey screen. Its optional saved-list section does not even
request lists until opened and explicitly requested; selecting a list then loads
T04 with maxStores=1 for branch comparisons. Pricing success/failure does not
restart or block the road search. Empty lists may fail price comparison, while
geographical discovery remains usable. No route ranking uses grocery totals.

A complete supported driving import moves directly from the compact form to
journey summary and results. T05-A's secure parser/short-link resolver, partial
imports, single-place assignment, explicit driving-mode choice and foreground
GPS remain necessary. Its separate long JourneySection/preview, confirmation
step, confirmed/imported flags, confirmation helpers and requiresConfirmation
field were removed. No duplicate importer or discovery implementation remains.

The stabilization corrects two material defects: overwritten mixed insertion
failures could incorrectly claim complete evaluation; and a plain SQL transaction
could commit partial fixture data if an import client continued after an error.
See the detailed semantics below.

## Complete workflow: Jounieh → Jbeil

1. Log in and choose Supermarkets Along My Route from Home. No list is needed.
2. Build a driving journey in Google Maps, copy its Share link and paste it into
   Import Route. The backend parses supported coordinates; short links resolve
   through a bounded, allowlisted redirect path. It does not geocode names or use
   Google's viewport as route endpoints.
3. A complete driving import starts discovery. A partial import instead explains
   missing locations; a place link can be assigned to start/destination. Current
   location can supply the start after foreground permission. Unknown/non-driving
   modes require an explicit driving choice. Original stops are never dropped.
4. The backend reads registered branches, releases SQL resources, obtains the
   baseline OSRM route, screens coordinates against its corridor, and evaluates
   candidate driving insertions. This can take up to one minute on a cold cache.
5. The screen shows baseline time/distance, a default-eight-minute slider, and
   eligible branches ordered by added driving time. Moving the slider filters
   existing results locally; it makes no HTTP or routing request.
6. Optionally open saved-list prices and choose a list. Eligible complete branch
   baskets show exact T04 totals with demo/freshness warnings. Missing prices
   remain missing; a list is never a condition for discovering a location.
7. Tap Navigate with Google Maps on a supermarket. The directions URL keeps the
   original origin, destination and original stop order, inserting the supermarket
   at its evaluated position. Google Maps calculates its own final navigation.

A supported same-start/end journey with no original stops is labeled an
out-and-back shopping trip. Its allowance and cards use the full return drive.
There is no separate manual journey builder or fuel estimate yet.

## Algorithm and evaluation reliability

OSRM's driving Route service snaps ordered coordinates to its road network and
returns its profile's route distance/time. The adapter requests full GeoJSON only
for the baseline. It validates units, finite metrics, legs, waypoint order and
snapping (at most 250 m), plus geometry size/ranges/endpoints. It does not calculate
live traffic or reproduce Google's chosen route. No straight-line routing fallback
is used when road routing fails.

The server measures spherical distance from each branch to every segment of the
baseline geometry. Valid distinct locations within **3 km** become candidates.
This is an inexpensive geographic screen, not a driving-time estimate. It can
exclude otherwise useful stores outside the corridor and cannot guarantee access
to the correct entrance. Missing/invalid coordinates and duplicates are reported.

For each selected candidate, insert that branch into every gap between original
ordered stops and request the **whole driving journey**. Choose the smallest
valid added time, then total driving distance on ties. Preserve the original stops.
No separate out-and-back legs or independent round-trip sums are substituted.

For example, a baseline of 1,200 seconds and a journey via a supermarket of 1,680
seconds gives 480 seconds = 8 minutes extra, included at 8. Another store with a
1,720-second journey adds 520 seconds = 8:40, excluded at 8 and included at 9.
Only raw seconds decide eligibility; display rounding never changes this result.
A store 500 m from the route might still require a long mountain/access detour.

Every insertion's distinct failure reasons accumulate in a Set. A later NoRoute
cannot erase an earlier provider failure. A successful option remains usable
alongside diagnostics from its other failed insertions; it may not be the best
possible insertion when coverage is incomplete. Above-threshold best-known
options do not prove all uncomputed alternatives exceed the allowance.

NoRoute and excessive snapping are completed, unusable insertion outcomes.
Provider/transport errors, inconsistent metrics, skipped work and deadlines mark
**evaluationComplete=false**. Distinct reasons for the same branch are preserved;
exclusions are diagnostics and can accompany an option. Complete evaluation means
only that the selected corridor search completed, never exhaustive national data.

The 60-second server deadline carries an explicit timeout reason. After a valid
baseline, it returns successful options with unavailable diagnostics for pending
insertions/branches, without starting further calls. Client disconnects still
cancel normally. Failure before a usable baseline returns an error (422 for no
route/snapping, 503 for provider/timeout/busy); it cannot produce a meaningful
partial discovery. Unexpected programming/SQL errors are not swallowed.

Up to 20 branches and 24 insertion requests plus one baseline are allowed per
search, with explicit evaluation-limit diagnostics. Two discoveries may be active.
The adapter serializes provider calls at 1.1-second intervals, coalesces identical
work, caches at most 128 routes for five minutes, caps its queue at 32, limits each
transport to seven seconds/1 MB, and backs off for 60 seconds after HTTP 429.
There are no automatic retries. Cancellation can leave an already queued/shared
call finishing and caching; it does not enqueue the remaining detour evaluations.

## Data and atomic optional import

`database/sources/001_real_branches.json` records 12 retailer-listed Spinneys
locations: names, addresses, retailer IDs, published/original coordinates, source
URL, review date and uncertainty. The source is Spinneys' public branch finder.
Attempted Overpass queries failed/timed out; this does not imply absence of OSM
stores. No OSM IDs or businesses were invented. The source README records those
checks and the limited one-chain coverage. These points are not field-verified
entrances, current opening hours, stock or retail prices.

The optional `002_optional_real_locations.sql` uses existing supermarkets and
branches tables: supermarket 1001 and branch IDs 1005–1081. Demo IDs/names remain
separate; demo branches currently have null coordinates. It adds **zero prices**.
Missing observations produce Prices unavailable, never a zero-cost basket or
borrowed price from another branch. Existing eligible prices still use the
accepted verified-seed policy; real-price ingestion/trust is not implemented.

The fixture creates a temporary import procedure with one InnoDB transaction and
an EXIT handler that rolls back and rethrows any SQL error. Missing IDs are inserted;
existing IDs must match exact chain/name/address/six-decimal coordinates. Identical
repeats/subsets are safe. Conflicting IDs or unique names abort all fixture writes,
including earlier inserts. It uses no UPDATE/DELETE/IGNORE/REPLACE on owner data.
Routine cleanup follows success. A client that stops at failed CALL can leave the
routine, but no partial data transaction. Follow the source README to inspect the
conflict and remove that routine before retrying. Concurrent conflicting imports
can fail safely instead of being retried automatically.

**Manual application import remains the owner's decision.** Use a dedicated
session without an existing transaction and with CREATE ROUTINE/EXECUTE/ALTER
ROUTINE privileges. Routine DDL implicitly commits. Select the intended schema,
review JSON/SQL and source instructions; do not rerun migrations or demo seed 001.
The script is not an automatic migration and no app DB import was performed here.

## Architecture and cleanup audit

- Backend `modules/journeys/discover.ts` owns input validation, the simple corridor,
  complete-route insertions, stable ordering and accumulated diagnostics.
- `journeys/routing.ts` owns OSRM transport validation, provider attribution,
  throttling/cache/coalescing and bounds; `shared/geo.ts` owns geographic math.
- Authenticated no-store `POST /api/journeys/supermarkets` owns request concurrency,
  catalog retrieval and deadline. It needs no list ID and never accepts user prices.
- Existing `modules/locations` retains secure Google link import: HTTPS allowlist,
  public-address DNS checks/pinning, bounded redirects/headers/deadline and no HTML
  scraping. The mobile app never connects to MySQL.
- Mobile `/journey`, RouteDiscovery, journey/discovery/current-location services
  compose the independent workflow. Optional prices use the existing private API;
  Grocery prices retains the accepted optimizer separately.
- Loading labels now distinguish Importing from Finding your location. New URL/GPS
  actions, input changes, journey changes and blur clear stale UI errors. Read-only
  failures do not warn that a shopping-list write might have reached the server;
  the existing caution remains for actual mutations.
- Empty results distinguish local allowance filtering, completed limited searches,
  and incomplete routing coverage. Successful partial cards remain visible with
  a coverage warning. Retry remains explicit. No extra slider requests were added.

Removed during this stabilization: the route/grocery segmented-mode state,
conditional mode panels and hidden mounted route wrapper from list optimization;
unconditional T04 price loading for discovery; obsolete two-mode documentation and
run-once/manual-rollback fixture advice; one unused Badge import found by the audit.
Earlier T05-B removed the obsolete T05-A JourneySection/confirmation UI/state/helpers,
API flag and confirmation-only tests. Active import/GPS/auth/security regressions
remain. No retired T05-A confirmation implementation or duplicate discovery remains.
No dependencies were added or removed in stabilization: Expo Location and the
SDK-compatible community slider are still used. No spatial framework, ORM,
background tracking, geocoder, matrix layer or fuel optimizer was introduced.

## Verification and evidence

All database writes in automated checks use verified disposable schemas on the
loopback-only test server at port 3308. Tests refuse ordinary application port 3306
and verify @@datadir before DDL. Existing catalog SQL tests are SELECT-only. The
pre-existing disposable datadir is preserved; its server is stopped after testing.

| Check | Final result |
|---|---|
| Backend tests, including all DB groups | 160 passed; no failures/skips |
| Mobile regressions | 101 passed; no failures/skips |
| Private transport/MySQL/rendered Chrome integration | 11 passed; no failures/skips |
| Read-only mobile ? running API/MySQL checks | 6 passed; no failures/skips |
| Backend production/test TypeScript, build and unused-symbol audit | Passed |
| Mobile production/test TypeScript and unused-symbol audit | Passed |
| Expo iOS/Android/web export and separate browser web export | Passed |
| Live OSRM stabilization smoke | Passed; three route options |
| git diff --check | Passed |
| Expo dependency compatibility | Reports pre-existing core-package patch drift; location/slider accepted |
| Physical iPhone | Not performed; owner checklist below |

Commands: backend npm run typecheck, typecheck:tests, build; npx tsc --noEmit
--noUnusedLocals --noUnusedParameters; npm test with T03_TEST_PORT=3308,
T03_TEST_DATADIR set to the dedicated directory and RUN_CATALOG_DB_TESTS=1.
Mobile npm run typecheck, typecheck:tests, test, test:live; the same unused-symbol
audit; test:private-live with the disposable variables and RUN_T03_BROWSER_TESTS=1;
npx expo export --platform all; npx expo export --platform web --output-dir dist/web;
and npx expo install --check. Tests normalize TEMP to the datadir's full path.
The live OSRM probe directly invoked the actual adapter/discovery with source JSON
in memory and wrote its evidence file; it made no SQL request.

The compatibility report recommends Expo ~58.0.26, constants ~58.0.16, font
~58.0.12, linking ~58.0.17, router ~58.0.32, secure-store ~58.0.3 and status-bar
~58.0.5. This pre-existing patch drift remains; it was not silently upgraded.
Successful JS/Hermes exports do not prove native device behavior.

The tests cover mixed failure orders, unavailable routes, usable partial options,
inconsistent estimates, deadlines before/within candidate work, pending branches,
client cancellation and baseline failure. SQL tests cover successful import,
identical repeat/subset completion, occupied chain ID, same chain name at another
ID, late branch-ID conflict, unique branch-name conflict and changed coordinates.
After failed CALL, an explicit COMMIT still cannot leave partial data; demo records
and prices remain unchanged.

Rendered Chrome uses actual session/import/API/SQL and an injected deterministic
routing fixture. It checks Home discovery before any list exists and no T04 call;
optional prices without road reload; slider 0/8/9/30 without extra HTTP calls;
8:40 threshold exclusion; preserved navigation coordinates; invalid/partial
imports; GPS emulation; routing outage/retry; usable partial and empty incomplete
responses; 320/390/430 widths; and existing list/grocery regressions. Browser GPS
and navigation are emulated/intercepted, not physical iPhone evidence.

Live network evidence is separate: the four earlier illustrative route checks are
in `t05b-live-routing.json`. A fresh stabilization smoke check is recorded in
`t05b-stabilization-live-routing.json`: Jounieh-area → Jbeil baseline 17,965.5 m /
1,010.8 s; Jbeil +23.6 s, Sahel Alma +49.1 s, Zouk +306.8 s; evaluation complete.
These used the reviewed location fixture in memory, not the owner's database.
Live success proves these calls worked then, not provider availability or all roads.

## Physical-iPhone acceptance checklist

1. Install mobile dependencies with npm ci; run Express and Expo Go on the same LAN.
   Confirm EXPO_PUBLIC_API_URL points to the computer's reachable API, never
   its loopback address. Keep MySQL private. No schema migration is required.
2. With a newly authenticated account and no lists, find Supermarkets Along My
   Route on Home. Confirm it opens without requiring list/product creation.
3. If the owner separately elects to import reviewed real locations, use the manual
   fixture instructions above. Without coordinate-bearing branches, expect an
   honest limited/empty search, not fabricated stores or demo prices.
4. Copy an actual Jounieh → Jbeil driving Share link from Google Maps. Import it;
   verify endpoints/stops/mode and successful transition to road results. Test
   the owner's short link, expanded link, a place link, name-only partial import,
   invalid URL and unsupported/non-driving link. No missing stop may be discarded.
5. Grant/deny foreground location, disable location services, and retry. Check the
   Finding your location label, timeout/error clarity, keyboard/safe areas, and
   that old URL/Maps errors do not mask the next action's result.
6. Drag the slider continuously at 0/8/9/30. Check touch smoothness, VoiceOver range
   announcements, no duplicate network activity and clear empty-state wording.
   Rotate/use larger text; inspect summary, result and import screens for overflow.
7. Test a slow/unavailable road provider and retry. A baseline outage should show
   a routing error; later failures/deadlines should retain evaluated cards and
   disclose incomplete coverage. Do not interpret incomplete zero results as proof
   that no supermarkets exist. Controlled backend tests establish this distinction;
   a physical network interruption may instead disconnect the whole HTTP request.
8. Optionally select an existing nonempty saved list. Verify correct list identity,
   missing/partial prices and unchanged geographical results/slider. Empty/deleted
   list errors must not block discovery. Disable price comparison and search again.
9. Navigate through a selected branch in the actual Google Maps app. Verify original
   destination, origin, stop order, inserted store and return-to-start behavior.
   Check longer imported journeys in the Maps app (browser waypoint limits differ).
10. Return to Home and reopen discovery: transient journey state should reset.
    Sign out/change account and ensure private prices/results do not leak. Separately
    test Find Cheapest Basket, maximum 1/2/3 branches and saved quantity refresh.

## Remaining limitations and independent critical assessment

The two confirmed defects are corrected and independently exercised by regressions;
that does not establish production readiness or physical-device acceptance.

Coverage is a small retailer-listed sample, and the untouched application database
may still have no routable branches. Real-price ingestion, entrance verification,
opening hours and comprehensive geographical coverage are absent. No cheapest-real-
store claim is justified by the current demo price dataset.

A fixed 3 km corridor and nearest-first work cap can omit useful options. Serial
public routing is intentionally conservative and can be slow; partial results are
honest, not exhaustive. Public OSRM has no application SLA. Cached estimates can
be up to five minutes old and evaluatedAt denotes the discovery run, not each
underlying cache entry's acquisition time. A shared/queued provider call can
outlive a cancelled caller. These are residual tradeoffs worth reassessing before
larger traffic; no production queue/provider failover is claimed.

The fixture's temporary procedure is more machinery than plain INSERTs, and needs
routine privileges/manual routine cleanup on clients that stop on error. That cost
provides explicit rollback semantics without a new migration framework or owner
record updates. Future general imports need proper provenance/identity reconciliation;
reserved fixture IDs alone are not a long-term import design.

Optional prices reuse T04 maxStores=1 to obtain validated branch comparisons. This
still computes its single-store result, more than a dedicated pricing snapshot
would need, but avoids another near-duplicate API during this increment. List
selection remains an explicit user choice and geography is independent.

Google URL formats and clients evolve; names alone cannot be geocoded, some links
remain unsupported, and browser waypoint limits differ. GPS is foreground-only;
the underlying native fix cannot itself be cancelled, though late results are
ignored. Native permission, VoiceOver, touch and app-handoff behavior remain
unverified until the physical-iPhone checklist is completed.

T05-C still needs approved fuel consumption and fuel-price inputs; exact USD/LBP
fuel-cost arithmetic and monetary provenance; base versus added journey costs;
complete-route driving for whole candidate branch sets from T04; and ranking by
complete grocery plus travel cost within one total detour budget. It must consider
more expensive merchandise candidates that become cheaper after travel, never sum
independent store detours, never treat missing prices as zero, and retain original
stops and whole-package quantities. No fuel cost or combined optimizer was added.
