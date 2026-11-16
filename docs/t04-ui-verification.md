# T04-UI — Cosmetic mobile redesign

Implemented on `main` from accepted T04 commit
`d641660fd547db215baac853a671df77a6c8cf95`. Owner physical-iPhone acceptance
of this redesign is pending. Do not confuse the earlier T04 functional acceptance
with acceptance of these new visuals. On 2026-11-17 the owner explicitly authorized
saving the current redesign to `main` and pushing to GitHub, without claiming
physical-device acceptance.

## Scope and preservation

Presentation only: existing Express/MySQL code, migrations, observations, API
contracts, monetary arithmetic, optimizer, authentication/session logic, request
controllers, hooks, validation, list mutation coordination and dependencies remain
unchanged. Route destinations, action callbacks and business conditions remain.
New local state only controls disclosure of supporting presentation details.

The Home dashboard links to existing destinations without inventing list previews
or fetching more data. List overview shows the backend update timestamp; item
counts appear only on list details where actual items are already loaded. Catalog
categories come from existing product records. Product details do not prefetch
prices; comparison retains its existing identity/price requests. Missing product
images use a neutral package icon, with the existing image error fallback.

## Design system and screens

`mobile/components/Design.tsx` defines semantic colors, spacing and radii, native
system typography, primary/secondary/quiet/destructive buttons, icons, badges,
section headings, empty/loading states, callouts and accessible disclosures.
`CatalogUI` supplies consistent pages/cards, price typography and product identity;
`AccountUI` retains its existing keyboard/safe-area controllers with new fields
and notices. `ListActionButton` retains distinct busy versus permanent disabled
behavior: pending requests do not flash gray or replace their button labels.

The palette uses warm off-white, charcoal, forest green, white surfaces, restrained
amber cautions and red errors. Prices use tabular digits; content has a readable
maximum width. Buttons have at least 48-point height, steppers at least 48-point
width, readable labels and disabled semantics. Status has textual meaning as well
as color. Text scales normally; no decorative motion or blur is introduced.

Redesigned screens: Home, Explore, Profile login/registration/authenticated state,
shopping-list overview/create, list editor/rename/delete/quantity controls, list
product picker, product details, product-to-list picker, product branch prices,
supermarket/branch directory, basket comparison, basket optimization, guest auth
gate and the existing Receipts future-milestone notice. There is no new receipt
functionality or additional placeholder navigation.

Five tabs and all stack routes remain. Header backgrounds are opaque and retain
`headerTransparent:false`; content retains existing safe-area edges and keyboard
handling. Tab material uses near-opaque white, a subtle separator and muted/active
icons without absolute positioning or content-obscuring floating controls.

The appearance stays consistently light, matching the existing `app.json` setting.
The glass-inspired surfaces are React Native visual approximations, **not native
Apple Liquid Glass**. Installed project dependencies do not include `expo-blur`
or `expo-glass-effect`, even though the SDK's compatibility manifest lists them.
No new native module, installation, paid service or development build is required.

## Information hierarchy

List basket actions precede product cards; name settings follow the items.
Quantity input, +/- controls, Save quantity and Remove product remain available.
Optimization uses selected 1/2/3 maximum controls and prominent exact-derived
server totals, with single/multi results and incomplete branches kept separate.
All allocations retain full package identities and quantities. Supporting original
amounts/timestamps/simulated status are available through labeled disclosures.
Demo labeling, unknown stock and fuel exclusion remain visible; older/future price
cautions appear beside allocated items. The original full availability notices,
data labels, exchange-rate policy and rounding explanations are preserved.

## Verification and visual review

### GitHub save verification — 2026-11-17

Before the owner-authorized commit, all 27 files were reviewed again. No unrelated
changes, secrets, temporary files or generated artifacts were found in the intended
source set. Backend, database/migrations, API services/contracts, authentication
controller, hooks and dependency/configuration files still match accepted T04.
The callback syntax audit again passed for all 14 route/layout files.

Reran mobile tests (79 passed), backend tests with every database opt-in (114
passed), private integration with rendered browser checks (9 passed), public API
integration (6 passed), and all four public browser smoke groups. There were no
failures or skipped tests in those suites. Both projects' source/test TypeScript
checks, backend production build, all-platform Expo export, separate web export
and whitespace checks passed. No implementation fix was needed. Only documentation
was updated during this save task to record commit/push authorization; physical
iPhone/Android acceptance remains pending.

### Implementation verification

Baseline: 79 mobile tests passed; default backend tests passed 70 with three
explicit opt-in groups skipped. Final commands and results are recorded below.
No package, backend, database, service or hook files were changed.

