# System architecture

**Status:** T01–T04 are complete and owner-accepted. The owner confirmed successful T04 physical-iPhone acceptance on 2026-11-17. T05 routing/fuel and T06 receipt OCR remain unimplemented.

## T04 optimization boundary

The existing owned, consistent basket snapshot feeds both optimization modes.
`basket/pricing.ts` constructs exact cost lines using the existing centralized
BigInt money utilities; both accepted comparison and optimization reuse it.
`basket/optimize.ts` validates canonical items, explicitly excludes inactive
products for T04, prepares branch/product cost maps, and evaluates bounded sets
of physical branches. Complete single branches retain exact ranks and all ties.
The generator exposes feasible allocations for multiple branch sets, including
more expensive sets, for future T05 travel evaluation. It has no HTTP, network,
database mutation or routing dependency. Duplicate candidate branch records and
duplicate persisted products fail closed rather than inventing quantities.

The authenticated GET route orchestrates snapshot retrieval and pure calculation.
Mobile account API/contract readers validate exact allocation reconciliation;
the root-stack optimization screen reuses AuthGate, useRemote, AccountPage and
nontransparent headers. List/account/maximum changes and focus reload invalidate
previous results. No dependency, new table, persisted optimizer result, routing
provider or paid service is introduced. See [T04 report](t04-verification.md).

## T03-C mobile integration

The existing five tabs remain. Profile hosts registration/login/logout; Shopping
List opens saved lists. Root-stack list editor, catalog picker, product-to-list
selector and basket comparison screens reuse the existing header/safe-area pattern
with `headerTransparent:false`. T02 catalog routes and guest behavior are preserved.

The existing API transport now also supports authenticated GET/POST/PATCH/DELETE
and empty 204 responses. Public catalog calls still carry no bearer token. Separate
private contract readers validate IDs, quantities, activity, timestamps, money
strings, complete coverage, exact-unit ordering, dense ranks and cheapest IDs.
The app displays server monetary strings and never calculates authoritative totals.

One small session controller plus React context/external-store subscription replaces
the need for a state library. Native tokens persist in Expo SecureStore 58.0.2;
only the token is saved, not passwords or profiles. Startup validates through me.
Browser sessions are memory-only because SecureStore has no web implementation.
Private rendering is gated and keyed by session generation; requests are aborted
and late continuations rejected on logout/account transitions. An old 401 cannot
invalidate a new login. Only current-session 401 clears an invalid credential;
unrelated network/500 errors preserve storage with retry support.

Focus-owned resource and mutation controllers reject stale results and prevent
repeat taps synchronously. Confirmed item responses update affected rows in place;
focus/manual reads reconcile list state in the background, without
optimistic quantity math or automatic retry of incrementing POSTs. A timeout may
have reached the server, so errors ask the user to reload before repeating a write.
See [T03-C verification](t03c-verification.md).

## T03-B basket calculation boundary

`modules/basket/repository.ts` batch-loads an owned list, its product details,
catalog branches and latest eligible price matrix in four SELECTs. Its transaction
sets REPEATABLE READ for that transaction only, acquires the parent `FOR SHARE`
lock, then establishes a consistent snapshot on the item read. The lock is
compatible with concurrent comparisons and blocks existing T03-A list mutations
until snapshot materialization commits. Product activity and prices are read from
that same snapshot. No migration, record writes or global isolation changes.

`modules/basket/compare.ts` is a pure single-branch coverage/ranking calculation.
Inactive required items block the whole comparison; missing eligible prices yield
unranked diagnostics without subtotals. Complete branches rank by exact totals;
branch ID breaks ordering ties and dense ranks expose equal totals. Only verified
seed observations qualify, with deterministic timestamp/ID selection. T03-B admits
both approved currencies; the T02 USD-only API remains unchanged.

`modules/shared/money.ts` centralizes the fixed 90,000 rate and uses BigInt common
units of 1/9,000,000 USD, exactly representing every existing DECIMAL(12,2) price.
Only display formatting rounds; calculation and ties stay exact. No new dependency.
Snapshot lookup and monetary primitives can support later T04 one-stop/exactly-two/
automatic modes without adding that optimizer now. See [verification](t03b-verification.md).

## T03-A backend boundaries

`modules/auth` owns password hashing, opaque sessions and reusable bearer middleware.
`modules/shopping-lists` owns private list/item routes and transactional SQL.
Both repositories are injected through the existing app factory; centralized errors
keep the existing `{status,message}` envelope. `modules/shared/validation.ts` provides
the small write-input validators. No dependency, mobile or catalog behavior change.

Passwords use asynchronous built-in Node scrypt with random salts, fixed versioned
parameters and timing-safe verification. Tokens contain 32 random bytes; only their
SHA-256 hashes are stored. Database UTC time defines a fixed seven-day expiry;
logout deletes the current session. Registration requires an explicit login.

