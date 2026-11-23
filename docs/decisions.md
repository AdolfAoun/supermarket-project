# Architecture decision log

**Key:** CONFIRMED = explicitly selected by owner; RECOMMENDED = suggested but not separately approved; OPEN = deferred/needs validation. Entries are planning decisions, not implementation claims.

| ID | Status | Decision | Why / caveat |
|---|---|---|---|
| D01 | CONFIRMED | Build a mobile app with React Native + Expo + TypeScript | Cross-platform; prior React Native familiarity |
| D02 | CONFIRMED | Backend in Node.js + Express + TypeScript | Matches experience; clean business-logic boundary |
| D03 | CONFIRMED | MySQL via WAMP locally | Familiar SQL workflow; WAMP is development environment, not production hosting |
| D04 | CONFIRMED; refined by T05-B task | Google Maps links for import/basic navigation; OSRM road-route discovery in T05-B | No Google billing/credentials; fuel/basket integration remains T05-C |
| D05 | CONFIRMED | Store receipt images locally first, migrate to cloud if needed | Keep storage swappable and private |
| D06 | CONFIRMED | ChatGPT handles planning, Codex implementation, Claude optional independent review | Shared docs and review checkpoints |
| D07 | CONFIRMED | Prefer achievable, minimal solutions; flag hard requirements and propose scope alternatives | Do not silently change formal URs |
| D08 | CONFIRMED | Controlled product catalog; simple normalization/aliases; unknown OCR matches require user selection | Avoid unnecessary ML/fuzzy matcher |
| D09 | RECOMMENDED | Five bottom tabs: Home, Explore, Shopping List, Receipts, Profile | Subject to UX review; global assistant later |
| D10 | RECOMMENDED | Modular-monolith Express API and three-tier separation | Simpler than microservices |
| D11 | CONFIRMED | Email/password with scrypt and hashed opaque bearer sessions; seven-day expiry | T03-A task selects opaque sessions; built-in scrypt avoids a new dependency; supersedes provisional Argon2id/JWT ideas |
| D12 | RECOMMENDED | Free OCR using Google ML Kit, with Tesseract fallback | Test Expo native integration and real receipt accuracy; no per-call fee |
| D13 | OPEN | AI assistant model/provider | Postpone; OpenAI API may cost money |
| D14 | SUPERSEDED BY T04 TASK | T04 uses maximum 1, 2 (default), or 3 branches, preferring fewer visits at equal cost | New owner assignment explicitly expands the earlier two-stop-only scope; no forced exactly-two mode |
| D15 | RECOMMENDED | Historical, branch-specific, source-linked price observations | Supports validation/traceability |
| D16 | CONFIRMED | T02 catalog/price/supermarket browsing remains public; lists require authentication | Explicit T03-A task; no guest list persistence |
| D17 | CONFIRMED | T03-B uses fixed 1 USD = 90,000 LBP, exact BigInt common units and preserved original amounts/currencies | Owner-approved fixed policy, not live data; display rounds half up to cents, ranking/ties use unrounded units |
| D18 | PARTLY IMPLEMENTED | T04 derives caution after configurable 30 days without excluding older prices; verified seed eligibility stays unchanged | Real-source trust, promotion policy and future production freshness rules remain open |
| D19 | OPEN | Receipt storage retention/privacy/redaction, image quality/duplicate handling | Needed for receipts to meet UR-08 |
| D20 | OPEN | Advisor-approved scope simplifications and current spec wording | Formal URs remain authoritative until amended |

### 2026-11-21 ? Owner-requested T05-B stabilization

The owner explicitly authorizes independent journey discovery without shopping
lists. Home opens a standalone authenticated journey screen reusing RouteDiscovery;
grocery optimization remains separate. Saved-list selection explicitly requests
T04 maxStores=1 for optional branch pricing, avoiding default T04 work or another
pricing endpoint. Optional pricing changes do not restart routing.

Accumulate distinct insertion failures. Completed NoRoute/snapping outcomes differ
from unavailable/inconsistent/skipped work. After a usable baseline, the server
routing deadline preserves options and marks unfinished coverage incomplete;
client disconnects still cancel. Preserve existing request budgets and throttling.

