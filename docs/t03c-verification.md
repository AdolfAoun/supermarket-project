# T03-C — mobile authentication, lists and basket integration

**Final owner acceptance: approved 2026-11-09. T03-C and overall T03 are complete.**

The owner completed physical-iPhone acceptance and confirmed registration/login,
duplicate-email detection, logout, session persistence after completely closing
and reopening Expo Go, shopping-list creation/product management, quantity
increases/decreases, removal, addition confirmations, smooth interactions without
full-screen reloads, basket comparisons/rankings, missing-price explanations,
stable pending buttons and existing T02 functionality.

The perceived button flicker was the temporary disabled-state gray styling,
resolved by separating pending interaction blocking from permanent disabled styling.
The owner verified the correction. Earlier pending-acceptance statements below
are historical investigation records, superseded by this final acceptance.

The owner authorized the separate T03-C commit and normal push to `main` using
`feat: complete T03-C mobile shopping list integration`. Final automated results
and checkpoint review are recorded below. T04 remains unimplemented.

## Final checkpoint verification — 2026-11-09

| Check | Final result |
|---|---|
| Mobile `npm test` | **71 passed, 0 failed, 0 skipped** |
| Mobile `npm run typecheck`, `npm run typecheck:tests` | Passed |
| Backend default `npm test` | **50 passed, 0 failed, 3 opt-in database groups skipped** |
| Backend full test command with all database groups enabled | **91 passed, 0 failed, 0 skipped** |
| Backend `npm run typecheck`, `npm run typecheck:tests`, `npm run build` | Passed |
| Mobile `npm run test:private-live` with browser mode and disposable MySQL | **8 passed, 0 failed, 0 skipped** |
| `npx expo export --platform all --output-dir dist/final-check` | Web, iOS/Hermes and Android/Hermes passed |
| Tracked/new-file and staged whitespace review | Passed |

The initial all-database backend run could not reach the owner's stopped WAMP
instance at `127.0.0.1:3306`. No application service or credential was changed.
The successful full rerun used the separately initialized, datadir-verified MySQL
server at loopback port 3308. Existing authentication/basket fixtures used their
own disposable schemas. Catalog regressions used the unchanged catalog migration
and seed in `t03c_catalog_checks`, with a dedicated SELECT-only test account.
The test runner received temporary process-only DB overrides (including an empty
test password), never an edit to `.env`. The command was the same `tsx --test
tests/*.test.ts` used by `npm test`, with all three database opt-ins enabled.
The mobile browser suite also used only its dedicated disposable schema. The
temporary server was stopped and its verified temporary datadir removed afterward.

Review found only the intended mobile authentication/list/basket implementation,
UX fixes, tests, SecureStore configuration/lockfile entry and related documentation.
No backend source, database files, original requirements, local environment files,
session tokens, credentials, generated exports or unrelated files enter this
checkpoint. The revised roadmap marks T03 complete and leaves T04 optimization,
T05 routing/fuel and T06 receipt OCR unstarted.

### Owner clarification — temporary button graying (current diagnosis)

The owner clarified that product rows, surrounding text and layout remain stable:
the perceived flash is the buttons turning gray during quantity requests. This
supersedes the earlier interpretation of the remaining symptom as whole-screen
or product-text disappearance. The earlier keyboard investigation below is a
historical record, not the explanation for this clarified button-only symptom.

The editor used React Native `Button`. In the installed React Native 0.88.1
`Libraries/Components/Button.js`, iOS disabled text becomes `#cdcdcd`. Item writes
toggled both the affected row controls and list-wide action buttons to disabled
and back, briefly recoloring several labels even for a very fast request.
`Button` also uses `TouchableOpacity` on iOS (default active opacity 0.2;
`TouchableOpacity.js` restores opacity over 250 ms when disabled changes).
This is a visual state transition, not a loading replacement or changing React key.

Added a small local `ListActionButton` using `Pressable`, used only by the list
editor and its opt-in rename submit control. Temporary `busy` blocks presses and
reports disabled/busy accessibility state while retaining label color and opacity.
Permanent `disabled` constraints still look disabled: minus at one, plus at 999,
invalid/unchanged quantities, empty rename input and an empty-basket comparison.
Press feedback uses an immediate subtle background highlight without fading text
or adding animations. No loading labels, spinners or dependencies were introduced.
Existing synchronous write guards, confirmed response updates, failure handling
and session cancellation remain unchanged. Other screens retain their controls.

Regression verification for this correction:

