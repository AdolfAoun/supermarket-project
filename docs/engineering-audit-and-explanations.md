# Engineering audit and implementation explanations

Audit date: 2026-11-22. This is evidence from this audit, separate from historical
milestone acceptance. No milestone is newly marked owner-accepted.

Sections A–K preserve the completed audit's historical state/results. The later
owner-confirmed T05-C implementation is recorded in [T05-C verification](t05c-verification.md);
the fuel explanation below now describes that current implementation.

## A. Initial project state

Branch `main`; `git status --short` was empty before work. No pre-existing
uncommitted changes needed preservation. Both packages and their dependencies
were already installed. The repository is an Expo/React Native/TypeScript mobile
client and Express modular monolith using MySQL through mysql2/promise.

Implemented: public catalog/detail/branch comparisons, registration/login/opaque
sessions, private list CRUD, exact single-store basket comparison, merchandise
optimization across at most 1–3 branches, Google Maps journey import, foreground
GPS, OSRM route discovery, optional saved-list prices, and offline OSM preparation
and approval-gated import tooling. Price eligibility is still demonstration seed
data. The checked-in catalog fixture has 36 products, 12 aliases, four fictional
branches and 125 observations; this audit does not assert those are the owner's
current database contents. Fictional branches have no invented coordinates.

Fuel integration, combined grocery/travel ranking, receipt capture/OCR/validation,
favorites, alerts, contributions and the NLP assistant remain unimplemented.
The receipts tab is explicitly a placeholder. T05-B/B2 acceptance is pending.

Inspection covered the requirements and architecture/decision/boundary documents,
README/setup/history, all three migrations, catalog/auth/list/basket modules,
route/import modules, mobile screens and request/session/state controllers, and
their tests. Implementation takes precedence over old milestone prose when
describing what actually runs; original requirements were not edited.

## B. Confirmed issues

1. **Importer stale insertion approval:** the importer checked newly appearing
   duplicate candidate IDs, but an existing candidate could change coordinates,
   name or address without invalidating an insertion decision acknowledging it as
   distinct. Reproduced by changing a reviewed neighbor's coordinates to the source
   location after preview. The new test failed with “Missing expected rejection”.
2. **Pasted search whitespace:** SQL removed ASCII spaces/hyphens but left internal
   tabs, newlines and nonbreaking spaces. A pasted `COKE\n1.5 L` did not behave like
   `COKE 1.5 L`; whitespace-only API searches could fail to browse. A binding
   regression failed before the correction, and real SQL now verifies the result.
3. **Unexpected empty mobile response:** HTTP 204 contract validation ran outside
   the invalid-response handler. A health request receiving 204 was reported as a
   network outage even though the server responded. Reproduced with injected fetch.
4. **Documentation drift:** README still said multi-store optimization was deferred.
   API prose implied accent-insensitive substring matching. Actual MySQL fixture
   and catalog queries return no matches for `cóca` against `Coca-Cola`. Catalog
   collation alone does not establish that substring behavior.

## C. Improvements implemented

Functional corrections are deliberately small:

- Compare current duplicate-candidate hashes with their approved-preview hashes
  before inserting. Edited candidates require a fresh preview/approval; original
  owner rows remain untouched. Identical completed imports remain idempotent.
- Collapse JavaScript whitespace to ordinary spaces and trim search input before
  parameter binding. The original 255-character API limit is still enforced
  before normalization. Punctuation, package sizes, IDs and stored aliases remain.
- Validate an undefined 204 body through the same contract-error handler as other
  successful bodies. Expected logout/delete 204 responses remain supported.
- Correct README/API/import documentation. No cosmetic refactor, dependency,
  migration, schema/index change, stack change or public response-shape change.

## D. Tests added and existing coverage exercised

New named tests cover search parameter normalization, stale reviewed-candidate
approval with atomic no-change assertions and subsequent fresh approval, unexpected
204 classification and expected 204 success, and an independent mixed-currency
optimizer oracle. The latter checks 12 deterministic matrices at each maximum of
1, 2 and 3 stores, with quantities 1, 2 and 999. It enumerates product assignments
and uses integer fixture hundredths without production conversion/candidate code.