The optional fixture uses an import-only routine with transactional rollback and
resignal, exact record checks, insert-only writes and safe identical repeats.
Routine privileges and manual cleanup after an import client stops on failure are
accepted implementation tradeoffs for atomicity; no migration framework or owner
record updates are introduced. Only verified disposable schemas were written.
No fuel optimizer, application fixture import, commit or push is authorized here.
Acceptance remains pending physical-iPhone testing. These changes support the
existing journey/price requirements without changing formal requirement scope.
See [stabilization and verification](t05b-verification.md).

### 2026-11-22 - T05-B2 controlled OSM data expansion

The owner authorizes an offline fetch/normalize/validate/preview/import workflow,
not application database writes. Use bounded Overpass requests and the official
HOT/HDX OSM GeoJSON extract fallback; retain ODbL/source notices. Actual small GET
and POST failures are recorded without claiming a proven overload cause.

Use conservative review signals for names, proximity, polygon entrances, source
identity and the prepared retailer fixture; never auto-merge uncertain stores.
One optional additive OSM source ledger is justified by durable identity and safe
repeat/change detection. Existing supermarket/branch entities and APIs are reused.
A serializable insert-only transaction applies only explicit digest-bound approved
records or source links, preserving demo records and all prices. No migration or
import has been applied to the application DB; both need owner approval.
A conservative geographic envelope reduces exact corridor work without raising
OSRM budgets. UI changes are limited to missing-price wording and OSM credits.
No new dependency, paid API, fuel optimizer or unrelated redesign. Owner/device
acceptance and application import remain pending. See t05b2-data-import.md.

## New decisions protocol

### 2026-11-22 — Owner-confirmed T05-C incremental fuel model

Preserve the approved planned origin → ordered existing stops → destination model.
For different endpoints, fuel uses max(0, shopping route distance minus original
baseline route distance). Identical endpoints use full shopping route distance,
without assuming home or adding a separate round-trip mode. The owner explicitly
authorizes bounded multi-store fuel evaluation in this T05-C assignment; T05-D
remains final polish. Grocery-only calculations remain independently available.

Use manually entered decimal-string L/100 km and USD/LBP per-liter price, fixed
90,000 conversion, exact BigInt fractions and display-only rounding. Consumption
is above 0 through 100; nonnegative price allows an explicit free-fuel assumption.
No live price API or claimed current fuel price. Reuse existing native SecureStore
for device preferences and web memory, rather than adding tables/dependencies.

Reuse T04 allocations and OSRM, with up to three nearest price-bearing 3 km corridor
candidates and 24 shopping-route evaluations. Enumerate visit permutations and
insertions preserving original stop order. This bounded strategy protects existing
provider budgets and is labeled best among evaluated plans; omitted/failing work
is disclosed, never called a global optimum. Exact total ties retain fewer visits
then lower branch IDs. The alternative of exhaustive national routing would exceed
the existing public-service budget. No real DB changes/imports or Git writes are
authorized by this task. Scope supports portions of UR-18/19/22/24/25/28 without
waiving remaining source, coverage or acceptance requirements. See t05c-verification.md.

### 2026-11-21 — Approved T05-B refinement

The owner explicitly authorizes refactoring uncommitted T05-A, removes mandatory
confirmation from the journey workflow, and moves basic Google Maps handoff into
T05-B. Preserve secure imports, all supported URL formats, foreground GPS,
authentication, owned snapshots and exact T04 grocery calculations. The older
T05-A workflow entry below is historical, superseded by this approved direction.

Use the public FOSSGIS OSRM car endpoint for a low-volume capstone demo, configured
by OSRM_BASE_URL. Verify live Lebanese route/geometry responses and table support
first. Implement only complete route requests here; a matrix abstraction is not
needed. Serial calls at least one second apart, bounded cache/queue, deadlines,
no automatic retry and visible attribution respect the provider policy. There is
no traffic claim, Google route reproduction claim or paid API dependency.

Prefilter branches against the entire OSRM polyline with a 3 km spherical corridor,
then test complete driving journeys through each supermarket. Preserve original
stop order and test each insertion. Maximum 24 insertion evaluations/20 branches
protects the public service; explicitly disclose skipped branches rather than
claim exhaustive discovery. Threshold comparisons use unrounded seconds. Time
deltas below -1 second are inconsistent/excluded; smaller negatives round to zero
with raw evidence retained. A shorter/slower road alternative may have a negative
distance change, shown honestly rather than inventing extra distance.