- `npm test`: **71 passed, 0 failed, 0 skipped**.
- `npm run typecheck` and `npm run typecheck:tests`: passed.
- `npm run test:private-live` with browser mode and disposable MySQL:
  **8 passed, 0 failed, 0 skipped**. The browser suite holds decreases (3→2,
  2→1) and deletion pending and verifies every editor button retains its mounted
  node, text, computed color, opacity and background. Duplicate decrease/removal
  clicks produce one HTTP write. Minus remains disabled at one; remaining controls
  retain their nodes/colors after removing the other row. Existing no-refetch,
  row stability, basket, error and session regressions also pass.
- Web and iOS/Hermes production JavaScript exports passed. Initial sandbox
  test-worker/Hermes launches hit `spawn EPERM`; both passed with process-launch
  permission. These exports do not substitute for an iPhone device recheck.
- Tracked/new-file whitespace checks passed; backend/database diff remains empty.

Changed files: `mobile/components/ListActionButton.tsx`,
`mobile/components/AccountUI.tsx`, `mobile/app/lists/[id].tsx`,
`mobile/tests/private-browser.ts`, and this verification document.
Owner iPhone recheck remains pending. No backend/API/schema changes, commit or push.

### Targeted follow-up — decreasing quantities and removing rows

The owner confirmed addition flicker is fixed but still observed native iPhone
flashing on decreases/removals. This investigation changed only the editor,
its shared page/form options and regression tests; no backend/API/schema changes.

**Confirmed findings:**

- Quantity responses previously committed the new saved quantity while the input
  still held its previous value. A `useEffect` then updated the input in another
  render. Decreasing to one also inserted an additional helper paragraph, changing
  the row's height despite the operation only changing a number.
- Every pending item operation also disabled the rename text input through the
  page-wide pending flag. The affected quantity input is disabled too, and deleting
  a focused row necessarily removes its native input. These paths can change native
  keyboard/focus state; they do not exist in the unchanged product-add flow.
- `AccountPage` wrapped the editor in `KeyboardAvoidingView`, coupling keyboard
  events to whole-page padding/state changes. The installed React Native 0.88.1
  `Libraries/Components/Keyboard/KeyboardAvoidingView.js` also calls global
  `LayoutAnimation.configureNext` when showing/adjusting the keyboard with an
  animation duration. Keyboard hide resets its bottom padding. Retained off-screen
  forms kept their wrappers enabled and could react to the active screen's keyboard.
- Item IDs/React keys, immutable item replacement/filtering, callback identities
  and session generations were already stable. Neither response handler refetched
  the list, changed route or replaced the screen. The earlier broad refetch fix was
  not a complete explanation for the remaining native-only symptom.

**Corrections:**