Existing SQL catalog coverage now also checks pasted whitespace, numeric package
search, accents and unmatched CJK/emoji/zero-width/punctuation inputs. Existing
tests cover SQL injection literals, long/repeated parameters, package separation,
latest timestamp/ID selection, ineligible statuses/sources, exact ties, missing
coverage, stale/future prices, currency limits/rounding and invalid inputs.

The existing suites also exercise list ownership across all mutations, duplicate
adds, concurrent increments/caps/deletion/replacement, session expiry/revocation,
snapshot locking, response races, ignored cancellation, blur/account transitions,
quantity-control state stability, routing failures/deadlines/metric validation,
OSM duplicate classifications, import repeat/rollback and unchanged catalog prices.

## E. Verification results

| Check | Result in this audit |
|---|---|
| Initial backend `npm test`, DB opt-ins absent | 119 passed, 0 failed, 5 skipped; 124 total |
| Initial mobile `npm test` | 101 passed, 0 failed, 0 skipped |
| Final backend `npm test`, all DB groups enabled | **183 passed, 0 failed, 0 skipped** |
| Final mobile `npm test` | **102 passed, 0 failed, 0 skipped** |
| Mobile `npm run test:private-live`, browser opt-in enabled | **11 passed, 0 failed, 0 skipped** |
| Standalone `database/tests/catalog.test.cjs`, disposable schema | **12 checks passed**, fixture rows/tables cleaned |
| Both packages: `npm run typecheck`, `npm run typecheck:tests` | Passed |
| Both packages: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | Passed |
| Backend `npm run build` | Passed |
| Mobile `npx expo export --platform all` | Passed: iOS, Android and web bundles |
| Mobile `npx expo export --platform web --output-dir dist/web` | Passed; used by rendered Chrome checks |
| Mobile `npx expo install --check` | **Failed, exit 1:** existing Expo patch drift listed below |
| `git diff --check` | Passed; Git may print Windows CRLF conversion notices |
| Dedicated lint/formatter | Not configured in package scripts; not executed |
| Physical iPhone/native interaction | Not executed; owner testing required |
| Fresh external OSM/OSRM requests | Not executed; deterministic fixtures used |

Initial sandbox execution returned `spawn EPERM` before tests could run; authorized
worker execution succeeded. Intentional regression reproductions failed before
their fixes. One full database attempt failed because Windows PowerShell removed
an empty DB_PASSWORD override and dotenv supplied a different credential. A
nonempty disposable-only credential corrected the test setup. The first new
accent-search expectation also failed; direct SQL confirmed literal accent
behavior, so documentation and the test expectation were corrected. Final runs
above supersede those attempts; no unresolved automated test failure is hidden.

Expo reports installed → expected: expo 58.0.23 → ~58.0.26; constants 58.0.15 →
~58.0.16; font 58.0.11 → ~58.0.12; linking 58.0.16 → ~58.0.17; router 58.0.30 →
~58.0.32; secure-store 58.0.2 → ~58.0.3; status-bar 58.0.4 → ~58.0.5. This matches
pre-existing T05-B2 notes. Successful bundling does not clear that compatibility
finding or establish native device acceptance. No package/lockfile was changed.

Database isolation: started the existing `%TEMP%/supermarket-t03a-mysql` server
with `--no-defaults --bind-address=127.0.0.1 --port=3308 --mysqlx=OFF --skip-log-bin`.
Every destructive fixture group verifies `@@datadir` and refuses port 3306.
Catalog SELECT tests were redirected to `audit_catalog_fixture` on 3308 with a
temporary SELECT-only account, rather than using the owner's configured database.
Standalone schema checks were also directed there after datadir verification.
Fixture migrations/seeds/imports ran only on this disposable instance. Schemas
and the temporary account were removed, and the test server was shut down;
the existing disposable datadir was preserved. No WAMP service was reconfigured.

Reproduction settings for backend DB tests: `T03_TEST_PORT=3308`,
`T03_TEST_DATADIR=%TEMP%/supermarket-t03a-mysql`, `RUN_CATALOG_DB_TESTS=1`, plus
DB_HOST/PORT/NAME/USER/PASSWORD pointing to a separately prepared disposable
catalog schema/account. For private mobile journeys use the two T03 variables
and `RUN_T03_BROWSER_TESTS=1`. Never point write fixtures at the owner's schema.