Overpass investigation encountered availability failures. A reviewed 12-branch
fixture uses actual points from the retailer's public branch finder instead,
with source IDs/date, uncertainty and null OSM IDs. This uses existing tables in
an optional manual seed, with no prices or automatic application writes. Future
data/price ingestion remains separate. Retire the confirmation flag/reducer/UI
and their behavior-only tests; retain parser, resolver and GPS/security regressions.
Slider 5.2.1 is included in Expo Go SDK 58; no new backend dependency/framework.

This implements portions of UR-19/20/22/26/28 and navigation, without claiming
fuel, combined overall-cost ranking, complete live inventory or natural-language
journeys. Equal endpoint shopping journeys are labeled full return trips. T05-C
owns fuel/basket integration; T05-D owns final multi-store evaluation/polish.
Owner/device acceptance remains pending. No commit/push is authorized here.

### 2026-11-21 — T05-A owner-assigned journey import and location selection

Historical: its confirmation-oriented workflow and phase sequencing are superseded
by the approved T05-B entry above. Import/GPS technical foundations remain in use.

The owner explicitly narrows T05-A to Google Maps URL import, foreground device
location and user confirmation. The selected pipeline is Google Maps → app →
OSRM → optimizer → Google Maps navigation. Only the first import/location boundary
is implemented here. The earlier manual-coordinate/round-trip T05 proposal is
superseded; no manual coordinate input is required and no routing/fuel code is added.

Use URL-contained data and normal permitted redirects only. Support documented
coordinate query forms, explicit coordinate directions paths, the supplied exact
expanded data layout, bounded place-pin formats and the observed legacy tagged
geocode encoding. Unknown names/place IDs do not imply coordinates. Internal URL
encodings are provisional, can change and must fail partial/unsupported rather
than scrape Google pages or call undocumented APIs. The supplied short link was
resolved live on 2026-11-21; this is evidence for that link, not universal support.

Use the SDK 58 Expo Location package for one foreground fix on explicit user tap.
No background permission/tracking, persisted precise locations, native share
extension, new schema or catalog data changes. Confirm complete driving journeys
locally and invalidate confirmation on changes. Auth/session and T04 arithmetic
remain untouched. This supports portions of UR-20/21/28 without claiming full
route or vehicle requirements. Manual prices/fuel, detours, OSRM, combined costs
and navigation remain T05-B/C/D. Owner/device acceptance is pending; no task is
marked complete or committed/pushed by this implementation.

### 2026-11-15 — T04 merchandise optimization

The owner's new T04 assignment supersedes D14's two-stop-only boundary: expose
maximum 1–3 physical branches, default 2; a maximum never forces that many visits.
It also explicitly excludes inactive items from optimization, naming the excluded
packages without modifying the saved list. The accepted T03 comparison endpoint
continues to block inactive products, preserving its contract. No formal UR is
rewritten; this implements merchandise portions of UR-17/18/19/28, with travel
and overall-cost UR-22/25 behavior still deferred to T05.

Reuse verified seed observations, selected by observed_at/id descending before
any calculation, and fixed exact USD/LBP arithmetic. Reject invalid list states.
Use 30 days (`PRICE_FRESHNESS_DAYS`) as an MVP caution threshold; old prices stay
eligible. Future-dated observations get a separate caution, never a recent label.
Stock remains unknown; no availability field/table is invented. The historical
demo verification label does not assert real-world validation.

Enumerate useful branch sets exactly, assigning each product's entire quantity
to its cheapest member. Tie order is exact total, actual branch count, then
lexicographic ascending branch IDs; per-product equal prices prefer lower branch
ID. Estimate work before enumeration and return 422 above 10,000,000 estimated
branch/product checks. Do not truncate candidates or return approximations.
This avoids a solver dependency while retaining multiple feasible candidate sets
for T05. No schema change or owner database writes are required. The owner confirmed
successful physical-iPhone acceptance on 2026-11-17 and authorized T04 finalization,
commit and push to main; see [verification](t04-verification.md).

### 2026-11-09 — T03-C mobile authentication, lists and basket results

After owner acceptance, T03-B was committed/pushed as `e0e597b` before any T03-C
changes. The owner explicitly authorized continuing T03-C separately. Preserve
five tabs; put auth forms in Profile, saved lists in Shopping List, and additional
list/product-picking/comparison screens in the root stack. Keep the accepted
nontransparent iOS headers and existing safe-area edges. No backend/schema change.

