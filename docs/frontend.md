# Frontend screen map and requirements traceability

**Status:** T02–T04 are complete and owner-accepted; successful T04 physical-iPhone acceptance was confirmed 2026-11-17. Other future features in the map remain planning guidance.

## T04-UI cosmetic redesign — awaiting owner acceptance

The mobile presentation now uses shared forest-green/neutral tokens, structured
cards, native system typography, prominent prices and consistent touch targets.
All existing screens and five tabs are restyled; APIs, hooks, services, request
coordination and backend logic are unchanged. Supporting price details use labeled
disclosures while demo, freshness, stock and fuel caveats remain accessible.
Opaque headers preserve the accepted safe-area arrangement. Light appearance and
glass-inspired React Native surfaces add no native dependencies. See the
[redesign report and iPhone checklist](t04-ui-verification.md). The owner authorized
saving this redesign to GitHub on 2026-11-17; physical-device acceptance remains pending.

## Implemented T04 flow

The saved-list editor opens **Find Cheapest Basket**, a root-stack screen using
the accepted header/safe-area convention. Maximum-branch buttons offer 1, 2 or 3,
default 2; buttons wrap on narrow screens. Complete single branches rank by exact
cost; incomplete branches show named missing package prices separately. The split
option groups quantities, exact-derived display amounts, branch subtotals and
potential merchandise savings. One-store zero-saving solutions remain valid.
Without a complete single baseline, savings are explicitly unavailable.

Each selected line shows source amount/currency, observation date, simulated
verification, package identity and freshness caution. Visible demo, stock and
fuel exclusions prevent shelf-price or overall-savings claims. Inactive items
are excluded and named without deleting them; an entirely inactive/empty list
has no recommendation. This T04 behavior differs explicitly from accepted T03
Compare Basket, which continues to block inactive products.

Focus reload, manual refresh, retries, account/list/maximum keys and the existing
generation/abort controller prevent late responses replacing current results.
Failures clear optimizer results. Session 401 uses existing logout handling.
No new native dependency is needed; iOS/Android export checks are automated.
The owner confirmed successful physical-iPhone acceptance on 2026-11-17.
Physical Android acceptance has not been reported.

## Implemented T03-C flow (owner accepted)

- Profile: register (display name/email/password), explicit login after registration,
  logged-in profile, logout, session restoration/retry and safe status messages.
- Shopping List tab: saved lists, empty/error/loading states, create/open/reload.
- `/lists/:id`: item/package identities, inactive labels, explicit quantity editor,
  increment/decrement controls bounded 1–999, remove, rename, confirmed list deletion,
  add products and nonempty-list Compare Basket.
- `/lists/:id/add`: existing server catalog search with debounce/cap, package-aware
  picker and quantity to add. Duplicate POST follows backend increments; saved
  quantities come from responses. Accessibility labels distinguish variants/sizes.
- `/products/:id/add`: product-details Add to Shopping List action, authenticated
  list choice and create-list offer when none exist. Guest users see a login prompt.
- `/lists/:id/compare`: backend ranks/cheapest ties, string-valued USD totals,
  expandable original/converted unit and line cost details with UTC observations,
  inactive/no-complete explanations, named missing coverage, demonstration label
  and a single availability reminder at the bottom. No mobile basket calculation.

The five-tab structure, T02 screens and `headerTransparent:false` are preserved.
Keyboard-aware forms/scrolling and native stack insets are used without an extra
top safe-area offset. Private screen trees remount for session generations and
hide immediately on logout; focus changes cancel obsolete loads/writes. See
[device checklist](t03c-verification.md).