Cross-feature journeys: catalog/detail/prices use actual SQL and HTTP; registration,
list edits/persistence, ownership, missing coverage and optimizer refresh use real
mobile services → Express → disposable SQL. Chrome renders the private flows and
route controls with injected routing/GPS/navigation behavior. Import simulation
runs actual import transactions, repeats, late failures and price-preservation
checks in disposable schemas. This is not a live store-coverage or iPhone claim.

## F. Performance observations

Basket snapshot loading uses four SELECTs on a consistent snapshot, not a query
per product/branch. Optimization precomputes exact line costs and enumerates
bounded branch sets. Existing synthetic tests measure 10/5, 30/10, 50/20 and
100/50 product/branch inputs at maxima 2/3. An audit run measured about 32 ms and
319 ms for 100 products/50 branches at 2/3 stores; these are local synthetic
measurements, not latency guarantees. Its 10,000,000 work budget returns 422
instead of silently dropping useful candidates.

Discovery has a conservative envelope, exact 3 km corridor, at most 20 candidate
branches/24 insertion evaluations, serialized provider calls and bounded cache.
The national-scale synthetic test remains successful. Full catalog loading and
exclusion payloads still grow with branch count. LOCATE substring search cannot
be made scalable merely by adding an ordinary name index. No speculative index,
algorithm rewrite or performance change was justified in this audit.

## G. T05-B2 importer readiness

**Technically ready for owner review, not approved for a real import.** The new
stale-candidate check closes one safety gap; repeat/rollback/no-price-write tests
pass. The checked-in snapshot reproducibility test confirms 521 retrieved, 462
valid, 30 technically auto-validated, 432 requiring review and 59 rejected; 40
priority-chain name matches and 422 other named businesses. Those counts describe
files/fixture previews, never current owner database contents.

Technical validation is not owner approval or proof of business identity. Names,
chain hints, incomplete addresses, nearby records, coarse country boundaries,
polygon interior points versus vehicle entrances and open/closed status require
human review. The proposed pilot must not be applied automatically. Fresh preview,
per-record decisions and explicit approval digests remain mandatory. Migration 003
is separately optional and unapplied to the real database by this audit.
**No real import was performed.**

## H. Remaining concerns, ordered by priority

- **Critical:** none confirmed within the inspected/tested scope; this is not a
  guarantee that every possible defect is absent.
- **High:** prices are demonstration observations, not real verified coverage.
  Real-source validation/freshness and receipt workflows remain future work.
  Route/location accuracy and physical iPhone acceptance remain unverified here.
- **Medium:** Expo compatibility check fails on known patch drift. Fuel/combined
  cost ranking and several formal requirements remain unimplemented, not waived.
  Login/registration do not have application rate limiting; costly scrypt work
  needs bounded abuse protection before public deployment. Current HTTP LAN
  development transport needs HTTPS before public deployment. No auth redesign
  or deployment was introduced during this local audit.
- **Low:** substring accent folding, spelling correction and transliteration are
  not implemented; curated aliases cover only known variants. Catalog pagination
  is absent and capped results are disclosed. Ordinary comparison does not derive
  freshness, whereas optimization labels 30-day age and future dates. Existing
  policies are explicit and unchanged. Very large catalogs need measured query/
  payload work before index/schema changes.

Tracked-file and source-pattern checks found only expected tracked `.env.example`
files and no private-key/token signature in inspected application sources.
Documentation contains clearly labeled test passwords. Actual environment values
were not printed or changed. This was a scoped source scan, not a full Git-history
or dependency vulnerability audit. SQL is parameterized; bodies are limited to
16 KB; malformed JSON/IDs and internal errors use sanitized envelopes. Session
tokens are hashed server-side and not included in application logs.

## I. Next three practical tasks (not implemented)

1. Align the existing Expo patches with the compatibility checker, rerun exports/
   tests, and complete the T05-B physical-iPhone acceptance checklist.
2. Review a small T05-B2 location batch, validate entrances/identities and reconcile
   duplicate candidates before separately authorizing migration/import.
3. Scope T05-C vehicle/fuel inputs and additional-travel cost math with independently
   calculated acceptance cases, preserving exact merchandise totals and honest
   missing-price coverage. Do not present merchandise optimum as overall optimum.

## J. Owner actions required

