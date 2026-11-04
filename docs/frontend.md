# Frontend screen map and requirements traceability

**Status:** proposed information architecture, not final visual design. Five tabs are a design choice, not five independent systems. Assistant entry point and routing screens come later.

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

## First prototype only
- Implement bottom tabs + simple Home / Explore / Shopping List / Receipts / Profile placeholders.
- Then deliver one complete flow: Explore -> Search Product -> Product Details -> Price Comparison using backend data.
- Do not build polished screens for every later requirement at once.

## Open UX decisions
- Guest browsing is **recommended but not confirmed**; UR-01 does not require login for browsing.
- Initial active list vs multiple-list controls, detail-screen presentation and brand styling are provisional.
- Price availability is only shown when reliable; otherwise use the explicit check-with-store caveat.