Private routes derive users exclusively from sessions. Transactions lock an owned
list row before reads/mutations, serializing additions, quantity replacement and
deletion. Product shared locks prevent activity changes during additions. The unique
list/product constraint backs duplicate identity; application checks and SQL CHECKs
bound quantities to 1–999 whole registered packages. Existing inactive items remain
visible and editable/removable; adding inactive products is rejected. T02 endpoints
remain public. See [verification and migration instructions](t03a-verification.md).

T02-B implements the existing modular-monolith boundary in
`backend/src/modules/catalog/`: Express routes validate input and format public
responses; a repository owns parameterized SELECT queries. The repository is
injectable through the existing app factory for HTTP tests. Real MySQL tests use
read-only CTE fixtures without changing imported data. No framework, schema or
mobile architecture changes; health endpoints and centralized errors are reused.

T02-C/D/E extends the existing mobile service boundary with one GET client,
lightweight runtime contract readers and a screen-local request controller/hook.
Networking and validation remain separate from presentation. Routes use canonical
IDs; the Express repository alone selects eligible observations. No global state,
cache, ORM, framework or package dependency was added. Tests reuse the backend's
installed tsx/Node tooling; optional Chrome smoke tests use built-in Node APIs.
The T02-C/D/E backend correction classifies malformed URL parameters as HTTP 400.

T02-F additionally uses mysql2 `execute` for server-bound catalog values, keeping
SQL/DTOs/policies unchanged. A small injected SQL reader lets regression tests
exercise the actual production binding under different session SQL modes. Optional
blank images use placeholders. The read-only plan/metadata audit and backend test
typecheck add no dependencies. See [T02-F](t02f-audit.md) for environmental security
findings and **unapproved** T03 alternatives; authentication architecture has not
been implemented or changed by this audit.

Final T02 cleanup configures strict/date SQL modes and UTC on every pool checkout,
awaiting the session SET before lending a connection. The existing promise-pool
interface remains unchanged; setup failure discards that connection. Driver Date
conversion also uses UTC. No records, globals, credentials or architecture layers
change. See [cleanup verification](t02-final-cleanup.md).

## Purpose
Mobile-first Lebanese supermarket price comparison system, supporting branch-specific prices, receipt-sourced observations, shopping lists, and eventually route-aware multi-store optimization. Build a useful end-to-end MVP before optional sophistication.

## Confirmed stack
| Layer | Choice | Notes |
|---|---|---|
| Mobile | React Native + Expo + TypeScript | Expo Router planned for tab/stack navigation |
| Server | Node.js + Express + TypeScript | Modular monolith, REST JSON API |
| Data | MySQL (WAMP locally) | Use `mysql2/promise`, parameterized SQL, migrations |
| Maps / routes | Google Maps Platform | Intended; assess billing/quota before use |
| Receipt images | Local private server storage initially | Storage abstraction enables later cloud migration |
| Version control | Git + GitHub | Private repository recommended |
| Coding | Codex | Claude optional for independent code review |

## Future/investigational (not initial dependencies)
- Mobile authentication/storage: T03-C implements native SecureStore and session-scoped request isolation; the owner verified physical-iPhone persistence after restarting Expo Go. Backend scrypt and opaque sessions are unchanged.
- OCR: Google ML Kit on-device text recognition is the preferred free candidate; Expo development build/native package compatibility needs verification. If too complex, evaluate free Tesseract in backend. Extraction and product interpretation are separate steps.
- Assistant: postponed; OpenAI API can incur usage charges. A free/low-cost approach is to be evaluated after core features work.
- Routing: Google Maps pricing and billing may apply; no assumption of unlimited free use.

## Logical data flow
```text
React Native / Expo (screens, local UI state)
                  |
            HTTPS / JSON
                  v
Node.js / Express REST API
  auth  products  branches  prices  shopping lists
  receipts  validation  optimization  routing (later)
                  |
           parameterized SQL
                  v
             MySQL

Future external integration boundaries:
  ML Kit (mobile OCR) -> review -> API receipt submission
  Google Maps (route distance/detours) -> backend cost evaluation
  Assistant (natural language) -> controlled backend functions
```

## Design invariants
1. Frontend displays data; backend applies authoritative product identity, verification, permissions and optimization rules.
2. One product identity includes brand/variant/package size/units; different sizes are not interchangeable.
3. Prices refer to **branches**, not just chains; preserve observation source and time.
4. No new receipt price becomes automatically trustworthy solely due to OCR or user confirmation.
5. Unknown OCR products are matched manually from the controlled catalog; the user cannot freely change receipt prices.
6. Show currency and freshness; a missing or outdated price does not magically become a valid complete basket quote.
7. Build and test vertically after a small navigation shell: screen -> endpoint -> database -> tests.
8. Do not overfit to hypothetical nationwide coverage; begin with a small demonstration dataset, clearly labeled as such.

## Deployment boundary
WAMP/MySQL are local development services. Phones cannot use `localhost` to reach the PC backend; use a configured LAN URL for Expo development, with appropriate local firewall/network configuration. Use suitable backend + database hosting for any public deployment. Keep DB credentials server-side.