No migration or import is required for these audit fixes. Restart the backend
and reload/restart Expo to exercise changed code; no cache clear or environment
edit is required. Test on the physical iPhone: pasted searches, login persistence,
quantity controls/keyboard, rapid navigation/account changes, route retry/GPS
and navigation handoff. Review the known dependency drift and future-source trust
policies. A real location import remains a separate approval with migration 003
only if needed; none of those owner actions is claimed complete.

## K. Git and changed-file inventory

`main`; no commits, pushes, branch changes or history edits. Initial worktree clean.
Changed: backend catalog repository, location importer, catalog unit/SQL tests,
importer SQL tests, optimizer tests; mobile HTTP client and API tests; README,
API/database/import documentation. New: this document. No unrelated changes were
discarded. Generated exports and audit logs remain ignored local artifacts.
Architecture, requirement wording, exchange rate and roadmap acceptance unchanged.

## Implementation explanations for academic discussion

### 1. Backend communication with MySQL

**Inputs:** server-only environment configuration and validated route inputs.
`config/database.ts` creates a lazy mysql2 pool with five connections, bounded
queue/connect timeout, strict SQL mode and UTC configured before each checkout.
Repositories use bound placeholders with `execute`; multi-step operations borrow
one connection, begin a transaction, commit/rollback, then release it.
**Outputs:** explicit DTOs; Express sends JSON, never connection details. The
mobile app only talks HTTP to Express. Database failures produce safe responses.
**Edges:** missing configuration, unavailable server, invalid relationships,
transaction failure and lock conflicts. This keeps SQL readable and deployment
simple without an ORM or extra services, appropriate for explaining a capstone.

### 2. Authentication

**Inputs:** trimmed/lowercased ASCII email, display name and an untrimmed password
of 8–128 characters, at most 512 UTF-8 bytes. Registration stores a salted scrypt
hash (N=131072, r=8, p=1) and requires an explicit later login. Login performs the
same derivation for unknown emails via a dummy hash and constant-time comparison.
It issues a random 32-byte token, stores only SHA-256(token), and uses the DB clock
for seven-day expiry. Protected routes derive user identity from the token.
**Outputs:** safe profile/token at login; logout deletes that session hash.
Native mobile storage saves only the token in SecureStore; web uses memory.
**Edges:** invalid/expired/revoked tokens, duplicate email, failed storage,
network restoration failure and old 401 responses after account changes.
Session generation checks reject stale continuations. Opaque sessions and a few
clear tables avoid the complexity of a new authentication architecture.

### 3. Product price selection

**Inputs:** canonical product IDs and append-only branch observations. SQL filters
eligible observations before applying ROW_NUMBER per product/branch, ordered by
observed_at descending then observation ID descending. T02 product comparison
accepts verified USD seed observations; T03/T04 baskets accept verified seed USD
or LBP. A newer pending, flagged, rejected or other-source observation does not
replace an eligible one. **Outputs:** one latest eligible observation per branch,
decimal-string amounts and UTC timestamps, with explicit demonstration labels.
**Edges:** no prices, timestamp ties, historical/old/future observations and missing
coverage. T02/T03 freshness is explicitly not evaluated; T04 labels recent/older/
future without excluding old observations. SQL windows make the selection rule
short and auditable; exact BigInt conversion avoids floating-point rankings.

### 4. Shopping list quantities

**Inputs:** authenticated owner, list/item/product IDs and integer packages 1–999.
POST adds quantity and combines a repeated product; PATCH replaces quantity.
Each operation locks the owned parent list FOR UPDATE before reading/changing
items. The unique list/product key and locked cap check prevent duplicate rows
and lost increments. Inactive products remain visible/editable/removable but
cannot be newly added. **Outputs:** backend-confirmed items and list timestamps.
**Edges:** two users, missing records, concurrent requests, quantity overflow and
unknown write outcomes after timeout. Mobile suppresses same-row duplicate taps,
merges confirmed rows into current state and invalidates older reads. Busy buttons
retain normal colors; permanent constraints retain disabled styling. No optimistic
quantity arithmetic or automatic write retry is used. Parent locking is a simple,
explainable correctness choice for capstone-sized lists.

### 5. Basket comparison

