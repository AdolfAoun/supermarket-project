# T02-C / T02-D / T02-E verification and engineering audit

Initial implementation date: 2026-11-06. **Complete T02 owner acceptance was
confirmed on 2026-11-07 after successful physical-iPhone testing. T03 has not started.**
This report records the C/D/E checkpoint. [T02-F](t02f-audit.md) adds two corrective
hardening changes, strengthens the browser assertions and records the current
27-test backend result plus environment/T03-readiness findings; counts below are
the historical C/D/E run, not the latest audit run.
The owner's assignment confirms the earlier T02-B live API acceptance. Existing
uncommitted T02-B files were present at inspection and have been preserved.

## 2026-11-07 — Final owner acceptance

The owner confirmed successful physical-iPhone testing in Expo Go/SDK 58 and
explicitly approved the complete T02 milestone. The previously reported header
overlap on Product Details and Supermarkets is corrected and verified on the
physical device. Catalog browsing/search, canonical details, price comparison,
supermarket/branch retrieval, navigation and backend connectivity are accepted.

This device verification was performed by the owner, not the coding agent.
The automated counts below remain the recorded executed runs; no new test run
or device session is inferred from acceptance. The earlier pending notes/checklists
are historical checkpoints, superseded by this confirmation. Demo data remains
illustrative USD observations; acceptance does not establish current store prices.
T02 is finished. T03 and its design proposals remain unimplemented/unapproved.

## 2026-11-07 — Owner iPhone header-layout correction

The owner reports physical-iPhone testing with Expo SDK 58/Expo Go confirmed
browsing, search, comparison, supermarket/branch retrieval, navigation and backend
connectivity. Product Details and Supermarket Browsing content overlapped their
back-button/title headers on the device. **At that checkpoint, corrected-screen
iPhone verification was pending; final owner acceptance above now supersedes it.** The agent has not operated an
iPhone for this fix. Historical results below remain the earlier checkpoint.

### Root cause and correction

The root Stack left `headerTransparent` unspecified. The installed SDK 58 native
stack's `useHeaderConfigProps.js` selects a transparent system header when Liquid
Glass is available and no explicit opacity/background is set. Its bundled types
describe the conditional iOS 26+ default. Shared `PageHeader` enabled that header,
but the screens excluded top safe-area padding and did not use a transparent-
header scroll-inset strategy: they assumed native navigation reserved header
space. The owner's exact iOS version was not supplied; this is the identified
code-level mismatch, not a newly observed device trace.

`mobile/app/_layout.tsx` now explicitly sets `headerTransparent: false`. Native
stack/screens handle the top header inset (including the installed
`ScreenStackItem.tsx` opaque-header safe-area path on iOS 26+). Existing safe-area
edges stay left/right/bottom; ScrollView/FlatList/SectionList and content padding
stay unchanged. No fixed top offset, extra top safe area, automatic scroll inset,
negative margin or absolute-positioning workaround is added. Inspection found no
app-level absolute positioning or nested product/branch navigator causing this.
The tab container's root header stays hidden; existing page titles and back
handlers remain intact. Price Comparison inherits the same root-stack policy.

