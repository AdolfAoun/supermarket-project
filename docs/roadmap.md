# Implementation roadmap

On 2026-11-07 the owner confirmed successful physical-iPhone testing, including
the corrected Product Details and Supermarkets headers, and approved the complete
T02 milestone. See the [acceptance record](t02cde-verification.md#2026-11-07--final-owner-acceptance).

**Status:** T01–T04 are complete and owner-accepted. The owner confirmed successful T04 physical-iPhone acceptance on 2026-11-17. T04 supersedes the earlier two-stop-only boundary with a configurable maximum of 1–3 branches (default 2). T05-B retains T05-A import/GPS and adds standalone list-independent road discovery/basic navigation, optional basket prices and stabilization, pending owner acceptance. T05-C fuel/basket integration, T05-D final multi-store polish and T06 have not started. See [T04 acceptance](t04-verification.md) and [T05-B checks](t05b-verification.md).

T05-B2 data preparation is implemented with an offline HOT/OSM snapshot, review
queue and approval-gated importer; application import/migration and physical-device
acceptance are pending. It does not begin T05-C. See [data expansion](t05b2-data-import.md).

## Working method

T04-UI is a separate cosmetic redesign awaiting owner physical-iPhone acceptance;
it does not reopen the accepted T04 algorithms or begin T05. See the
[UI verification and acceptance checklist](t04-ui-verification.md).

- Start with a small app shell and API health checks.
- Build **vertical slices**: UI -> Express -> MySQL -> tests. Do not design all 28 production screens before one working flow.
- Use a controlled 30–50 product demonstration catalog and a handful of illustrative branches/prices initially. Label data as demo and never imply it is current real store pricing.
- At each milestone: run app, tests and manual acceptance checks; review changes; commit; update docs and task status.

## Milestones
| ID | Milestone | Scope | Acceptance criteria | Status |
|---|---|---|---|---|
| T01 | Repo/app/server foundation | Expo Router tabs; Express TS; MySQL config; health/db check; docs; secrets hygiene | Mobile launches, backend responds, DB check succeeds, tests run or blockers documented | Complete; manually verified by owner |
| T02 | Catalog and price comparison | Core 5 tables, seed data, product search/detail, verified branch prices and timestamps | Search -> product -> branch comparison works end to end; missing/invalid data handled | Complete; owner-approved 2026-11-07 after successful physical-iPhone testing, including corrected headers |
| T03 | User accounts and lists | Simple email login; list CRUD; basket comparison | User lists persist; totals calculated only for complete eligible baskets | Complete; T03-A/B/C owner-approved, with final physical-iPhone acceptance on 2026-11-09 |
| T04 | Shopping basket optimization | Up to 1, 2 (default), or 3 physical branches; complete single-store ranking, split allocations, freshness and missing-data treatment | Exact eligible merchandise optimum within the selected maximum; quantities/savings reconcile; mobile results and refresh work | Complete; owner physical-iPhone acceptance confirmed 2026-11-17; see T04 report |
| T05 | Journey-aware supermarket shopping | A: Maps import/GPS foundations; B: OSRM/corridor/detours/slider/basic navigation; C: fuel and basket integration; D: final multi-store optimization/polish | Real road estimates, honest price coverage, total detour limits and no Google billing | T05-B implemented, owner acceptance pending; C/D not started |
| T06 | Receipt OCR and contribution | Free OCR candidate, photo/upload, review/match/catalog picker, duplicate/quality/privacy checks, protected price submission | Known alias matched; unknown product manually chosen; suspect price not auto-verified | Not started |
| T07 | Supporting functions | Favorites, alerts, history, price reports, savings highlight | Each mapped requirement gets a documented acceptance check | Not started |
| T08 | Natural-language assistant | Evaluate affordable/free design and supported requests | Uses actual backend facts; no invented prices; costs approved first | Not started |
| T09 | Testing and demo readiness | Security, UX, integration, performance, offline/error handling, docs and coverage | Critical journeys demonstrated; unresolved requirement gaps explicitly documented | Not started |

## First Codex task: T01 (project initialization only)
1. Inspect repository; respect any existing files.
2. Scaffold `mobile/` with Expo + TS + Expo Router, five **placeholder** tabs.
3. Scaffold `backend/` with Node.js + Express + TS and modular entrypoint.
4. Set up MySQL pool using `mysql2/promise`, `.env.example` and a safe DB health check. Do not create business tables in T01.
5. Expose `GET /api/health` returning `{ "status": "ok", "message": "Backend is running" }` and `GET /api/health/db` with safe status only.
6. Add backend error handling, local-only CORS defaults, minimal tests, `README` run instructions, and ignore rules.
7. Run checks possible in the working environment; give owner commands for WAMP, backend, Expo and device connectivity. **Do not claim database tests passed if WAMP is unavailable.**
8. Never commit `.env` files or passwords; do not publish sensitive data.

## Risk register / priorities
- **High:** Real price coverage/freshness and branch identification; begin with seeded demo data, then receipts.
- **High:** Receipt OCR quality across formats; test real sample receipts and support manual catalog selection.
- **Medium:** Multi-currency conversion and presentation; document exchange-rate policy before real price comparison.
- **Medium:** Maps billing/quotas; no unapproved paid integration.
- **Medium:** Formal requirements vs reduced MVP; obtain advisor approval for changes that materially reduce scope.

## Definition of done for each feature
- Required screens/buttons and backend functionality work; server validations are tested.
- Clear handling of empty, invalid, missing and stale data.
- Credentials are protected; docs reflect reality; relevant tests and commands are reported.