**Inputs:** owned list/items, branches and latest eligible price matrix, read with
REPEATABLE READ and a parent FOR SHARE lock. Four SELECTs materialize a coherent
snapshot before calculation. For each branch, every required product must have a
price. **Outputs:** complete branches with exact totals/dense ranks/all cheapest
ties; incomplete branches carry missing product IDs without ranked subtotals.
An inactive required product blocks this comparison rather than shrinking it.
**Edges:** empty list (400), no complete store, unequal quantities, mixed currencies
and totals whose displayed cents tie but exact units differ. Fixed conversion is
90,000 LBP = 1 USD. Integer common units are 1/9,000,000 USD: USD hundredths multiply
by 90,000; LBP hundredths already are units. Round half up only when displaying.
This permits exact, easy-to-test totals without a monetary dependency.

### 6. Shopping optimization

**Inputs:** the same snapshot, maximum 1/2/3 branches, evaluation clock and freshness
policy. T04 explicitly reports inactive exclusions and optimizes active items;
this differs from T03 basket blocking and is disclosed in the UI. Generate branch
sets up to the maximum, assign each entire product quantity to its cheapest
eligible branch in each set and sum exact line costs. **Outputs:** cheapest
merchandise allocation, complete singles and savings against the cheapest complete
single, or no solution. Ties prefer fewer used branches, then lower branch IDs;
equal product costs choose the lower-ID prepared branch. **Edges:** disjoint
coverage, missing products, no single baseline, exact ties, invalid persisted
identities and excessive work (422). Fuel is explicitly excluded. Bounded
enumeration is straightforward; independent assignment oracles verify optimality
without replacing it with an opaque optimization library.

### 7. Fuel costs and route estimates

**Current T05-C implementation:** the optional fuel mode accepts consumption in
L/100 km and a manually supplied USD/LBP price per liter. Different endpoints charge
max(0, shopping route meters minus original baseline meters); identical endpoints
charge full shopping route meters. Liters = charged meters / 1000 × consumption / 100;
fuel cost = liters × per-liter price. Add that to exact groceries once. BigInt
fractions preserve precision and the fixed 90,000 exchange rate; round only display.
For 20 km charged distance, 10 L/100 km and USD 1/L, fuel is 2 L / USD 2.
The existing grocery-only endpoint still returns fuelCostsIncluded=false; the new
POST ranks complete evaluated route plans by groceries plus fuel. Three corridor
candidates and 24 shopping-route checks bound work, with explicit limitations and
no global-optimum claim. Zero price is an explicit assumption; missing distances
never mean free fuel. Native fuel preferences use existing SecureStore, web uses
memory; journeys are not saved. See the linked T05-C report for tests and examples.

The implemented location system takes journey coordinates/stops and a detour
limit, retrieves an OSRM driving baseline, filters catalog locations using the
3 km corridor and evaluates each supermarket insertion while preserving original
stop order. **Outputs:** estimated meters/seconds, signed distance changes,
nonnegative extra time, exclusions/completeness and a Google Maps handoff.
**Edges:** missing/invalid coordinates, 0,0 being geographically valid but not
evidence of a Lebanese store, duplicate same-chain locations, no route, snapping,
timeouts, service errors and partial evaluation. Straight-line geography is only
a prefilter, never a fabricated road estimate. The separate modules and explicit
budgets are understandable; navigation may choose a different route and is not
claimed exact. No provider or paid service was introduced.

### 8. Supermarket import validation

**Inputs:** bounded OSM/HOT source document, geographic boundary, catalog snapshot,
retailer fixture, approved preview and explicit record decisions. Fetch is offline
operator work. Normalization retains names/provenance, applies curated chain hints,
validates coordinates/geometry/identifiers, and classifies rejected/review/technical
candidates. Polygon representative points stay inside geometry but are not claimed
entrances. Proximity and name matches cause review; stores are not silently merged.

Preview writes no catalog records. Apply validates dataset/preview/approval digests
and exact target database, requires the separately approved source-ledger migration,
locks the catalog in a SERIALIZABLE transaction and rechecks duplicates/hashes.
Only listed decisions may insert/link; review cases need notes and duplicate
acknowledgements. **Outputs:** inserted/link/already-present counts and provenance;
existing branch details/prices are not updated. Any failure rolls back the entire
transaction. **Edges:** repeated source identity, changed mapped data, stale preview,
same/nearby locations, incomplete owner coordinates, false chain hints and late
unique-key failures. Explicit decisions plus a small source ledger make safety
and repeatability explainable without introducing a separate ingestion service.