| Final check | Actual result |
|---|---|
| Backend `npm test`, all disposable DB/catalog opt-ins enabled | 114 passed, 0 failed, 0 skipped |
| Mobile `npm test` | 79 passed, 0 failed, 0 skipped |
| Mobile `npm run test:private-live`, browser enabled | 9 passed, 0 failed, 0 skipped |
| Mobile `npm run test:live` | 6 passed, 0 failed, 0 skipped |
| Mobile `npm run test:browser` | All four existing smoke groups passed, plus new disclosure/overflow/tab-label assertions |
| Database `node database/tests/catalog.test.cjs`, isolated schema | 12 checks passed |
| Backend `npm run typecheck`, `npm run typecheck:tests`, `npm run build` | Passed |
| Mobile `npm run typecheck`, `npm run typecheck:tests` | Passed |
| `npx expo export --platform all` | iOS, Android and web passed |
| `npx expo export --platform web --output-dir dist/web` | Passed |
| Read-only TypeScript syntax audit of existing screen action callbacks | All 14 modified route/layout files preserve existing callbacks |
| `git diff --check` | Passed |

Run backend opt-ins with `T03_TEST_PORT=3308`,
`T03_TEST_DATADIR=%TEMP%/supermarket-t03a-mysql`, and `RUN_CATALOG_DB_TESTS=1`.
Run private browser integration with the same disposable database variables plus
`RUN_T03_BROWSER_TESTS=1`. Public live/browser checks used
`LIVE_CATALOG_API_URL=http://127.0.0.1:3011/api`. Schema checks used a separate
temporary schema on the disposable server; the application's database was not
migrated or modified. The callback audit compared `onPress`, `onChangeText`,
`onSubmit` and `onRefresh` expressions with committed T04 via TypeScript syntax
trees. The sole added screen action is Home's link to the existing list route.

Browser tests preserve original behavioral assertions, including stable row/node
identity, no redundant detail requests, duplicate-write prevention, fixed quantity
row height at the lower bound, pending-button colors/labels and private logout.
Additional assertions exercise disclosure access and horizontal overflow. Screen
captures are written only to ignored `mobile/dist/`, with disposable browser
accounts/prices isolated from the application database.

Early browser runs exposed missing explicit disclosure labels; those were fixed.
Screenshot review also prompted moving list settings below product cards and
reducing the notice above optimization recommendations. A subsequent review
corrected clipped tab labels by reserving explicit safe-area-aware tab height and
compacted maximum-branch controls to reveal the single-store price earlier.
Both browser suites passed after those final changes. Original behavior assertions
were retained; no regression tests were deleted or weakened.

Visually inspected captured Home, login, Explore, shopping-list editor,
optimization and supermarket directory screens. Automated product/directory
header/overflow checks cover 320, 390 and 430 pixel widths plus 844-pixel landscape;
optimization overflow/screenshots cover 320, 390 and 430 pixels. Tab label geometry
is checked on the captured tab screens at 390 pixels. Long product content remains
scrollable at 320×400. These are browser measurements, not native safe-area proofs.

Screenshots remain in ignored `mobile/dist/ui-*.png` and
`mobile/dist/t04-optimization.png`. No screenshot, export, log, test credential or
temporary SQL fixture is included in the source changes. All 27 changed/new files
are limited to 14 route/layout files, eight presentation components, two browser
test files and three documentation files. The owner authorized committing only
these files on `main` with message
`feat: redesign mobile UI with modern Apple-inspired styling`, followed by a normal
push to `origin/main`. The final delivery report records the commit and Git state.

## Owner iPhone acceptance

1. Start the existing backend and Expo Go setup. Check all five tabs, back navigation,
   header separation, scrolling and larger system text on your iPhone.
2. Register/login, use the keyboard on both forms, restart Expo Go to check secure
   session persistence, then log out and verify that private lists disappear.
3. Search by name and alias, clear the query, open details and branch prices,
   expand demo information and check supermarket/branch addresses.
4. Create/rename a list; add packages; increase, decrease, type/save quantities;
   remove an item and cancel/confirm list deletion. Check for flashing or scroll jumps.
5. Compare and optimize a nonempty list; choose maximum 1/2/3; expand observations;
   check totals, savings, missing items, freshness, demo/stock/fuel notices and refresh.
6. Stop/restart the backend to check errors and retries. Confirm no old results
   remain after failed optimization or account changes.

No migration, phpMyAdmin import, dependency installation or new environment setting
is required. Physical iOS/Android keyboard, safe-area, VoiceOver/TalkBack and device
performance remain manual acceptance items; web geometry and exports do not prove
native device behavior. Native glass and dark mode are not implemented. T05/T06
remain untouched. Saving progress to GitHub does not imply physical-device acceptance.