1. Synchronize the quantity draft during the row's render when its confirmed server
   quantity changes, before children commit, instead of using a post-commit effect.
   Unsubmitted input remains unchanged during unrelated renders/errors. This follows
   [React's documented previous-render-state pattern](https://react.dev/reference/react/useState#storing-information-from-previous-renders).
2. Keep package/removal guidance present at every quantity so 2→1 does not add or
   remove a paragraph. The minus button still correctly disables at one.
3. Only the list editor opts into the existing ScrollView's native
   `automaticallyAdjustKeyboardInsets`, replacing its JS keyboard-padding wrapper.
   No new animation or notification workaround is added. Other visible forms keep
   their existing keyboard behavior; their wrappers are now enabled only while
   focused so hidden pages cannot schedule layout work over the editor.
   See [native keyboard-inset documentation](https://reactnative.dev/docs/scrollview#automaticallyadjustkeyboardinsets).
4. Separate rename submission blocking from input editing. Item operations still
   block rename/delete/compare submissions safely but do not disable an unrelated
   focused rename field. Row write guards, backend confirmation, retained data,
   error messages and session cancellation remain unchanged.

The keyboard/layout coupling is confirmed in source; **the exact iPhone frame
disappearance has not been directly captured by Codex**. Native confirmation of
these targeted corrections remains an owner acceptance step, not a claimed result.

**Latest executed verification:**

- `npm test` in mobile: **71 passed, 0 failed, 0 skipped**.
- Mobile `npm run typecheck` and `npm run typecheck:tests`: passed.
- Disposable HTTP/MySQL/rendered suite: **8 passed, 0 failed, 0 skipped**.
- Web and iOS production JavaScript exports: passed; no signed/native device build.
- Tracked/new-file whitespace and unchanged backend/database/baseline checks: passed.

The browser suite now separately delays 3→2, 2→1 and DELETE after focusing the
target input. It checks the target input's server-confirmed value and constant
row height after each decrease. MutationObservers verify zero text/child/attribute
mutations in the unrelated product row. DOM identity checks keep the scroll view,
remaining product and rename field mounted; only the deleted row disappears.
Request counters and route checks confirm zero extra list reads or navigation.
The unchanged $3.90 basket and all earlier flow checks also pass. A test initially
matched another product already at quantity one; its wait now targets the edited
row explicitly. No application value was changed to accommodate that test.

Unit regressions cover immediate draft synchronization at both decrease boundaries,
unchanged unrelated row references/metadata on decrease/removal, and failed decrease
and DELETE preserving all previously confirmed data with an item-level error.
The existing duplicate-tap, concurrent-row, stale-response and session tests pass.

Changed for this investigation: `mobile/app/lists/[id].tsx`,
`mobile/components/AccountUI.tsx`, `mobile/services/list-state.ts`,
`mobile/tests/shopping-list-ux.test.ts`, `mobile/tests/private-browser.ts`, this report.
No unrelated screen file, backend API, schema, auth design, dependency, commit or
push was changed. Disposable data/server were cleaned up after verification.

**Focused iPhone recheck:** repeat 3→2, 2→1 and removal with the keyboard closed,
then with the target quantity input focused; also focus Rename before an item
operation. Confirm other rows/text remain visible and keyboard access still works
for lower rows. Natural movement when closing the removed field's keyboard is
different from unrelated content disappearing/reappearing. Acceptance stays pending.

### Follow-up investigation — whole-screen/product-text flash

The owner clarified that product text/the screen flashes, rather than only native
button opacity. Review found that, even after retaining data, the editor still
issued a full-list background GET after every item operation. It also published
new resource state for identity/no-change updates and recreated row callbacks,
causing avoidable render work across unchanged products. These are concrete code
findings; the exact native iPhone frame disappearance was not reproduced by Codex.

Removed the per-operation full-list GET: confirmed responses update only the
affected row, while full reads occur on focus/return, explicit reload or retry.
Resource invalidation no longer publishes when the visible data/status are already
unchanged. Resource methods and row callbacks now have stable identities; memoized
editor/picker rows and static product descriptions skip unchanged content. The
saved-lists tab also retains existing data on focus and inserts a confirmed new
list locally rather than clearing its content before navigation. Existing stale
request, per-row concurrency and session-isolation protections remain intact.

This supersedes the earlier “background reconciliation after every settled product
operation” approach below. Failed/uncertain writes preserve confirmed data and
offer explicit retry/reload; no automatic writes or optimistic quantity math were
added. Cross-device changes are reconciled on focus/manual reload, as before.

Latest checks: **68 mobile tests passed**, mobile and test TypeScript checks passed,
**8 real HTTP/MySQL/rendered integration tests passed**, **4 existing T02 browser
groups passed**, web/iOS JavaScript exports and whitespace checks passed. The
extended browser test observes an unrelated product subtree across a delayed
quantity update: no text/child nodes are rebuilt, no full-list GET is issued, and
the existing scroll/row nodes and scroll offset remain unchanged. Native iPhone
confirmation of the reported flash is still pending. No backend, schema, package,
authentication or commit/push changes were made.

### Follow-up preference — silent product operations

At the owner's request, removed product-operation spinners and “Saving…” text from
the list editor and both add-product screens. Pending controls still disable to
prevent duplicate submissions; confirmed data, errors, scroll preservation and
the timed success notification are unchanged. The reserved saving-indicator gap
was removed too. Browser checks now observe disabled controls during delayed
requests and assert that no product-operation spinner is rendered.
Mobile tests (67 passed), mobile/test TypeScript checks and whitespace checks
passed after this presentation-only change. No backend, schema or dependency
changes, commit or push.

## Owner-requested shopping-list UX corrections

The owner reported visible reloads, lost shopping context and insufficient addition
feedback. The cause was mutation callbacks invoking `resource.retry()`, which
cleared `data`, plus focus reads that cleared the retained list again when returning
from a picker. Removing the list subtree also removed row/input/scroll state.

Corrections:

- Both product-add entry points now show a small non-interactive top confirmation
  only after the backend confirms success: `✓ Coca-Cola added to Weekly Groceries`.
  Correct product and selected list names come from the loaded records. It dismisses
  after 2.5 seconds, sits outside scrolling content and uses `pointerEvents="none"`.
  Starting another addition clears the prior message; failures never show success.
  Replacement/cancellation guards prevent an old timer clearing a newer message.
  No notification dependency was added.
- Quantity and removal responses update only the confirmed item in current list
  state. Add responses insert/replace their canonical item row rather than guessing
  the new quantity. Unrelated row references/keys are retained. No optimistic price,
  quantity or success state is shown before server confirmation.
- List reads opt into same-identity retained data for focus/background refreshes
  and errors. Successful writes do not switch the page to initial-loading state.
  After product operations settle, one background read reconciles the server list
  and timestamps while keeping the mounted scroll view and content visible.
  Different list/session identities still hide old data immediately. T02's default
  request behavior is unchanged.
- Per-item mutation owners block repeat taps on that row without a spinner or Saving text; unrelated rows stay usable. List rename/delete/compare actions
  wait for pending item operations. Different-row responses merge into the latest
  state, and in-flight older reads are invalidated before mutations. Reconciliation
  starts only when all product operations have settled, avoiding stale read/write
  overlap. Existing session, abort and focus-generation guards are retained.
- Failures keep previously confirmed rows and quantities visible, with an error
  beside the affected item and retry/reload controls. No automatic write retry is
  added. Timed-out writes still require reload before repetition.
- The picker retains its search/quantity, shows the target list name and saved
  package counts, and stays open after additions. The product-details list selector
  also stays open, with explicit `Open <list>` buttons instead of automatically
  navigating away. Creating a list there updates the selection without clearing
  the product/quantity form. Returning to an existing list refreshes in place.
- Scroll position is preserved by retaining the existing scroll view, stable
  item-ID keys and row components. No mutation status rows are inserted; the confirmation overlay does not change content height. Removing enough content
  may naturally clamp scrolling to the new content boundary; no scroll-to-top or
  screen remount is requested.

### UX follow-up verification

| Check | Actual result |
|---|---|
| Mobile `npm test` | **67 passed, 0 failed, 0 skipped** (11 new UX regression tests) |
| Mobile `npm run typecheck` and `npm run typecheck:tests` | Passed |
| Disposable `npm run test:private-live`, `RUN_T03_BROWSER_TESTS=1` | **8 passed, 0 failed, 0 skipped**, including the extended rendered workflow |
| Existing T02 `npm run test:browser` | **4 browser groups passed** |
| Backend `npm test`, `RUN_CATALOG_DB_TESTS=1` | **59 passed, 0 failed, 2 disposable backend groups skipped**; no backend source changed |
| Web and iOS production JavaScript exports | Passed |
| Tracked/new-file whitespace checks | Passed |

The rendered workflow delays a real item request and proves no premature toast,
checks one successful request for a double tap, correct toast names, non-blocking
pointer behavior, automatic dismissal and retained search. An injected proxy-only
HTTP 500 produces no toast and leaves the saved quantity unchanged. A delayed
quantity PATCH keeps the same scroll/row DOM nodes, the previous confirmed quantity
and exact scroll offset visible; another item's input stays enabled. After success,
the row updates in place and the scroll offset is unchanged. Removal retains the
same scroll view and remaining row. Explore addition no longer navigates until
the user explicitly opens the list. The $3.90 basket/coverage checks still pass.

Unit tests additionally cover out-of-order different-row merges, same-row duplicate
blocking, list-wide write exclusion, failed additions, delayed confirmation timers,
background-read invalidation, retained data after refresh failure, wrong-identity
isolation and stale completion after blur/session change. The first rendered rerun
found a test-harness DOM-reference serialization issue, corrected by discarding the
assignment return value; it was not an application error. All final results above
are from the corrected runs.

All write fixtures remained in the verified disposable MySQL server/schema. The
server and temporary data were removed after checks. No owner price data, backend
API, schema, authentication design or package dependency was changed for these fixes.
The earlier full implementation verification remains recorded below.

### Required iPhone UX recheck

1. In a long list, scroll down and change quantities in several rows. The list must
   remain visible, the affected row controls should disable briefly without a spinner/Saving text, other rows should
   remain usable, and scrolling should stay near the same place. Remove a row and
   confirm remaining rows do not flash or remount; natural content-size clamping is
   acceptable.
2. Add from both the catalog picker and product details. Confirm the exact product
   and list names in the top notification, dismissal after about 2–3 seconds,
   continued interaction, retained search/quantity and no forced navigation.
3. Return from a picker to an already open list. New items should appear through
   a background refresh while the existing list remains mounted and scrolled.
4. Fail an addition/update by temporarily losing connectivity. Previously confirmed
   quantities must remain visible; errors should be clear and no success notification
   should appear. Restore connectivity, reload as needed and retry deliberately.
5. Repeat quick taps, different-row operations and logout/navigation during a slow
   operation. Confirm no duplicated submission, stale private data or late toast.
   Recheck basket totals/breakdowns after editing. These UX corrections have not yet
   been claimed as physically reverified by the owner.

## Milestone separation and T03-B checkpoint

The initial T03-C request was paused without edits because T03-B was uncommitted.
The owner then reported successful WAMP acceptance (Coca-Cola 1.5 L × 2 plus Master
Potato Chips Salted 90 g × 1: Carrefour Baabda USD 3.90, Spinneys Beirut USD 4.20,
Spinneys Metn USD 4.50; Jounieh excluded for missing product 13), authorized the
T03-B checkpoint and explicitly authorized T03-C after a successful push.

T03-B was committed and pushed normally to `origin/main` as
`e0e597b5ca76a5993f699038a0d0575e0a643ec3`, subject
`feat: implement T03-B basket comparison and currency conversion`.
Final checkpoint checks passed: 59 backend tests, zero failures, two disposable
groups skipped; both backend typechecks, production build and staged whitespace.
The previous full T03-B run passed 91 tests. The tree was clean and `main` matched
`origin/main` before starting this separate T03-C implementation.

## Implemented screens and navigation

The existing five tabs, guest catalog, product details, individual comparison and
supermarket flows remain. No extra tab or navigation framework was introduced.

| Screen | Behavior |
|---|---|
| Profile tab | Login and registration modes; display name/email/password; explicit login after registration; safe errors; signed-in profile/logout; restoration/retry/sign-out controls |
| Shopping List tab | Login prompt for guests; saved lists, create/open, empty/loading/error/retry states |
| `/lists/:id` | Package-aware items, inactive status, rename, bounded quantity input and +/- controls, explicit remove, add picker, nonempty Compare Basket, confirmed list deletion |
| `/lists/:id/add` | Reuses existing catalog API search/debounce/cap; quantity to add; server-returned combined quantity; labels identify brand/variant/package |
| `/products/:id/add` | Product-details Add to Shopping List action; guest prompt, existing-list selection, create-list offer when none exist |
| `/lists/:id/compare` | Backend-ranked complete branches/cheapest ties; expandable item costs and UTC observations; inactive/no-complete messages; named incomplete coverage; bottom availability reminder |

Root-stack screens use existing `PageHeader` and shopping-list fallback routes.
`headerTransparent:false` remains on the root stack; existing left/right/bottom
safe-area edges are preserved without adding another top inset. Forms scroll
inside a keyboard-avoiding container. Details opened from the picker refetch on
focus; comparison reloads on focus rather than maintaining an additional cache.
Missing/deleted IDs show safe errors with reload/navigation options.

## Authentication architecture and storage

- `AuthProvider` uses React context and `useSyncExternalStore` around a small
  injected session controller. There is no Redux or additional state library.
- Native opaque tokens use **Expo SecureStore 58.0.2**, matching the installed
  Expo SDK 58 `bundledNativeModules.json` recommendation (`~58.0.2`). The package
  and its config plugin are the only added runtime dependency/config integration.
  [Expo's SDK 58 SecureStore documentation](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)
  confirms Expo Go inclusion. No custom encryption or biometric requirement.
- Native storage saves only the token under a project key. Passwords and profile
  data are not persisted. iOS uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY` accessibility;
  native platform encryption remains the responsibility of SecureStore/OS.
- Browser sessions use memory only; they do not persist across reloads. The UI
  states this distinction. SecureStore has no web implementation, and no token is
  stored in localStorage/sessionStorage as an insecure substitute.
- Startup loads the saved token and calls `/auth/me`. A valid token restores the
  profile. Missing/corrupt/expired/revoked tokens produce guest/login state.
  Network/500 or response-validation failures preserve the stored token and show
  restoration retry/sign-out actions; guest browsing remains usable.
- Session generations scope protected requests and private rendering. Logout
  hides private UI immediately, aborts requests, serializes local storage deletion
  and attempts server revocation. Late data/401 responses from older sessions
  cannot overwrite or invalidate a newer login, even if abort is ignored.
- Only a current protected HTTP 401 invalidates the stored session. Invalid login
  credentials show a login error; unrelated server/network failures do not log out
  an authenticated user. Secure storage errors are reported safely. Partially saved
  or obsolete login tokens are removed and revoked on a best-effort basis.
- Offline logout clears local state and reports if remote revocation could not be
  confirmed. The existing server session still expires normally. Storage deletion
  failures explicitly request retry; success is not silently claimed.
- Tokens/hashes are never rendered or logged. Response readers construct safe
  profiles and reject malformed required fields; raw server error text is not shown.

## Shopping-list and comparison correctness

The shared T02 transport gained optional JSON writes, bearer headers and 204
handling. Existing catalog GET calls still carry no Authorization header. There is
no backend/auth/schema change. Private API wrappers use the documented endpoints
and validate response identity against the requested list/product/item.

Quantities count complete canonical packages and accept integer 1–999. POST adds
or increments; PATCH explicitly replaces. The app never assumes a POST quantity is
the new saved total: it displays the server response and reloads authoritative list
state after edits. Minus at one is disabled and a separate Remove product action
is visible. Removing an item does not remove its catalog product. Existing inactive
items remain visible/editable/removable and explain that they block comparison.
Only the public active catalog can be selected for additions, with server validation
still authoritative for concurrent activity changes.

The focused mutation controller blocks repeated submissions synchronously, before
a React disabled-state render. It aborts and rejects stale success/navigation on
blur/unmount. Existing focused resource generation guards handle debounced searches
and stale read responses. Confirmed writes update affected rows in place; per-row controls disable while pending and background reconciliation retains content. There
are no automatic retries of non-idempotent incrementing POSTs; network/timeout
messages instruct reload before repeating because a write may have committed.

Basket readers validate canonical identities/quantities, complete cost-line coverage,
money strings, exact-unit sorting, dense ranks, cheapest IDs, supported currencies,
activity outcomes, timestamps, demonstration metadata and missing-ID diagnostics.
BigInt is used only to validate exact ordering; no authoritative mobile conversion,
sum or total is computed. Displayed monetary values remain server strings.
Equal display cents are not treated as a tie when backend exact ranks differ.

Ranked cards show chain/physical branch, USD total, rank and every cheapest tie.
Expanded lines show product brand/name/variant/package, quantity, original unit
amount/currency, displayed USD unit/line values and UTC observation time. Incomplete
branches show named **missing price information**, with no subtotal or stock claim.
Inactive/no-complete outcomes provide explanations without a fabricated winner.
The demo label and unchanged freshness policy remain visible. The backend
availability notice is rendered **once at the bottom**, with a stable test ID.

## Executed automated verification

Environment: Windows PowerShell, Node 24.11.1, Expo SDK 58, MySQL 8.4.7 and headless
Chrome. These are actual executed results; no native/device test is implied.

| Command/check | Actual result |
|---|---|
| Initial mobile `npm test` (before UX follow-up) | **56 passed, 0 failed, 0 skipped** (all 31 previous T02 tests included) |
| Mobile `npm run typecheck` | Passed |
| Mobile `npm run typecheck:tests` | Passed |
| `npx expo install --check` | Dependencies up to date |
| `npx expo export --platform web --output-dir dist/web` | Passed; all new routes included |
| `npx expo export --platform ios --output-dir dist/ios-check` | Passed; iOS production JavaScript/Hermes bundle, not a signed app/device build |
| Mobile `npm run test:private-live` with disposable-server variables and `RUN_T03_BROWSER_TESTS=1` | **8 passed, 0 failed, 0 skipped** (parent plus 7 integration subtests) |
| Existing mobile `npm run test:browser` | **4 browser groups passed**, including T02 navigation, recovery and header geometry at three phone widths/landscape |
| Existing mobile `npm run test:live` | **6 passed, 0 failed, 0 skipped**, read-only owner catalog integration |
| Backend `npm test` with all database groups enabled | **91 passed, 0 failed, 0 skipped** |
| Backend `npm run typecheck`, `npm run typecheck:tests`, `npm run build` | Passed |
| Tracked/new-file Git whitespace checks | Passed |

Unit tests cover auth request bodies/errors, restoration, secure-storage failure
paths, logout/revocation, current/stale 401 handling, login/logout/storage races,
private response identity, all CRUD methods, POST versus PATCH semantics, quantity
bounds, inactive/empty items, broken response shapes, exact ties, equal rounded
cents with unequal ranks, incomplete coverage, demo metadata, no duplicate writes
and stale navigation suppression. Existing T02 tests retain their original scope.

### Real HTTP and rendered integration

`tests/private.integration.ts` starts Express on an ephemeral loopback port using
repositories injected with a **disposable MySQL schema**. It refuses port 3306 and
verifies `@@datadir` against the dedicated temporary server before any fixture DDL.
It imports copies of migrations/seed only there and drops its own schema in
`finally`. Owner application credentials and records are not used for writes.

The mobile service/session/contract modules use real fetch → Express → MySQL for
registration, bad/correct login, restoration, list creation/rename, duplicate
increments, quantity replacement, retrieval, comparison, other-user 404 handling,
removal/deletion and logout. Whole-record catalog snapshots remain unchanged.

With `RUN_T03_BROWSER_TESTS=1`, the same fixture serves the production web export
and launches Chrome at 390×844. A local same-origin proxy forwards writes only to
that verified ephemeral API, never the owner's port 3000. Actual rendered steps:

1. Register, enter a masked password, log in, and open the empty list tab.
2. Create/rename a list, select the 1.5 L Coca-Cola package, double-tap Add (one
   request accepted), add again, and see backend quantities 2 then 5.
3. Replace with quantity 2; add specifically Master Salted 90 g (product 13).
4. Compare and see USD 3.90, incomplete named coverage and one availability notice;
   expand original/converted costs and verification timestamps.
5. Remove a product; cancel and then confirm list deletion.
6. From Explore, open product details, choose Add to Shopping List with no existing
   lists, create/select a list, add the exact product and delete that test list.
7. Log out; protected list prompt replaces private data, while Explore still works.

No browser runtime exceptions were observed. The browser profile and disposable
schema/server are cleaned up after testing. Existing T02 browser/live suites only
read the owner's running catalog and change no records. The existing WAMP binary,
service, credentials, grants, global configuration and observation data are intact.

## Engineering review and corrections

- Protected responses are session-generation guarded in addition to AbortSignal;
  tests prove old 401/data cannot affect a later account.
- Review caught a logout failure continuation that could otherwise target a newer
  state; its generation is captured before awaiting local removal. A regression
  verifies the new account survives a delayed old logout failure.
- Serialized secure writes plus guarded deletion prevent a slow prior login save
  from resurrecting a logged-out session. A partial write followed by a native error
  now removes the token and attempts revocation, with explicit failure reporting.
- Private mutation readers now verify requested product/item/list identities.
  Equal rounded totals are validated against exact backend ranks, not retied locally.
- Live comparison exposed an unhelpful brand-free missing-product description;
  it now includes brand, variant and package. Picker accessibility labels also
  distinguish same-name variants. Salted/Barbecue packages were not equated.
- The browser harness was corrected for uppercase buttons, disabled controls and
  hidden retained-stack inputs. A variant-ambiguous test selector had selected
  Barbecue (product 14) and correctly received USD 3.95; it now explicitly selects
  Salted (13) and verifies USD 3.90. No price data or backend rule was changed.
- No unresolved blocking defect remains in the executed checks. Native runtime,
  keyboard and keychain behavior still require the acceptance steps below.

## Manual owner iPhone acceptance (approved)

The owner approved the functional and UX journeys listed at the top of this report.
The following checklist is retained for reproduction; additional edge-case steps
are guidance, not a claim that the owner separately enumerated every scenario.

No migration or backend environment change is needed. Preserve existing local
credentials and `.env` files. Start WAMP/Express as usual. Install mobile lockfile
dependencies and restart Expo so the new native package is available:

```powershell
# Terminal 1, repository root
cd backend
npm run dev

# Terminal 2, repository root
cd mobile
npm ci
npm start -- --clear
```

Use SDK-58-compatible Expo Go on the iPhone and the existing LAN API URL. Do not
open MySQL to the network. Physical device checklist:

1. As a guest, verify all five tabs, Explore search, package details, individual
   prices and supermarket browsing. Shopping List and Add to Shopping List should
   show login/register prompts while catalog browsing remains available.
2. Register a disposable test account. Try invalid/duplicate email and short
   password. Confirm successful registration asks for explicit login, then test
   wrong and correct credentials. Password entry must remain masked; no token/hash
   should appear in screens, errors or logs.
3. Fully close and reopen Expo Go/the app. Confirm the native stored session is
   restored through `/auth/me` and the profile/list ownership is unchanged. Test
   network-off restoration: it should offer retry without erasing the session;
   restore networking and retry. This native persistence check is not automated.
4. Create two lists, open/rename one and leave another empty. Confirm helpful empty
   messages, disabled empty comparison, scrolling, keyboard visibility and sensible
   back behavior. Try blank names and cancel a delete confirmation.
5. Add Coca-Cola **1.5 L × 2**, add the same ID with ×3 and confirm saved ×5.
   Replace its quantity with ×2. Check that 330 ml is a distinct package, not a
   substitute. Test 0, negative, fractional and >999 input rejection; minus at one
   must offer explicit removal rather than submit zero.
6. Add **Master Potato Chips, Salted, 90 g ×1 (ID 13)**. Compare: Carrefour Baabda
   USD 3.90 rank 1, Spinneys Beirut USD 4.20 rank 2, Spinneys Metn USD 4.50 rank 3;
   Jounieh must show missing price information for Master Salted 90 g, with no
   subtotal/rank. Review demo/freshness text and expanded item amounts/timestamps.
   Availability notice should appear only once, at the bottom.
7. From Explore product details, use Add to Shopping List, choose an existing list,
   and also verify the create-list offer with an account having no lists. Confirm
   inactive/missing/deleted records fail safely if encountered; do not edit the
   owner's catalog merely to create this case (isolated tests cover it).
8. Remove an item and confirm list deletion. Stop the backend briefly and test safe
   read retry/mutation errors, then restart. Reload before repeating timed-out
   writes; they may already have reached MySQL. Server errors must not erase login.
9. Log out. Private data should disappear immediately, server session should be
   revoked when reachable, reopening protected screens should require login, and
   guest catalog should remain usable. Log in with a second account and confirm
   it cannot see the first account's lists. Automated tests cover old-response races.
10. Check portrait/landscape, small screen, long product/list names, keyboard,
    safe areas and header separation on all new screens. The accepted T02 iOS
    header fix must remain intact. Record owner acceptance before marking T03 done.

## Reproducing isolated checks

Use [T03-A disposable-server setup](t03a-verification.md#reproducing-isolated-database-tests)
to start the separate MySQL instance on port 3308, without modifying WAMP services.
The intentional shared temporary datadir name remains `supermarket-t03a-mysql`.
With the production web export present, from `mobile/`:

```powershell
$env:T03_TEST_PORT = '3308'
$env:T03_TEST_DATADIR = Join-Path $env:TEMP 'supermarket-t03a-mysql'
$env:RUN_T03_BROWSER_TESTS = '1'
npm run test:private-live
Remove-Item Env:T03_TEST_PORT, Env:T03_TEST_DATADIR, Env:RUN_T03_BROWSER_TESTS
```

The test uses its own `t03c_disposable_tests` schema and refuses to overwrite an
existing one. Chrome is required only for the optional rendered subtest; override
`BROWSER_EXECUTABLE` if installed elsewhere. Never target the application instance.
Close/remove the dedicated temporary server following the setup instructions.

## Known limitations

- Codex has not performed physical-iPhone, native keychain persistence, biometric
  or signed iOS build verification. The owner's reported functional iPhone checks
  are recorded above, including final acceptance of the UX corrections. The iOS
  export is a JavaScript/Hermes compile check.
- Browser sessions are intentionally memory-only; native iPhone sessions persist.
- Native storage errors and offline logout cannot guarantee platform deletion or
  remote revocation; explicit messages/retry are provided. Backend expiry is unchanged.
- No optimistic locking for another device's simultaneous edits; responses reload
  authoritative data, PATCH remains an explicit replacement, and POST is incremental.
- Catalog search remains capped at 100; list/editor rendering targets the small
  capstone demonstration, without global cache/pagination/synchronization systems.
- Real pricing/freshness/source coverage and inventory are unchanged. No optimizer,
  routing, fuel, OCR, receipts, contributions, promotions, notifications or assistant.
- SecureStore was the only added dependency. Installation reported five moderate
  development-inclusive audit findings; production-only `npm audit --omit=dev`
  reported zero. No broad dependency/force-upgrade was performed.

## Changed files and repository status

Modified mobile files: `app.json`, `package.json`, `package-lock.json`, root
`app/_layout.tsx`, Profile/Shopping List tab screens, `app/products/[id].tsx`,
`components/CatalogUI.tsx`, `services/api.ts`, `services/contracts.ts`.

Added mobile files: `app/lists/[id].tsx`, `app/lists/[id]/{add,compare}.tsx`,
`app/products/[id]/add.tsx`, `components/{AccountUI,AuthProvider,BasketResults}.tsx`,
`hooks/useMutation.ts`, `services/{account-api,basket-presentation,mutation,
private-contracts,session,token-storage}.ts`, and
`tests/{private-fixtures,private-browser,private.integration,private.test,session.test}.ts`.

Updated docs: `README.md`, `docs/{api,architecture,decisions,frontend,roadmap}.md`;
added this report. Backend source/dependencies, database schema/migrations/seeds,
original requirements and local `.env` files are unchanged in T03-C.
Generated exports are ignored. T03-C and overall T03 are owner-accepted; the owner
has authorized this separate T03-C checkpoint on `main`. T04 is not implemented.

UX follow-up also modifies `hooks/useRemote.ts` and `services/resource.ts`; adds
`hooks/{useConfirmation,useProductActions}.ts`,
`services/{confirmation,list-state,product-actions}.ts` and
`tests/shopping-list-ux.test.ts`; and extends `tests/private-browser.ts`.
The list editor, both product-add screens and `components/AccountUI.tsx` contain
the corresponding targeted UI changes described above.
