# T02-F system audit and T03 readiness

Date: 2026-11-06. Audit, corrective work and the checks below have been performed.
**T03 is not implemented. T02 owner/iPhone acceptance was pending at this audit checkpoint.**
Final update 2026-11-07: the owner accepted complete T02 after physical-iPhone
verification, including the corrected headers; see [acceptance](t02cde-verification.md#2026-11-07--final-owner-acceptance).
This report supplements, rather than replaces, the historical T02-A/B/C/D/E
verification reports. A passing desktop test is not a physical-device result.
Update 2026-11-07: [final T02 cleanup](t02-final-cleanup.md) resolves F06's
application-session configuration gap with strict/date modes and UTC on every
checkout. Historical findings/counts below describe the earlier audit. Other
environment observations were left unchanged, not reaudited during cleanup.

## A. System health assessment

The existing demo flow remains functional: MySQL → Express → JSON → validated
mobile data → catalog/details/comparison/branches. Queries preserve package IDs,
history, USD-only seed eligibility, verification metadata, UTC observation dates
and explicit demonstration/availability limitations. There is no current-price,
stock or complete-basket claim. No architectural rewrite is needed for T03.

The foundation is **conditionally ready for T03 design**, not for production
accounts: local database privileges/network exposure need owner review, and the
authentication/session and basket-quality decisions below remain unapproved.
No critical active defect was identified by this review, but these checks are not
a security certification or proof that no other defects exist.

Inspection covered AGENTS.md, requirements, architecture, frontend/database/API
contracts, decisions, roadmap, setup/migration/seed SQL, verification reports,
backend routes/repository/configuration/error handling and tests, mobile services,
validators/controllers/hooks/components/navigation, and browser/live tests.
Existing uncommitted T02-B/C/D/E work was present and preserved.

## B. Defects and significant findings

| ID | Severity / evidence | Outcome |
|---|---|---|
| F01 | Medium; security-sensitive under a changed SQL mode. Catalog `pool.query` interpolated escaped values client-side. On a disposable connection with `NO_BACKSLASH_ESCAPES`, a valid quote/backslash value produced `ER_PARSE_ERROR`. Existing tests exercised only the default mode and a mocked reader. | Reproduced with a failing integration test, then replaced with server-bound `execute` parameters. Real search, malicious-looking literals, round-trip value fidelity and bound LIMIT now pass in that mode. No active exploit in the current `IGNORE_SPACE` configuration was demonstrated. |
| F02 | Medium. The schema permits an empty optional `image_url`, but `image()` called nonempty-text validation before URL fallback, rejecting the whole product/catalog response. | Added empty/whitespace cases to the existing test, observed failure, then made blank optional strings use the same null placeholder as absent/unusable URLs. Malformed required data still rejects. |
| F03 | Medium test-quality defect. Browser search could click a product already present in the unfiltered catalog, passing even if the debounced request had not completed. | Wait for exactly the two matching cards, assert the real proxy request contains `search=coca`, and assert no price-prefetch requests during browsing. |
| F04 | High environment risk, unresolved. The configured app account has database-scoped `CREATE`, `DROP`, `INDEX`, `ALTER` in addition to DML, exceeding the documented application privilege boundary. | Reported for owner/admin correction; no grant or credential changes. A compromise would have a larger integrity impact, including schema/history loss. The account is not root and no global administrative grants were observed. |
| F05 | High environment exposure concern, unresolved. OS listener inspection found MySQL port 3306 listening on IPv4/IPv6 wildcard interfaces. | This does **not** prove public reachability: firewall/router rules were not assessed. Owner must verify loopback binding/network restrictions. No listener/firewall/service setting was changed or port opened. |
| F06 | Medium T03 prerequisite. Audited application sessions reported `sql_mode=IGNORE_SPACE` and `time_zone=SYSTEM`. | Current SELECT-only UTC-convention observations are unaffected. Future writes must explicitly use strict SQL mode and UTC; import-session settings do not configure the Express pool. No global/session defaults of the owner's existing services were changed. |

F01 is independent of matching/price policies: the same fixed SQL and values now
travel through prepared binding. This follows the separation recommended by
[OWASP SQL injection guidance](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html).

## C. Corrections and affected files

- `backend/src/modules/catalog/repository.ts`: extract the existing small SQL
  adapter as `createSqlReader`, with injectable `execute`, prepared parameters
  and the existing five-second query timeout. SQL predicates/order/DTOs unchanged.
- `backend/tests/catalog-db.test.ts`: fixture adapter now uses `execute`, plus
  the production-reader SQL-mode regression. Only an isolated connection's mode
  is changed; that connection is destroyed instead of returned to the pool.
- `mobile/services/contracts.ts`: accept blank optional image strings as missing.
- `mobile/tests/contracts.test.ts`: extend the existing optional-image regression
  without inflating the test count.
- `mobile/tests/browser.smoke.cjs`: stronger search/no-prefetch assertions, actual
  socket-reset recovery, and rendered tied-minimum labels using proxy-only data.
- `backend/scripts/audit-catalog.ts`: reproducible SELECT/EXPLAIN/metadata audit;
  logs counts, plans and capability names, never credentials or account identities.
- `backend/tsconfig.tests.json`, `backend/package.json`: typecheck backend tests
  and the audit script as well as production code; no dependency changes.
- Documentation: this report, README, frontend/API/database/architecture docs,
  decisions and roadmap; the prior C/D/E report gets a link to the newer audit.

No production tables, migrations, indexes, source records, authentication routes
or T03 code were added. Existing credentials, local environment files, formal
requirements and dependency lockfiles were not modified.

## D. End-to-end integrity and scenario review

| Scenario | Verified behavior / evidence |
|---|---|
| A: multiple verified observations | SQL filters eligible rows first, then ranks by observation timestamp descending. An earlier cheaper observation does not win. Real MySQL CTE fixtures verify this. |
| B: equal timestamps | Higher observation ID wins deterministically. A same-time 1.50/1.60 fixture selects the higher-ID 1.60 record, not the cheaper one. |
| C: newer pending | Pending/flagged/rejected rows do not displace the verified USD seed candidate. The UI calls the returned time Observed, never latest observation overall. |
| D: no eligible data | Existing product returns `prices: []`; mobile shows a meaningful empty state, no winner and no zero substitution. |
| E: equal minima | Decimal-string equality against the first backend-ranked amount labels every exact tie. Pure contract/presentation tests and the strengthened rendered browser scenario verify two labels. |
| F: package distinctions | Products have distinct canonical IDs including size/unit/pack quantity/variant. `WHERE product_id=?` precedes ranking, so another package's history cannot enter it. Product 1/2 fixtures and live 1.5 L/330 ml reads verify isolation. |
| G: currencies | SQL restricts verified USD seed observations before ranking; newer LBP/manual/online rows are excluded. The mobile contract rejects an unexpected currency instead of converting or sorting it. |
| H: historical verified | January 2026 UTC timestamps remain visible with simulated verification and freshness-not-evaluated metadata. No cutoff is invented. |
| I: branch information | Four database FKs connect aliases/products, branches/chains and prices/products/branches. Metadata targets match; zero orphan price joins were found. Normal writes cannot reference missing parents. Mobile rejects missing/malformed required branch IDs/names and duplicate branches. |
| J: money precision | MySQL DECIMAL → JSON two-digit decimal string → validated string → display stays exact. No floating-point price ranking, sum or conversion occurs. Numeric/negative/zero/exponent/overprecision strings reject. |

Product-list `EXISTS` prevents duplicate products from matching several aliases;
normalization matches generated alias keys and deterministic SKU/ID ordering is
preserved. Partial search is discovery only, not automatic product equivalence.
Inactive products are excluded from list/detail/price API routes; details/prices
return 404. The repository's internal price method assumes its route has checked
the product; future private-list handling must deliberately define inactive-item
behavior instead of bypassing that guard accidentally.

The imported counts remain **36 products, 12 aliases, 3 supermarkets, 4 branches,
125 observations**. Information-schema inspection matched all four FK targets,
five primary keys, four unique constraints, CHECK counts and existing index
columns. This audit did not rerun destructive/invalid-insert schema probes against
the application database; the earlier T02-A write-constraint verification remains
historical evidence, not a new test result.

## E. Query plans, performance and scaling limits

Run from `backend/`: `npx tsx scripts/audit-catalog.ts`.
The tool collects ordinary EXPLAIN plans, not timing benchmarks or EXPLAIN ANALYZE.
Estimated rows below describe the small imported dataset, not measured large-scale
performance. Optimizer choices may change with statistics and dataset size.

| Read | Observed MySQL 8.4.7 plan |
|---|---|
| Browse and `coca` search | `products` ALL scan, estimated 36, where/filesort; correlated aliases use `idx_product_aliases_product`, estimated one alias per probe. |
| Detail | Primary-key constant lookup, estimated one row. |
| Comparison | Product-scoped `idx_prices_product_branch_status_time` read, estimated nine observations; window/order sorts; branch/chain joins use primary-key `eq_ref`. |
| Chains/branches | Chain name index scan and chain/name branch index lookup; final ordering uses temporary/filesort work. |

Normalized `LOCATE` substrings are not B-tree range searches. A result limit caps
response rows, not necessarily rows examined. Name/brand/category indexes do not
make arbitrary normalized substrings indexable. Empty browse currently uses the
same SQL; adding an optimized empty path is optional only after profiling, not a
reason to change matching semantics during this audit.

| Product count considered | Assessment (not benchmark results) |
|---:|---|
| 1,000 | A scan remains understandable for a small capstone; measure real latency before optimizing. The client still renders at most 100 products. |
| 10,000 | Unmatched/broad substring searches can inspect many products and probe aliases. Debounce/limit reduce traffic/output but do not bound scan work. Profile before extending coverage. |
| 100,000 | Worst-case scan/probe work grows with the catalog, plus ordering of matches. Do not promise interactive search without representative measurements. Approve pagination/search semantics and gather plans first. |

No speculative index was added. Exact alias lookup for future receipts can use
the existing unique normalized-alias index; that is different from substring
browsing. Price history for a popular product can grow independently of product
count and increase window-ranking work; any currency/source/descending covering
index should be justified by representative history measurements later.

Mobile catalog/branch rendering is virtualized. Catalog requests no prices;
details use one GET; a directly addressable comparison uses two parallel GETs
for identity plus prices. The repeated identity read after details is a deliberate
small consistency/direct-link cost, not grounds for an unapproved caching layer.
Search debounces nonempty input 350 ms and cancels prior work; no background retry
loop exists. Responses cap product rows at 100, while branch reads remain
unpaginated. A future basket should batch comparisons on the server rather than
performing a mobile request per line item.

The five-second SQL operation timeout starts with the database operation; pool
queue time is not an overall HTTP deadline. Five connections/ten queued requests
bound concurrency, while the mobile ten-second deadline bounds user waiting.
Client abort does not promise server-side SQL cancellation. Current operations
are read-only; T03 must not blindly retry a timed-out write as if it were absent.

## F. Reliability, security and test quality

Existing deferred-promise/manual-timer tests cover rapid input, clearing, stale
success/failure, the debounce window, unmount/blur cancellation and retries.
Resource keys hide an old product before effect cleanup on a new route; generation
guards protect even when transport cancellation is ignored. No new race defect
was demonstrated in these paths, so the working state/hook architecture was kept.

The rendered test now proves real server search completed before selecting its
result. It also verifies no catalog price prefetch, repeated-tap/back navigation,
retained input, direct/invalid/missing product routes, HTTP failures, malformed
JSON/payloads, empty results, socket-reset recovery and tied labels. Socket resets
simulate an unavailable/restarting backend transport in the disposable proxy;
the owner's Express/MySQL processes were never stopped or restarted. Desktop
navigation is not evidence of native iPhone gestures or native network behavior.

Test review found meaningful overlap at separate boundaries: MySQL fixtures test
query semantics, contract tests test fail-closed network shapes, resource tests
test asynchronous ownership, and browser tests test rendered interactions.
The SQL-mode test now uses the actual production reader instead of allowing an
injected text-query adapter to hide its binding behavior. Backend test/script
typechecking closes a previous gap where only `src/` was checked.

Public catalog/health routes expose no write operations. SQL input bounds and
status/source/currency predicates remain server-owned. Error responses are
sanitized; unknown raw SQL/network errors do not reach UI. CORS grants headers
only to configured browser origins; omitted headers do not authenticate callers
or prevent curl/native requests. Future private routes need real authorization.

App configuration uses public URL variables only; runtime URL checks reject
credentials/query/fragment misuse. Local HTTP is for demo development, not a
credential transport plan. Owner review of F04/F05 and an HTTPS strategy are
prerequisites before treating T03 account testing as secure. SQL sessions must
explicitly set strict mode and UTC before writes. No existing server/account
setting was changed to hide these concerns.

## G. T03 proposal — recommendations requiring approval

These are project recommendations inferred from the current architecture, not
approved changes or implemented features. Keep the modular monolith and MySQL.
The security references support baselines; they do not decide product scope.

### Decision proposals and tradeoffs

| Decision | Recommended approach and alternative | Advantages / disadvantages | Security, complexity and current impact |
|---|---|---|---|
| R1: identity and quantity | List items reference product ID; quantity is a positive integer count of complete catalog packages. Alternative: fractional/weight quantities with an explicit quantity-unit model. | Whole packs are simple and unambiguous; fractional produce needs later design. Two six-packs cost two package prices and contain twelve members; never multiply monetary cost by `packQuantity` again. | Server validates bounds and arithmetic overflow; low complexity, reuses current IDs. Approve quantity limits and whether weight-based purchases are in T03. |
| R2: inactive items | Preserve saved items and show their catalog identity/inactive flag through an owner-scoped list DTO; reject new inactive selections and mark affected comparisons incomplete until replaced/removed. Alternatives: auto-remove or continue pricing inactive items. | Preserves user intent; requires an explicit unavailable state. Auto-removal loses saved context; continuing prices can mislead. | Product FK remains restrictive; no silent reassignment to a similar size. Moderate complexity, public inactive detail 404 remains unchanged. Approval needed. |
| R3: monetary/basket contract | Exact USD minor-unit integer arithmetic on the server, returning decimal strings; one latest eligible package observation per product/branch. Continue only the explicitly approved demo source/currency mode initially if owner approves T03 scope. Alternative: SQL DECIMAL aggregation or a reviewed decimal library. | Integer cents are understandable; need overflow checks and JSON string serialization for BigInt. SQL DECIMAL also works but requires careful joins/completeness checks. | Server alone computes totals; no floating-point sums, conversion or cross-currency winner. Moderate complexity, additive basket endpoint only. Mixed currencies must remain separate/uncomparable until policy approval. |
| R4: completeness and age | Missing/inactive/unapproved observations produce explicit item reasons and no comparable complete total. Keep coverage completeness separate from freshness/source eligibility. Alternatives: partial estimates (clearly labeled) or withholding all results. | Transparent coverage helps users; DTO/UI are slightly larger. A subtotal can be useful but must not be ranked as complete. | `total: null` when incomplete, `knownSubtotal` only for available items (null if none), counts/IDs and `comparable: false`; no zero placeholders. Historical/demo dates stay explicit. Freshness/trust policy remains a decision, never an invented cutoff. |
| R5: ownership and public access | Keep existing public reads; authenticated private list routes derive user ID from server-validated session context. Apply owner predicates to every list/item read/write, with parent ownership checked atomically for mutations. Alternatives: login-gate all reads or route-only ownership prechecks. | Preserves discovery flow; ownership adds queries/transactions. Login-gating disrupts current browsing; detached prechecks risk missed checks/races. | Deny by default; 401 for missing/invalid sessions, indistinguishable 404 for absent/non-owned objects. No client `userId`, default/fake owner or CORS-based identity. Moderate complexity. Confirm guest policy D16 and response policy. |
| R6: passwords | Argon2id with library-managed random salts/encoded parameters; tune against at least the OWASP baseline. Alternative: properly configured built-in scrypt if Windows/native package integration is unsuitable. | Argon2id is a suitable modern default; adds a dependency/native compatibility check. Scrypt avoids that package but needs explicit cost configuration. | Passwords/hashes never enter mobile bundles or logs. Add bounded login attempts and generic credential errors. Moderate complexity; approve package, normalization/password rules and secure local HTTPS testing. Product alias normalization must never become email normalization. |
| R7: sessions | Prefer opaque 256-bit random bearer tokens for native, with only hashes plus user/expiry/revocation metadata in a proposed MySQL session store. Alternative: short-lived JWT access tokens plus rotating refresh sessions. | Opaque sessions make logout/revocation easy; require a lookup per protected request and an additional approved table. JWT can reduce some lookups but complicates rotation/revocation and key handling. | Propose 24-hour absolute/30-minute idle expiry for demo accounts, subject to owner usability approval. Use a reviewed native secure-storage option, not AsyncStorage; web support needs an HttpOnly/Secure/SameSite cookie/CSRF decision. Moderate versus higher complexity; D11 JWT remains only a proposal, not silently replaced. |
| R8: logout and request lifecycle | Clear local credentials/private state and invalidate a session generation immediately; cancel protected requests and revoke on the server. Alternative: merely delete the local token or wait for expiry. | Prevents user A responses from appearing after logout/login as B; requires auth-scoped resource keys. Local deletion alone leaves stolen tokens usable. | Apply auth on every server request; define in-flight mutation semantics and offline revocation failure honestly. Do not claim server revocation while offline. Moderate complexity, extends existing cancellation rather than replacing it. |

Password hashing baseline: Argon2id with at least 19 MiB memory, two iterations
and parallelism one, or an appropriately configured alternative; benchmark cost
before selecting final parameters. See [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Random session identifiers, one-way session-secret storage, expiry and server
invalidation are supported by [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
Per-request/object authorization follows [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

### Coverage of the twelve readiness questions

1. Canonical IDs: supported directly (R1); no names-as-identifiers or schema rewrite.
2. Quantity representation: recommend positive whole-package counts (R1); fractional units require approval.
3. Multipacks: catalog price already prices the entire multipack; member count is descriptive, not another cost multiplier (R1/R3).
4. Inactive saved products: preserve and flag through private list reads; exclude from new selections and comparable totals under the proposed rule (R2).
5. Missing prices: explicit missing-item reasons, nullable total, no fabricated zero (R4).
6. Multiple currencies: keep current USD-only demo mode unless scope changes are approved; no mixed-currency totals or conversion (R3).
7. Ownership: server-derived user plus owner-scoped queries on every operation, including item mutations (R5).
8. Authenticated versus unauthenticated: session middleware for private modules, explicit public read modules, no anonymous private owner (R5/R7).
9. Password/session storage: approve Argon2id versus scrypt and opaque versus JWT sessions, storage and expiry (R6/R7).
10. Logout during requests: auth-generation cancellation/clearing plus server revocation; define concurrent write behavior and idempotency (R8).
11. Incomplete baskets: distinguish covered-item subtotal from complete comparable total, with IDs/counts/reasons (R4).
12. Historical/outdated observations: preserve source time/status/demo flags; age/source policy must be approved before real recommendation eligibility (R4).

Proposed future entities are the already planned users, shopping lists and unique
`(shopping_list_id, product_id)` items; opaque sessions would additionally require
an approved session table. Do not build these now. Keep product/price history FKs
restrictive; approve list-item deletion semantics and private-data retention when
scoping list/account deletion. Before any writes, enforce strict SQL/UTC on every
connection and add transactional ownership/quantity checks. Authentication modules
should extend the app factory with injectable services, leaving public catalog
contracts intact. T03 list comparisons should batch observations on the backend.

## H. Future receipt compatibility

- Existing exact normalized aliases and canonical package IDs are reusable.
  Substring search must never become automatic receipt matching. Ambiguous/unknown
  lines require selecting an existing catalog product; size differences remain
  distinct. Two units of an item are not automatically the same as a multipack.
- Branch IDs belong to chains; chain names alone are insufficient to assign a
  receipt price. Unknown branches need controlled identification/review.
- Receipt source is deliberately not yet allowed by `prices.source_type`.
  Receipt tables/items, original monetary extraction and the enforced
  `receipt_item_id` FK must be added together before receipt-derived observations.
- Duplicate submissions need evidence/fingerprint and transactional replay
  controls before trusted prices are appended. Receipt redaction/retention,
  purchase-time interpretation and review/verification transitions remain open.
- Never overwrite old observations. Future catalog administration should treat
  referenced package identity as immutable: create a new SKU and deactivate the
  old one for material size/variant changes. The database currently cannot infer
  semantic alias/identity mistakes; controlled curation remains necessary.

These are future boundaries/approval items, not OCR, receipt or verification code.

## I. Verification executed in this audit

| Directory / command | Outcome |
|---|---|
| `backend/`: `$env:RUN_CATALOG_DB_TESTS='1'; npm test` | **27/27 passed**, zero skips; includes real MySQL fixtures and SQL-mode regression |
| `backend/`: `npm run typecheck` | Pass |
| `backend/`: `npm run typecheck:tests` | Pass, including test and audit-script types |
| `backend/`: `npm run build` | Pass |
| `backend/`: `npx tsx scripts/audit-catalog.ts` | Pass; EXPLAIN, counts, FK/index metadata, zero orphan price joins and sanitized capability audit |
| `mobile/`: `npm test` | **31/31 passed**, with the optional-image test expanded |
| `mobile/`: `npm run typecheck` | Pass |
| `mobile/`: `npm run typecheck:tests` | Pass |
| `mobile/`: `npm run test:live` | **6/6 passed** against the existing Express/MySQL services |
| `mobile/`: `npm run test:browser` | **3/3 scenario groups passed**, strengthened as described; no uncaught browser exceptions |
| `mobile/`: `npx expo install --check` | Dependencies are up to date |
| `mobile/`: `npx expo export --platform web --output-dir dist/web` | Pass |
| `mobile/`: `npx expo export --platform ios --output-dir dist/ios` | Pass; Hermes bundle generated |
| Repository: `git diff --check` | Pass |

The new SQL-mode regression failed before correction (the subtest and its parent
were both counted failed); the expanded image regression also failed before its
fix. Final results above are the subsequent executed runs, not assumed successes.
Node/Chrome/Expo commands used authorized execution outside sandbox subprocess/
network restrictions. Remove optional process flags after local runs; no `.env`
file needs editing. Existing services and all five table counts remain unchanged.

No physical iPhone test, public-network scan, firewall audit or large-data timing
benchmark was performed. Native acceptance remains the checklist in
[T02-C/D/E verification](t02cde-verification.md). The browser uses a temporary
same-origin proxy, so it does not validate the owner's actual LAN CORS setup.

## J. Owner decisions and repository status

Before T03 implementation, approve R1–R8, especially session design/storage/expiry,
password library and email/password rules, guest access, inactive-item behavior,
whole-package quantities, incomplete/demonstration basket contracts, and whether
T03 remains in the current USD seed mode. Real source/freshness/conversion rules
are still open; do not quietly use demo eligibility as a production trust rule.
Separately, the owner/admin must review F04/F05, least-privilege app access,
loopback/network restrictions and HTTPS for account testing. This audit does not
request or perform those restricted configuration changes.

Current findings are documented for approval, not installed as new architecture.
T03 can follow a small vertical slice after approval: authentication boundary,
owner-scoped list persistence, then explicit complete/incomplete demo basket
comparison. No auth, sessions, list persistence, basket endpoints, OCR, maps or
other future feature was implemented during T02-F.

All earlier uncommitted work remains. T02-F adds the audit script, backend test
typecheck configuration and this report; the modifications listed in C are
uncommitted alongside the pre-existing T02 work. No files were staged, committed
or pushed. Changed/new file contents were checked against configured local secret
values without printing them; environment files, requirements, SQL setup/migration/
seed and dependency lockfiles remain unchanged. Generated exports stay ignored.