Owner iPhone functional tests passed, with header overlap found on Product Details
and Supermarket Browsing. The root stack now uses `headerTransparent: false`;
native navigation owns the top inset while existing left/right/bottom safe areas
remain unchanged. No extra top padding or automatic scroll inset is added. The
tab layout is unchanged. The owner verified both corrected layouts on the iPhone;
see [the layout-fix record](t02cde-verification.md#2026-11-07--owner-iphone-header-layout-correction).

## Implemented catalog flow

Five existing tabs remain. Home retains the backend/database check and adds
Browse Products and Browse Supermarkets. Explore (`/(tabs)/explore`) uses a
virtualized catalog from `/api/products`, with 350 ms debounced server search,
trimmed/encoded input, a 255-character bound, clear, retry and pull-to-refresh.
Each card displays brand/name/variant/package identity and navigates by canonical
ID. No price requests occur while browsing. Optional missing/failed images use a
placeholder. At most 100 products are requested; a cap notice asks users to narrow
search when 100 rows return. No unsupported pagination is invented.

Root-stack routes (no additional bottom tab):

| Route | Data | Behavior |
|---|---|---|
| `/products/:id` | Product detail by ID | Full package identity, Compare branch prices |
| `/products/:id/prices` | Product detail + comparison in parallel | Server order, all exact minimum ties, observation dates, demo/freshness/availability metadata |
| `/supermarkets` | Chains with nested branches | Chain/branch names, optional address, nullable coordinates, no maps |

Use `router.navigate` to avoid unnecessary duplicate entries. Headers go back
through the existing stack; a direct link without history returns to Explore
(or Home for supermarkets). Back to Explore preserves input; refocusing refreshes
from the backend. Invalid route IDs perform no fetch; absent/inactive records show
a safe error and retry/back recovery. Shopping List, Receipts and Profile remain
placeholders with no misleading new feature actions.

`services/api.ts` centralizes GET, safe errors, a 10-second deadline covering
headers/body, cancellation and JSON parsing. `services/contracts.ts` validates
unknown responses before rendering. Decimal strings stay strings; amounts are
never calculated with floating point. Server ranking is preserved, unexpected
unsorted/duplicate/malformed comparisons fail closed, and all tied first-price
amounts receive the same lowest-displayed label. Missing amounts are never zero.

`hooks/useRemote.ts` owns one `services/resource.ts` controller per screen.
States distinguish idle/loading/loaded/empty/error/refreshing. Refresh retains
only the same record while loading; failure is an error, not empty success.
Focus/key changes immediately invalidate request generations (including the
debounce window); cleanup aborts requests and timers. Late ignored aborts cannot
publish state after blur/unmount or overwrite a new request. No global store or
cache is introduced. API demo booleans drive wording, observed timestamps are
shown in UTC, freshness is not evaluated, and availability says Check with store.

See [T02-C/D/E verification](t02cde-verification.md) for exact automated results,
the engineering audit, limitations and the required iPhone checklist.

T02-F extends optional-image validation to blank strings and strengthens browser
coverage to prove server search completion, absence of catalog price prefetch,
connection-reset recovery and multiple tied labels. The state/navigation design
remains unchanged; [T02-F](t02f-audit.md) records current results and T03 proposals.

## Navigation

The mobile shell targets Expo SDK 58. Its existing JavaScript tabs, screen files, and styles are preserved. Web output is explicitly client-only (`single`) to avoid SDK 58's new Router server-output default. See [migration verification](expo-sdk-58-migration.md).
| Bottom tab | Screens and actions |
|---|---|
| Home | Search shortcut -> Explore; My List; Scan Receipt; Optimize Shopping; Browse Supermarkets |
| Explore | Search and categories; Product Details; branch-specific Price Comparison; Supermarket/Branch Details |
| Shopping List | List selection/edit; Add/Remove/Quantity; Basket Comparison; Optimize Shopping; Journey and Preferences; Results |
| Receipts | History; Scan/Upload; Review OCR and choose unmatched catalog product; Submit; Result/status |
| Profile | Register/Login/Logout; Favorites; Price Alerts; Contributions; Vehicle and Shopping Preferences |

## Screen/action -> requirement map
| Requirement | Screen or system area | Visible entry / behavior |
|---|---|---|
| UR-01 | Profile / auth | Register, Log in, Log out; personalized list/alerts |
| UR-02 | Product/Branch Details, Profile | Favorite toggle, Favorites page |
| UR-03 | Explore | Search input, category and brand filters |
| UR-04 | Product Details | Brand, size, unit, variant; product identity |
| UR-05 | Product Details | Branch-specific price table, cheapest verified, last updated, availability caveat |
| UR-06 | Product Details, Profile | Set/edit/delete alert, Alerts page |
| UR-07 | Receipts | Scan / Upload image |
| UR-08 | Receipt Review + backend | Quality, duplicate/privacy warning and submission feedback |
| UR-09 | Receipt processing | Background OCR + extracted fields displayed |
| UR-10 | Receipt Review | Correct permitted descriptive fields, select product, Confirm (no free price editing) |
| UR-11 | Receipt Review + backend | Known aliases auto-match; branch selection; unresolved -> catalog picker |
| UR-12 | Backend + status | Flag suspicious prices; promotion/conflict handling; explanation when pending |
| UR-13 | Comparison and Receipt Details | Verification/freshness badge |
| UR-14 | Receipt Details + backend | Link price observation to source receipt |
| UR-15 | Receipt Result | Savings highlight only with reliable alternatives |
| UR-16 | Product Details / Profile | Contribute Price, Report Price, View Price History, My Contributions |
| UR-17 | Shopping List | Compare Basket |
| UR-18 | Optimization | Evaluate one vs multiple stops |
| UR-19 | Optimization Preferences | Max stops, max detour, cost/convenience preference |
| UR-20 | Optimization | Location permission or manual origin/destination |
| UR-21 | Journey Input | Origin/Destination, review interpreted natural-language trip (later) |
| UR-22 | Optimization Results | Route options, detour, grocery/travel breakdown |
| UR-23 | Global assistant entry (later) | Ask Assistant |
| UR-24 | Profile -> Vehicle Settings | Fuel type, average consumption, fuel price source/date |
| UR-25 | Optimization Results | Ranked total cost, recommended qualifying option |
| UR-26 | Explore -> Supermarket Details | Chain, branch, location, map |
| UR-27 | Backend/admin/source integrations | Receipts, online source when available, validated user contribution; no separate user button required |
| UR-28 | Comparison/Optimization Results | Price, currency, branch, dates, status, travel, total, missing item marker |

## T01 prototype sequence (historical)
- Implement bottom tabs + simple Home / Explore / Shopping List / Receipts / Profile placeholders.
- Then deliver one complete flow: Explore -> Search Product -> Product Details -> Price Comparison using backend data.
- Do not build polished screens for every later requirement at once.

## Open UX decisions
- T03-C preserves guest T02 browsing and implements native secure token storage and logout/account request isolation; physical-iPhone acceptance includes persistence after restarting Expo Go.
- Initial active list vs multiple-list controls, detail-screen presentation and brand styling are provisional.
- Price availability is only shown when reliable; otherwise use the explicit check-with-store caveat.