The general [Expo header options](https://docs.expo.dev/router/advanced/stack/)
describe how transparent headers overlay content; the pinned installed SDK source
provided the version-specific default evidence. [React Native's inset reference](https://reactnative.dev/docs/scrollview#contentinsetadjustmentbehavior)
explains the separate automatic scroll-inset behavior. We use opaque navigation
layout rather than combine manual padding and automatic insets.

### Files changed in this task

- `mobile/app/_layout.tsx`: explicit opaque headers, the functional correction.
- `mobile/components/CatalogUI.tsx`: product-card test locator only.
- `mobile/app/products/[id].tsx`: scroll-view test locator only.
- `mobile/app/supermarkets.tsx`: list/intro test locators only.
- `mobile/tests/browser.smoke.cjs`: rendered geometry/title/scroll/tab regressions.
- This report, `docs/frontend.md`, `docs/t02-final-cleanup.md`, `docs/roadmap.md`
  and README: owner findings, correction, checks and pending acceptance.

Earlier uncommitted work is preserved. No backend, database, business logic,
dependency, environment, orientation or tab-layout changes were made in this task.

### Executed checks

| Command in `mobile/` | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run typecheck:tests` | Passed |
| `npm test` | **31/31 passed** |
| `npx expo install --check` | Dependencies are up to date |
| `npx expo export --platform web --output-dir dist/web` | Passed |
| `npx expo export --platform ios --output-dir dist/ios` | Passed, Hermes bundle generated |
| `npm run test:browser` | **4/4 scenario groups passed**, no uncaught browser exceptions |

New rendering coverage measures content below the visible header/title with only
the existing content padding, at 320×568, 390×844, 430×932 and 844×390 CSS viewports.
At 320×400, long proxy-only product descriptions scroll to the reachable Compare
branch prices action; the supermarket list scrolls, Back works, and all five tabs
remain navigable. Existing groups still cover Home/Explore, search, comparison,
details/back and failure recovery. No stored data is changed by the proxy.

These are **web rendering regressions**, not native iPhone safe-area simulations.
TypeScript/Hermes export verify option/build compatibility, not device behavior.
The native app remains portrait-locked in app.json; the landscape check is a web
resize, not newly enabled native rotation. No corrected-device test is claimed.

### iPhone retest checklist (owner acceptance now confirmed above)

1. Reload the project in Expo Go. If needed, run `npm start -- --clear` from
   `mobile/` and perform a full reload so the root navigator uses the new option.
2. Explore → Product Details: confirm back button/title remain visible, the first
   card begins below the header with normal spacing, and scrolling reaches
   Compare branch prices. Open comparison and return to Explore.
3. Home → Browse Supermarkets: confirm the intro/first chain starts below the
   header, all branches remain reachable by scrolling, and Back works.
4. Repeat with larger text/long content where available. Check notch/home-indicator
   areas, no duplicate top gap, refresh, Home/Explore and the other three tabs.
5. Rotate the phone: native orientation should retain its existing portrait lock.
   On platforms permitting landscape, verify resizing preserves header/content.
6. The owner subsequently confirmed **both corrected screens** and approved full T02.

## Implementation and routes

- Home retains backend/database connection status and retry; Browse Products
  opens Explore, Browse Supermarkets opens the branch overview. All five original
  tabs remain. Later-feature tabs retain their placeholders.
- Explore (`/(tabs)/explore`, web `/explore`) loads the Express catalog into a
  FlatList. Cards preserve canonical IDs, brand, name, variant, per-item size,
  unit and multipack quantity. Missing or failed images have a placeholder.
- Search uses the backend, trims and URL-encodes input, debounces nonempty text
  350 ms, supports clearing, cancellation and retry, and limits input to 255
  characters. It requests at most 100 rows; at the cap, a notice asks the user to
  narrow the search. No price-per-product prefetch or invented pagination.
- `/products/:id` fetches the canonical record using the URL ID. Invalid route
  parameters do not fetch. Missing/inactive records, network failures, timeouts
  and invalid responses show a safe error with back/retry recovery.
- `/products/:id/prices` fetches identity and comparison concurrently (two GETs),
  including for direct links. It preserves backend order, highlights **all**
  exact minimum ties, displays decimal-string amounts and UTC observations, and
  shows API-provided demo/freshness/availability metadata. No zero substitutes,
  stock inference, freshness cutoff or client eligibility rules.
- `/supermarkets` uses a SectionList to preserve chains and distinct branches,
  including chains without branches, missing addresses and null coordinates.
  It does not create maps or location data.
- Routes use `navigate`, avoiding redundant same-destination pushes; custom back
  controls return through the stack or fall back to Explore/Home for direct
  entries. Returning to Explore retains search input and re-fetches on focus.

## API boundary and asynchronous state

One GET client handles the configured public URL, status codes, unknown JSON,
safe messages, AbortSignal propagation and a 10-second deadline covering both
headers and the response body. Raw backend/network errors are never displayed.
Runtime readers validate required IDs, names, package fields, positive decimal
price strings, USD, timestamps, verified status, unique branch IDs, demo flags and
the documented response envelopes before rendering. Nullable locations/images
remain nullable; malformed required data is never replaced with plausible values.
Unsafe/unusable optional image URLs become placeholders, without hiding products.

The client accepts boolean demo indicators rather than assuming demo forever.
Supported comparison enums still follow T02-B's explicit contract; later currency,
verification or freshness changes require an intentional contract update. An
unexpected ranking is rejected rather than sorted or shown with a false winner.
Exact decimal-string comparisons validate order; prices are never converted to
floating-point values for decisions. Labels use the first backend-ranked amount
for equality only. January observations remain dated January, not current offers.

The hook owns one local resource controller with idle/loading/loaded/empty/error/
refreshing states. Every request change invalidates the previous generation
**before** debounce; blur/unmount aborts the request and timer. Even a transport
that ignores abort cannot publish an obsolete result or error. The visible
resource key also hides an old record before focus cleanup runs on route changes.
Refresh retains data only for the same resource; failure becomes a visible error.
No global store, client cache, new package or authentication substitute was added.

## Commands and exact results

Install both existing packages first; mobile tests reuse the backend's installed
tsx/Node test tools. No new test packages or lockfile changes are required.

| Working directory | Command | Final outcome |
|---|---|---|
| `mobile/` | `npm test` | **31/31** deterministic logic tests pass |
| `mobile/` | `npm run typecheck` | Pass |
| `mobile/` | `npm run typecheck:tests` | Pass; separate Node test type environment |
| `mobile/` | `npm run test:live` | **6/6** live checks pass (5 subtests + parent) |
| `mobile/` | `npm run test:browser` | **3/3** rendered scenario groups pass; no uncaught browser exceptions |
| `mobile/` | `npx expo install --check` | Dependencies are up to date |
| `mobile/` | `npx expo export --platform web --output-dir dist/web` | Pass |
| `mobile/` | `npx expo export --platform ios --output-dir dist/ios` | Pass; Hermes bundle generated |
| `backend/` | `$env:RUN_CATALOG_DB_TESTS='1'; npm test` | **26/26** tests pass, including SELECT-only MySQL checks |
| `backend/` | `npm run typecheck` | Pass |
| `backend/` | `npm run build` | Pass |
| Repository root | `git diff --check` | Pass |

Remove the optional process flag afterward with
`Remove-Item Env:RUN_CATALOG_DB_TESTS`. It does not alter an environment file.

Initial sandbox test/Hermes invocations hit `spawn EPERM`, and the first Expo
compatibility request hit the restricted proxy. Authorized runs outside the
sandbox passed. An accidental `npm run typecheck` at repository root failed
because packages are separate; the package-directory commands above passed.
An initial browser assertion treated web Button casing as case-sensitive; the
harness was corrected and rerun successfully. These failures were not hidden.

### Deterministic behavior tests

Controllable promises and injected timers prove older success/failure cannot
overwrite newer results, clearing cannot restore old filtered data, cancellation
on blur/unmount prevents updates, and obsolete work stays invalid throughout the
debounce window. No arbitrary network delays determine those outcomes.

Tests cover HTTP failure, unavailable network, timeout (including stalled body),
cancellation before/during a request, malformed JSON, missing fields, retries,
empty catalog/prices, package distinctions, duplicate IDs, nullable images and
coordinates, invalid routes, exact monetary strings, one/multiple/tied prices,
historical dates, inconsistent demo/status/availability metadata, invalid ordering,
empty chains and cross-engine timestamp parsing. Existing health/CORS/error tests
continue to pass.

### Live integration, separate from physical-device verification

`npm run test:live` runs the production mobile client/readers against the owner's
running Express at `http://127.0.0.1:3000/api`, then MySQL. It validates health,
36 active products, distinct Coca-Cola packages, alias search, empty search
results, canonical details, eligible observations, branch/chain envelopes and
safe 400/404 errors. Product 1 returned branch/amount pairs
`(3, 1.60), (1, 1.70), (4, 1.75), (2, 1.80)`; product 13 had three eligible
branches. These are invented **DEMONSTRATION DATA** amounts. Backend read-only
checks confirmed three chains, four branches and 125 observations unchanged.

The optional browser script uses the exported app, installed headless Chrome and
built-in Node APIs. It creates a disposable browser profile and loopback proxy,
redirecting API requests through that proxy instead of changing the owner's CORS
or local `.env`. Normal responses come from the actual running Express/MySQL;
failure/empty/malformed responses are simulated only in the test proxy. The
profile/proxy are cleaned up afterward. A different installed browser executable
may be supplied with the process variable `BROWSER_EXECUTABLE`.

Rendered scenarios passed:

1. Five tabs; Home to Explore; actual search input; rapid repeated taps to product
   details; price comparison; back to details/Explore with retained query.
2. Home to supermarket/branch information; direct product 2 details; direct-link
   back fallback; invalid and nonexistent product URLs.
3. HTTP 500 and malformed JSON/payload failures with successful user retries;
   empty catalog; empty comparison without a zero amount; no uncaught JS errors.

This validates desktop rendering/navigation and the API path. It does **not**
prove iPhone layout, VoiceOver, native gestures, native fetch cancellation or
phone-to-PC LAN connectivity. No physical device was operated for this task.
The owner's original services were not stopped/reconfigured. No SQL writes,
imports, schema/grant/credential changes or record deletion occurred.

## Engineering audit: findings and corrections

| Area / severity | Failure scenario and cause | Correction / evidence |
|---|---|---|
| Backend status / Medium | An invalid percent-encoded product ID fails Express decoding before route validation and was incorrectly returned as internal HTTP 500. | Confirmed with a failing regression, then classify Express's status-400 URIError as sanitized 400 `Invalid URL parameter`. Both product routes pass; SQL/eligibility unchanged. |
| Native date portability / Medium | MySQL timestamps have six fractional digits; parsing all six directly depends on engine behavior beyond ECMAScript's guaranteed millisecond form. | Validate the calendar with a three-digit ISO copy while preserving the original microsecond string. A strict-engine simulation regression passes. This is a portability hardening, not a claim to have observed an iPhone failure. |
| Async correctness / High if unguarded | Aborting alone cannot stop an already-resolved or noncompliant transport; waiting until debounce expires leaves an old request able to publish. | Generation invalidation occurs immediately, key guards hide wrong identities, and focus cleanup cancels. Deferred-promise regressions cover late success, late failure, clear, blur and debounce. |
| Contract/money / High if unguarded | Trusting network TypeScript shapes, malformed numeric strings or duplicate/unsorted branches can display false zero prices or false winners. | Runtime readers reject bad required data, duplicates and broken order. No monetary Number conversion; all exact ties receive the same label. Contract tests cover edge cases. |
| Optional media / Low | Missing/unsafe image URLs or image-load errors can make otherwise valid catalog items unusable. | Safe HTTP(S) URLs only, no URL credentials, and consistent missing/error placeholders. URL validation tests and rendered image-free seed cover the paths; a real image-service failure still needs device acceptance. |
| Networking boundary / Medium | The original health component owned a separate fetch/timer implementation, risking inconsistent errors/recovery as new screens were added. | Health now uses the same validated client and focus/resource lifecycle. Live health and rendered Home checks pass. |
| Navigation / Medium | Repeated taps or direct entries can cause duplicate routes or no usable back action. | `navigate`, canonical-ID routes and fallback back destinations; actual browser double-tap/back/direct-link checks pass. Native gestures remain manual acceptance. |

The High-if-unguarded rows describe concrete failure modes prevented during
implementation and tested in the audit, not claims that the original placeholders
already contained those features. Passing tests do not establish absence of all
defects. The audit checked business identity, client/server authority, request
counts, virtualization, optional fields and recovery paths rather than redesigning
the database/backend. No source, verification, freshness or currency policy changed.

## Remaining risks

- **Critical:** none identified in the reviewed demo scope; this is not a production security certification.
- **High:** no known unresolved in-scope logic defect. Real-world price recommendations remain unsupported by the demonstration dataset and open trust/freshness/currency decisions; demo acceptance must not be interpreted as production readiness.
- **Medium:** physical-iPhone/LAN, Expo Go interaction, large text/VoiceOver, native gestures and image/network recovery need owner acceptance. This validation gap blocks declaring full T02 accepted. Browser proxy tests do not validate the owner's CORS/LAN configuration.
- **Low:** product reads cap at 100 without pagination or total count. A visible limit notice supports narrowing search; larger catalogs need a future server pagination contract.
- **Low:** test tooling intentionally requires both packages installed; browser smoke requires installed Chrome and exported web assets. No dedicated React Native component-test framework is added. Native behavior is not inferred from the 31 pure-logic tests.
- **Low:** current branch response is unpaginated, though rendering is virtualized. Revisit server bounds before substantial catalog/branch growth; do not add speculative pagination now.

## Manual iPhone owner acceptance

1. Keep the existing WAMP MySQL and Express services running. From `backend/`, use
   `npm run dev` when needed. Preserve current credentials/environment files.
   The phone and PC must share the trusted LAN, and the existing public API URL
   must point to the PC, not phone localhost. Do not expose MySQL to the network.
2. From `mobile/`, run `npm start` (or `npm start -- --clear` if Metro is serving
   an old bundle). Scan the QR code with the iPhone Camera into the compatible
   Expo Go client. Do not change SDK/dependency versions for this acceptance run.
3. Confirm all five tabs and Home's database connection check. Browse Products;
   search `coca`, `Coke 1.5L`, whitespace, an unmatched term and rapid text changes.
   Clear search and confirm no old results reappear; try pull-to-refresh.
4. Open both Coca-Cola packages and confirm 330 ml versus 1.5 L, brand, variant,
   category and pack quantity. Compare product 1: USD 1.60/1.70/1.75/1.80 in that
   order, January 2026 UTC observations, demo labeling, simulated verification,
   freshness-not-evaluated explanation and Check with store. No current/stock claim.
5. Back to Explore; confirm retained search and stable navigation after rapid taps.
   Open Home → Browse Supermarkets: three chains/four fictional branches, addresses,
   and coordinates unavailable rather than invented points. Visit the three
   future-feature tabs and return; no extra tab or fake functional actions.
6. Test poor network/airplane mode on the phone, wait for the safe timeout/error,
   restore connectivity and Retry. Navigate away during loading and return;
   verify no obsolete results or errors reappear. Do not stop/change MySQL or delete
   records to simulate failures. Empty/malformed/tied-price paths are already
   automated with mocks; do not edit live data to create them.
7. Check scrolling, keyboard, safe areas, large text and VoiceOver labels. Record
   device/Expo version and pass/fail for this checklist before owner T02 sign-off.

## Future compatibility (no future features implemented)

- T03: canonical IDs and explicit pack quantities support later selection/list items.
- T04: matching remains backend normalized aliases and controlled catalog IDs;
  unresolved receipt items can later use the same catalog selection route/data.
- T05: missing prices remain absent, never zero; no single-product winner implies
  a cheapest or complete basket.
- T06: branch IDs remain distinct from chain IDs and missing coordinates are null.
- T07: observations/timestamps and database price IDs remain unchanged. A future
  history/alerts endpoint should expose observation identity as needed; the current
  comparison DTO deliberately exposes no internal observation ID.
- T08: future assistant actions can call existing ID-based backend reads; names
  are display/search fields, not guessed identities.

## Files and repository safety

New mobile files:

- `mobile/app/products/[id].tsx`
- `mobile/app/products/[id]/prices.tsx`
- `mobile/app/supermarkets.tsx`
- `mobile/components/CatalogUI.tsx`
- `mobile/hooks/useRemote.ts`
- `mobile/services/contracts.ts`, `mobile/services/resource.ts`, `mobile/services/presentation.ts`
- `mobile/tests/api.test.ts`, `mobile/tests/contracts.test.ts`, `mobile/tests/resource.test.ts`
- `mobile/tests/fixtures.ts`, `mobile/tests/live.integration.ts`, `mobile/tests/browser.smoke.cjs`
- `mobile/tsconfig.tests.json`

Modified mobile files: `mobile/app/(tabs)/explore.tsx`, `mobile/app/(tabs)/index.tsx`,
`mobile/components/ConnectionStatus.tsx`, `mobile/services/api.ts`,
`mobile/package.json` (scripts only), and `mobile/tsconfig.json` (Node tests split
from the Expo app type environment).

Audit backend changes: `backend/src/middleware/errors.ts` and one regression in
the pre-existing uncommitted `backend/tests/catalog.test.ts`. Existing T02-B app,
repository/routes and tests remain preserved; no API policy or SQL changes.

Documentation: this new report, `README.md`, `docs/frontend.md`, `docs/api.md`,
`docs/architecture.md`, `docs/database.md`, `docs/roadmap.md`, `docs/decisions.md`,
and the historical status note in `docs/t02b-verification.md`.
`database/README.md` already had an uncommitted T02-B update and was preserved.

Requirements, SQL migration/seed, secrets, local environment files and dependency
lockfiles are unchanged by this task. Generated `dist/` exports remain ignored.
Git content was inspected and checked against configured local secret values
without printing them; no local environments/secrets are staged. No commit or
push was made. Existing uncommitted T02-B work remains alongside this task for
owner review.