Add only `expo-secure-store ~58.0.2`, matching the installed SDK 58 native manifest
and official Expo Go compatibility. Use the OS-backed native storage without custom
encryption/biometrics. Persist only the opaque token; validate it via `/auth/me`
on startup. Browser sessions remain in memory, with a visible explanation, because
SecureStore does not support web. No insecure persistent browser substitute.

Use a small injected session controller with React context/useSyncExternalStore,
serialized storage writes, generation guards and aborts instead of a state library.
Hide private UI immediately at logout, remove local credentials, and attempt server
revocation. A remote failure is reported without restoring private UI. Native
storage failures are reported; failed/obsolete login saves are cleaned up and their
issued server tokens revoked on a best-effort basis. Current protected-request 401
invalidates the session; unrelated failures preserve it. An old account's late 401
cannot clear a newer login.

Reuse existing catalog search and request controllers. POST adds/increments while
PATCH explicitly replaces quantities; no optimistic aggregation or automatic
increment retries. Validate private responses and exact-unit ranks while keeping
all monetary display values as strings; backend remains authoritative. Render
all server cheapest ties, inactive/no-complete outcomes, named missing coverage,
demo/freshness labels and one backend availability notice at the result bottom.

These changes implement mobile portions of UR-01/04/17/28 while preserving the
original requirements and T02 guest access. No future optimization, inventory,
receipt, routing or assistant scope is introduced. The owner approved T03-C after
final physical-iPhone testing on 2026-11-09, completing overall T03, and authorized
a separate commit/push. The revised sequence is T04 two-supermarket optimization,
T05 routing/fuel, T06 receipt OCR; none is implemented by this checkpoint. See
[verification](t03c-verification.md).

### 2026-11-09 — T03-B single-branch comparison and exact currency arithmetic

The owner task authorizes authenticated owned-list comparison without changing
T02 or authentication contracts. Keep verified **seed** source eligibility, no
freshness cutoff; admit both USD/LBP to T03-B only as required by the approved
conversion scope. Latest eligible `(product,branch)` observation wins by timestamp
then ID across currencies; there is no cheaper-history or per-currency selection.

Choose BigInt arithmetic rather than a decimal library: both currencies have
DECIMAL(12,2) observations and a fixed integral rate of 90,000. One unit is exactly
1/9,000,000 USD, so all conversion, package multiplication, sums, comparisons and
ties are lossless. Original amount/currency and exact units remain in the response;
two-decimal half-up formatting is display only. Rounding values before summation
can reverse rankings and is explicitly tested. Dense rank ties order by branch ID.

Only complete individual branches qualify. Incomplete branches expose missing IDs
without subtotals; no complete branch means no recommendation. Empty lists use
400; inactive required items yield an explicit blocked 200 with all items retained
and no active-subset ranking. The single required availability notice appears at
the response top level. Stock is not tracked. No schema or owner record changes.

A scoped REPEATABLE READ transaction locks the owned parent FOR SHARE before
establishing the item/product snapshot, then batch-reads branches/prices on the
same view. Existing parent-exclusive list writes wait; comparisons can coexist.
Commit before pure calculation to release locks early. This was chosen over
independent repository reads that could mix quantities, product state and prices.

UR-17's backend single-store basket calculation and supporting UR-04/05/13/28
behavior are implemented without changing the original requirements. The task
also confirms future one-stop, exactly-two-stop and automatic one/two-stop modes,
combined complete coverage and a maximum of two physical branches. Final-stop
purchase constraints, optimization, routing and mobile flows remain deferred.
T03-B owner acceptance passed on 2026-11-09; overall T03 remains in progress. See
[verification](t03b-verification.md).

### 2026-11-09 — T03-A authentication and shopping-list foundation

The owner task explicitly authorizes backend registration/login/logout/me, hashed
opaque sessions and four additive tables. Use Node's built-in asynchronous scrypt
(N=131072, r=8, p=1, 16-byte random salt, 64-byte output) instead of adding an Argon2
dependency. D11 previously recommended Argon2id without finalizing it. Fixed
parameters are stored in the hash format. Passwords are 8–128 Unicode code points,
at most 512 UTF-8 bytes, with no trimming or composition requirements. Registration
does not log in. Emails use ordinary ASCII syntax, trim/lowercase normalization
and case-insensitive database uniqueness. Sessions use 32 random bytes, SHA-256
storage, database-clock seven-day expiry, no sliding extension, and current-session
deletion on logout. Mobile secure storage is T03-C.

