# Architecture decision log

**Key:** CONFIRMED = explicitly selected by owner; RECOMMENDED = suggested but not separately approved; OPEN = deferred/needs validation. Entries are planning decisions, not implementation claims.

| ID | Status | Decision | Why / caveat |
|---|---|---|---|
| D01 | CONFIRMED | Build a mobile app with React Native + Expo + TypeScript | Cross-platform; prior React Native familiarity |
| D02 | CONFIRMED | Backend in Node.js + Express + TypeScript | Matches experience; clean business-logic boundary |
| D03 | CONFIRMED | MySQL via WAMP locally | Familiar SQL workflow; WAMP is development environment, not production hosting |
| D04 | CONFIRMED | Google Maps intended for routing | Billing/quotas must be checked before integration |
| D05 | CONFIRMED | Store receipt images locally first, migrate to cloud if needed | Keep storage swappable and private |
| D06 | CONFIRMED | ChatGPT handles planning, Codex implementation, Claude optional independent review | Shared docs and review checkpoints |
| D07 | CONFIRMED | Prefer achievable, minimal solutions; flag hard requirements and propose scope alternatives | Do not silently change formal URs |
| D08 | CONFIRMED | Controlled product catalog; simple normalization/aliases; unknown OCR matches require user selection | Avoid unnecessary ML/fuzzy matcher |
| D09 | RECOMMENDED | Five bottom tabs: Home, Explore, Shopping List, Receipts, Profile | Subject to UX review; global assistant later |
| D10 | RECOMMENDED | Modular-monolith Express API and three-tier separation | Simpler than microservices |
| D11 | RECOMMENDED | Email/password with server hashing (Argon2id), token/session design to finalize | User account required by UR-01; implementation details not final |
| D12 | RECOMMENDED | Free OCR using Google ML Kit, with Tesseract fallback | Test Expo native integration and real receipt accuracy; no per-call fee |
| D13 | OPEN | AI assistant model/provider | Postpone; OpenAI API may cost money |
| D14 | RECOMMENDED | Evaluate max two supermarket stops initially | Document any formal UR-18/UR-19 scope limitation and seek approval if needed |
| D15 | RECOMMENDED | Historical, branch-specific, source-linked price observations | Supports validation/traceability |
| D16 | OPEN | Guest browsing vs mandatory login | Guest browsing suggested, not owner-confirmed |
| D17 | OPEN | USD/LBP exchange rate source, rounding and rate timestamp | Needed before trustworthy mixed-currency comparisons |
| D18 | OPEN | Price freshness cutoff, trust/verification rules and promotion policy | Needed before real price recommendations |
| D19 | OPEN | Receipt storage retention/privacy/redaction, image quality/duplicate handling | Needed for receipts to meet UR-08 |
| D20 | OPEN | Advisor-approved scope simplifications and current spec wording | Formal URs remain authoritative until amended |

## New decisions protocol

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