Whole-package quantities are 1–999. Parent list row locks plus transactions and a
unique list/product key serialize duplicate additions and reject overflow without
partial changes. PATCH replaces quantities. Foreign/inaccessible resources share
404; client user IDs are rejected. Inactive products stay in existing lists, can
have quantities changed or be removed, and cannot be added again. Names may repeat.
No catalog observation or original requirement is changed. The owner manually
imports migration 002; automated writes use only a verified disposable server.

The task also confirms future T03-B complete-branch coverage (every required active
product; inactive required products prevent completeness), no eligible recommendation
when none qualifies, no inventory inference, a small availability reminder, and
fixed USD/LBP conversion at 90,000 LBP per USD with original amounts preserved.
These policies are recorded for future work; calculations and mobile screens are
not implemented. UR-01 and the list portion of UR-17 are supported; complete T03
and formal requirement fulfillment are not claimed. See [verification](t03a-verification.md).

### 2026-11-07 — T02 final session consistency and repository preparation
The assigned cleanup explicitly authorizes strict SQL mode and UTC application
sessions, not global/server/credential changes. Configure each callback-pool
checkout before its existing promise interface returns it: retain current modes,
add STRICT_TRANS_TABLES/NO_ZERO_DATE/NO_ZERO_IN_DATE and set UTC. Reapply on reuse
rather than rely on a fire-and-forget async connection event. A setup failure
destroys the connection and propagates an error; the extra SET per checkout is
acceptable for this capstone. mysql2 Date conversion also uses timezone Z.
Historical DATETIME meaning, price policies, records and schema are unchanged.
The new/extended regressions and requested package checks pass; full owner/iPhone
acceptance remains pending. No T03, new dependency or broader audit is introduced.
See [final cleanup](t02-final-cleanup.md).

### 2026-11-06 — T02-F audit corrections and open T03 proposals
The audit reproduces text-protocol escaping failure under a session-local
NO_BACKSLASH_ESCAPES mode and blank optional images rejecting valid products.
Use mysql2 prepared `execute` binding and a blank-image placeholder; keep SQL,
eligibility, verification, freshness and currency policies unchanged. Stronger
browser assertions prove completed server search, no price prefetch, transport
recovery and tied labels. Add read-only EXPLAIN/metadata tooling and typecheck
backend tests/scripts; no dependencies or speculative indexes.
The audit records excess local app DDL privileges, wildcard MySQL listeners and
non-strict/SYSTEM-timezone sessions; no account/service setting is changed.
[T02-F](t02f-audit.md) proposes R1–R8 for owner approval: canonical whole-package
list quantities, inactive-item behavior, explicit incomplete/demo basket totals,
owner-scoped authorization, password hashing, session/storage/expiry choices and
logout request isolation. The opaque-session recommendation is an alternative to
D11's proposed JWT approach, not a confirmed replacement. Guest browsing and
source/freshness/conversion remain open. No T03 feature or new production table
is implemented; no formal requirement or approved business policy is changed.

### 2026-11-06 — T02-C/D/E mobile integration and hardening
The assigned task selects the existing five-tab mobile architecture with root
stack screens for product details, comparison and supermarkets. Use canonical
IDs and `navigate`, with direct-link back fallbacks. One shared GET client and
small runtime readers replace duplicated fetch logic; no validation library or
global store is needed. A screen-local request controller combines aborts with
generation checks, including during debounce, instead of trusting cancellation
alone. Search is server-side, trimmed, 350 ms debounced and capped at the existing
API maximum of 100; pagination remains unsupported and visible as a limitation.
Amounts remain decimal strings; exact ties use the first backend-ranked amount,
and invalid ordering fails the contract rather than being silently sorted.
The client displays backend demo/freshness/availability metadata without deciding
price eligibility or introducing a freshness cutoff. Reuse installed backend
tsx/Node test tools rather than adding a mobile test framework; optional rendered
browser checks use Chrome's existing debugging protocol and a disposable proxy.
The audit confirmed malformed URL-encoded IDs returned 500; a narrow central
error correction returns sanitized 400 without touching SQL or price policies.
These are in-scope implementation choices supporting UR-03/04/05/13/26/28; no
formal requirement, paid integration, schema, authentication or future milestone
scope changes. The owner's task confirms T02-B live checks. T02 acceptance still
requires the owner/iPhone checklist in [verification](t02cde-verification.md).

### 2026-11-06 — T02-B read-only catalog backend
The assigned task authorizes active product search/detail, nested supermarket
branches and USD demonstration comparisons. Use existing Express app-factory,
mysql2, error middleware, Node test runner and Supertest conventions. Simple SQL
normalization mirrors generated aliases; literal substring search includes name,
brand, category and aliases, without inferring product equivalence. `EXISTS`
avoids alias duplicates. Default limit 50, maximum 100, stable ordering and strict
ID/query validation bound reads. Inactive product details/prices return 404.
Filter verified USD seed observations before ranking per branch; timestamp then
observation ID resolve ties. Return decimal-string amounts, UTC observation times,
explicit demo labeling and check-with-store availability. No freshness policy or
currency conversion is inferred. A LEFT JOIN nests branches under chains,
including empty chains, avoiding an additional branch endpoint. These are
implementation choices within T02-B supporting UR-03/04/05/13/26/28; no formal
requirements, broader architecture or deferred policies change. SELECT-only MySQL
CTE fixtures replace temporary writes for adversarial tests. Owner API review
remains pending; see [verification](t02b-verification.md).

### 2026-11-06 — T02-A implemented and manually verified
The assigned task authorizes the five catalog tables, plain numbered SQL migration,
USD demonstration seed and database checks. Identity includes name, brand,
non-null variant, size, unit and pack quantity; categories remain text instead of
adding a sixth table. Generated aliases normalize case, ASCII spaces and hyphens;
unique collisions fail instead of reassigning. Positive package prices keep
separate source/ingestion times and four statuses. Normal operations append
observations; no immutability triggers or update/delete workflows are introduced.
Receipt source is deferred together with its enforced receipt-item FK instead of
allowing unlinked receipt observations. Manual migration records avoid an extra
framework/table. These choices support UR-03/04/05/11/13/16/26/28; UR-14 remains for
the receipt milestone. No formal requirement or broader architecture changes.
Identity/unit and immutability limits are recorded in `database.md`.
Exchange rates, freshness, source trust and receipt policy remain open. Existing
grants were preserved; tests used a disposable local MySQL instance because the
configured account lacked `REFERENCES`.
The owner subsequently confirmed successful migration/seed import into local
WampServer MySQL and manual verification of all five expected table counts
(36 products, 12 aliases, 3 supermarkets, 4 branches, 125 observations).
T02-A is complete; T02-B remains unstarted. See [verification](t02a-verification.md).

### 2026-11-04 — Owner-requested Expo SDK 58 migration
The owner's SDK migration task supersedes the T01 SDK 54 pin below. Target SDK 58 and Expo's supported dependency versions, following the official expo-upgrade skill and release notes for SDKs 55–58. Preserve the five JavaScript tabs and client-only web output; do not adopt the new native-tabs template or implement T02. No server, database, formal UR, or broader architecture changes. This is explicitly owner-authorized; no additional scope approval is needed. Commands, dependency resolution, and remaining device acceptance are recorded in [expo-sdk-58-migration.md](expo-sdk-58-migration.md).

### 2026-11-04 — T01 implementation choices
The assigned T01 task explicitly selects the five tabs and modular monolith described by D09/D10. Use Expo SDK 54 and its compatible React Native version for the owner's App Store Expo Go workflow, rather than automatically choosing the newest SDK. Backend uses separate installable packages, Express 5, Node's test runner with tsx and Supertest, and an injected database checker for isolated HTTP tests. Pool connections are lazy so process health survives database outages. Manual phpMyAdmin setup grants only database-scoped DML to a loopback account; future DDL uses an administrator. No formal UR scope changes or paid integrations. Empty future directories are deferred until needed. These are T01 implementation choices; no broader architecture change.
Add a dated entry specifying decision, alternatives considered, tradeoff, affected URs, and whether owner/advisor approval is needed. Update corresponding `architecture.md`, `database.md`, `frontend.md`, `api.md` and `roadmap.md` as applicable.
