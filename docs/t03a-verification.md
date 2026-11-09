# T03-A — backend verification and owner handoff

Implemented, verified and owner-approved 2026-11-09. T03-A is complete. The owner
successfully imported migration 002 into local WampServer MySQL and confirmed all
four new tables were created. Codex did not apply the application migration.
Overall T03 remains in progress; T03-B and T03-C are not started.

## 2026-11-09 — Owner acceptance

The owner reported successful manual verification of registration, login,
shopping-list creation, adding products, atomic duplicate quantity increments,
shopping-list retrieval, explicit quantity replacement, product removal, logout,
and rejection of the invalidated session with HTTP 401. The owner explicitly
approved T03-A and authorized the commit and push checkpoint on existing `main`.
These are owner-reported acceptance results, distinct from the automated checks
below. No additional manual checks are implied.

## Owner-approved GitHub checkpoint verification

After recording acceptance, final relevant checks passed: `npm test` with
`RUN_CATALOG_DB_TESTS=1` produced **40 passed, 0 failed, 1 skipped** (the disposable
T03 write-integration group was intentionally not rerun; its earlier 63-test full
run remains recorded below). Backend `npm run typecheck`, `npm run typecheck:tests`
and `npm run build` passed. Staged whitespace and file-scope review cover the
intended T03-A source, migration, tests and documentation only. No environment
files, credentials, database dumps, generated output or mobile changes are included.
The checkpoint uses the existing `main` branch and an ordinary non-force push.

## Implementation and contracts

- New migration: `database/migrations/002_users_and_shopping_lists.sql`, after
  unchanged migration 001. Creates `users`, `sessions`, `shopping_lists` and
  `shopping_list_items`; InnoDB, unsigned INT keys, UTC DATETIME(6), required
  fields, email/token/list-product uniqueness, FK indexes and quantity/name/expiry
  CHECKs. User deletion cascades sessions/lists; list deletion cascades items;
  product deletion is restricted while referenced. Catalog records are untouched.
- New backend modules: `auth` (passwords, repository, routes and reusable bearer
  middleware), `shopping-lists` (repository/routes), `shared/validation.ts`.
  Existing app factory injects the new repositories. Central errors also handle
  expected 400/401/404/409 failures and oversized JSON safely.
- Registration: `displayName`, `email`, `password`; 201 safe `{user}` profile;
  explicit login required. Display name trims to 1–80 Unicode code points.
  Email trims/lowercases, max 254 ASCII characters (local part max 64), ordinary
  dot-domain syntax; database uniqueness is case-insensitive and race-safe.
- Passwords: exact untrimmed 8–128 Unicode code points, at most 512 UTF-8 bytes;
  asynchronous scrypt N=131072/r=8/p=1, random 16-byte salt, 64-byte derived key,
  maxmem 160 MiB. Versioned fixed parameters and timing-safe comparison; no new
  dependency. Missing-account login performs the same KDF with a dummy hash.
  See the [Node crypto reference](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).
- Login: 200 `{token,tokenType:"Bearer",expiresAt,user}`. A new 32-byte random token
  is hex encoded; only its SHA-256 digest is stored. Database UTC time determines
  a fixed seven-day lifetime, without sliding expiry. Each login is independent.
  Wrong password/nonexistent account share 401 `Invalid email or password`.
- `Authorization: Bearer <token>` is required for logout, me and all list routes.
  Missing/malformed/unknown/expired/revoked sessions return 401. Logout returns
  204 and deletes only the current session; subsequent authentication fails.
  `GET /api/auth/me` returns `{user:{id,displayName,email}}`. Auth/private responses
  set `Cache-Control: no-store`. Password/session hashes and SQL errors never
  appear in these responses.
- List names trim to 1–120 Unicode code points; multiple/empty lists and duplicate
  names are supported. Ownership always comes from the session, never a body ID.
  Unknown body keys are rejected. Missing/foreign lists and missing/wrong-list
  items share 404 `Shopping list or item not found`.
- Quantities are JSON integer numbers 1–999, counting complete canonical packages.
  Adding an existing product increments; PATCH replaces. Transactional parent-row
  locking serializes modifications and reads; unique list/product identity backs
  duplicate prevention. Additions lock product activity for the transaction.
  Overflow rejects with 400 and rolls back without partial changes.
- Existing inactive products remain in responses with package identity, quantity
  and `product.isActive=false`; quantity changes/removal are allowed, additions
  rejected. Missing products return 404. No substitution or inventory inference.
- Complete endpoint table and request/response examples are in
  [docs/api.md](api.md#t03-a-authentication-and-shopping-list-api). List summaries
  expose ID/name/UTC timestamps; details add items with canonical `productId`,
  quantity and nested package-aware product DTOs. No basket totals or currency
  conversions are calculated. All existing guest T02 routes remain public.

## Executed verification

Environment: Windows PowerShell, Node 24.11.1, MySQL 8.4.7. Existing dependencies
were already installed; no package or lockfile changes.

| Command/check | Actual result |
|---|---|
| `npm test` with `RUN_CATALOG_DB_TESTS=1`, `T03_TEST_PORT=3308`, `T03_TEST_DATADIR` set to the dedicated temporary server | **63 tests passed; 0 failed; 0 skipped** |
| Final default `npm test` without opt-in database variables | **31 passed; 0 failed; 2 database groups skipped** |
| `npm run typecheck` in backend | Passed |
| `npm run typecheck:tests` in backend | Passed |
| `npm run build` in backend | Passed |
| `git diff --check` | Passed |

The 63 total includes 22 T03-A database subtests and their parent, nine new
non-database tests, plus all existing tests including eight read-only MySQL
catalog subtests and their parent. Earlier default suite passed with database
integration disabled. The first sandboxed `npm test` attempt failed to spawn
Node test workers (`EPERM`); rerunning with execution escalation succeeded.
No application logic failure was concealed by that environment correction.

The **disposable** MySQL instance used a separate temporary datadir, loopback
address and port 3308. Its existing WAMP binary was used without changing the
WAMP service, users, grants or server configuration. The test verifies the server's
actual `@@datadir` before creating its fixed test schema, refuses port 3306 and
refuses to reuse an existing schema. It imports copies of T02 migration/seed,
snapshots every value of every T02 row, applies migration 002, and compares the
snapshots after list mutations/deletions. Inactive-product test changes occur
only in that disposable fixture and are restored. The schema is removed in
`finally`; the temporary server was shut down and its datadir removed afterward.

Database checks cover registration races/case uniqueness, safe profiles, token
hashing, exact seven-day expiry, independent sessions, invalid credentials,
expiry and revocation; list CRUD, empty/multiple lists, package distinctions,
duplicate increments, replacement/no-op quantities, all foreign-owner operations,
wrong-list item IDs, inactive items, twelve concurrent additions, concurrent cap
enforcement, concurrent replacements and deletion/addition races; FK/UNIQUE/CHECK
constraints, cascading deletes, unchanged catalog snapshots and real guest APIs.
Non-database tests cover invalid/missing inputs, bounds/types/IDs, malformed
bearer headers, all protected endpoints, owner derivation and sanitized failures.

The existing `RUN_CATALOG_DB_TESTS=1` suite separately ran against the configured
WAMP application database using **SELECT-only data access**, plus session-local
SQL mode/timezone tests on borrowed disposable connections. It confirmed 36
products, 3 chains, 4 branches, 125 observations, alias search, details, price
comparison, bound SQL and strict UTC pool checkout behavior. No T03 tables or
records were created there. The original T02 migration and requirements file
remain unchanged. Mobile files were not modified; no new mobile/device testing
is claimed.

## Engineering review and corrections

- Concurrent registration relies on database uniqueness and translates duplicate
  key failures to 409, rather than a vulnerable check-before-insert pattern.
- List locking precedes every detail/mutation, so duplicate increments and cap
  checks are serialized and list deletion cannot leave an orphaned item.
  A separate shared product lock protects inactive-product admission.
- Item operations validate both list ownership and item membership. No-op PATCH
  succeeds without relying on MySQL's changed-row count.
- Explicit DTO construction keeps password/session records out of profiles and
  list responses. Dummy KDF work avoids a fast nonexistent-account login path.
- Review found oversized JSON previously used the unexpected-error 500 response;
  corrected it to sanitized 400 and added a regression test.
- Expiry storage/validation use the same database clock. Login uses a transaction
  to create/read the session expiry, avoiding an unreturned session on read failure.
- No unresolved blocking correctness defect was found in the executed checks.

## Known limitations and deferred work

- Owner migration/import and the manual acceptance checks above are complete.
  Overall T03 remains in progress; basket calculations and mobile integration
  remain deferred to T03-B and T03-C.
- Demonstration authentication has no rate limiting, email verification, password
  recovery, OAuth or MFA. Public deployment would need a separate security review
  and HTTPS; this task introduces no hosting infrastructure.
- Expired session rows are rejected but not automatically purged. Logout affects
  the current token only. Requests authenticated before logout may finish;
  requests authenticated after completed logout fail. T03-C must provide secure
  token storage and prevent stale private responses after logout/account switches.
- Ordinary ASCII email syntax is deliberate; IDNs/quoted local parts are not
  accepted. There are no password-composition rules or email delivery checks.
- List reads/mutations serialize per list and return all items; no pagination,
  cross-device optimistic locking or automatic transient database retry is added.
  Concurrent PATCH uses whichever serialized replacement runs last.
- T03-B must require complete eligible price coverage in a single branch for
  ranking; inactive required products prevent complete coverage. Missing prices
  are not out-of-stock assertions. No complete branch means no recommendation.
  Its approved fixed rate is 1 USD = 90,000 LBP, normalized comparisons in USD,
  original amounts/currencies retained. Implementation/rounding documentation and
  the small result-bottom availability reminder remain for T03-B/C.
- OCR, receipt processing, optimization, routing, fuel and assistant are untouched.

## Owner actions: phpMyAdmin

Completed by the owner before this checkpoint; retained as reference instructions
for future fresh installations. Do not rerun migration 002 on this installation.

1. Review migration 002. Open local phpMyAdmin on the existing MySQL 8.4 instance
   and select the populated `supermarket_comparison` database with the existing
   schema administrator. Preserve current credentials/grants.
2. Confirm the four new table names are absent; inspect/record the current catalog
   counts (36 products, 12 aliases, 3 supermarkets, 4 branches, 125 observations).
3. Import **only** `database/migrations/002_users_and_shopping_lists.sql` once.
   Do not rerun migration 001, seed 001 or database setup. DDL commits implicitly:
   after any error, stop and inspect partial schema instead of rerunning blindly.
4. Inspect four empty new tables, their UNIQUE/FK/CHECK constraints and unchanged
   catalog counts. Record successful migration filename/date locally. No default
   account or session is seeded.

## Owner actions: PowerShell API acceptance

The owner completed the acceptance cases listed above. These commands remain
reference examples, not a request to repeat registration or recreate data.

With WAMP running and after the manual import, from the repository root:

```powershell
cd backend
npm test
npm run typecheck
npm run typecheck:tests
npm run build
npm run dev
```

No environment or dependency changes are required. In another PowerShell terminal,
these requests create a **manual demo account**, list and item, then delete the list
and revoke the token. Use an existing catalog product ID (1 in the supplied seed).
The password below is illustrative demo input, not a configured account secret.
Use a different email if that demo account already exists (or skip registration).

```powershell
$api = 'http://127.0.0.1:3000/api'
$credentials = @{ email = 't03a-demo@example.com'; password = 'demo-only-password' }
$registration = @{ displayName = 'T03-A Demo'; email = $credentials.email; password = $credentials.password }
Invoke-RestMethod "$api/auth/register" -Method Post -ContentType 'application/json' -Body ($registration | ConvertTo-Json)
$login = Invoke-RestMethod "$api/auth/login" -Method Post -ContentType 'application/json' -Body ($credentials | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod "$api/auth/me" -Headers $headers
$created = Invoke-RestMethod "$api/shopping-lists" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"name":"Weekly"}'
$listId = $created.shoppingList.id
$added = Invoke-RestMethod "$api/shopping-lists/$listId/items" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"productId":1,"quantity":2}'
$itemId = $added.item.id
Invoke-RestMethod "$api/shopping-lists/$listId/items" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"productId":1,"quantity":3}'
Invoke-RestMethod "$api/shopping-lists/$listId/items/$itemId" -Method Patch -Headers $headers -ContentType 'application/json' -Body '{"quantity":2}'
Invoke-RestMethod "$api/shopping-lists/$listId" -Headers $headers
Invoke-RestMethod "$api/shopping-lists/$listId" -Method Delete -Headers $headers
Invoke-RestMethod "$api/auth/logout" -Method Post -Headers $headers
# Expected HTTP 401 after logout:
Invoke-RestMethod "$api/auth/me" -Headers $headers
Remove-Variable login, headers, credentials, registration
```

Expected quantities: 2, then 5 after duplicate addition, then 2 after PATCH. Logout
has no body (204); the final request reports HTTP 401 in PowerShell. For ownership
acceptance, register/login a second account and confirm the first account's list
is 404 before deleting it. That additional two-account manual check is not part of
the owner's reported acceptance; automated ownership checks passed separately.

## Reproducing isolated database tests

Do **not** point the T03 integration test at the application server. With the
existing local MySQL binaries, initialize a separate datadir as follows. If the
directory already exists, stop and inspect it rather than overwriting it. No
existing account, grant or service is modified.

```powershell
$mysqlBin = 'C:\wamp64\bin\mysql\mysql8.4.7\bin'
$taskData = Join-Path $env:TEMP 'supermarket-t03a-mysql'
if (Test-Path -LiteralPath $taskData) { throw 'Disposable datadir already exists; inspect before proceeding' }
New-Item -ItemType Directory -Path $taskData | Out-Null
& "$mysqlBin\mysqld.exe" --no-defaults --initialize-insecure --basedir=C:/wamp64/bin/mysql/mysql8.4.7 "--datadir=$taskData" --console
if ($LASTEXITCODE -ne 0) { throw 'Disposable MySQL initialization failed' }
$taskServer = Start-Process -FilePath "$mysqlBin\mysqld.exe" -ArgumentList @('--no-defaults', '--basedir=C:/wamp64/bin/mysql/mysql8.4.7', ('--datadir="{0}"' -f $taskData), '--bind-address=127.0.0.1', '--port=3308', '--mysqlx=OFF', '--skip-log-bin') -WindowStyle Hidden -PassThru
# Wait for the disposable server to be ready before running tests.
cd backend
$env:T03_TEST_PORT = '3308'
$env:T03_TEST_DATADIR = $taskData
$env:RUN_CATALOG_DB_TESTS = '1' # Optional existing WAMP SELECT-only checks.
npm test
Remove-Item Env:T03_TEST_PORT, Env:T03_TEST_DATADIR, Env:RUN_CATALOG_DB_TESTS
& "$mysqlBin\mysqladmin.exe" --no-defaults --protocol=TCP --host=127.0.0.1 --port=3308 --user=root shutdown
$taskServer.WaitForExit()
# After confirming this server stopped, remove only this dedicated temporary datadir.
```

Default `npm test` skips the two opt-in database groups; it does not start servers
or apply migrations. The complete 63-test result above enabled both groups.

## Changed files and documentation

Modified: `backend/src/app.ts`, `backend/src/middleware/errors.ts`, `README.md`,
`database/README.md`, `docs/api.md`, `docs/architecture.md`, `docs/database.md`,
`docs/decisions.md`, `docs/frontend.md`, `docs/roadmap.md`.

Added: `backend/src/modules/auth/{password,repository,routes}.ts`,
`backend/src/modules/shared/validation.ts`,
`backend/src/modules/shopping-lists/{repository,routes}.ts`,
`backend/tests/auth-lists.test.ts`, `backend/tests/auth-lists-db.test.ts`,
`database/migrations/002_users_and_shopping_lists.sql`, this verification report.

Architecture remains the approved Express modular monolith and mysql2/promise.
Docs replace provisional auth choices with the implemented decisions and record
approved future basket policy. No requirements, mobile source, T02 SQL, credentials,
grants, package dependencies or lockfiles changed. The initial implementation made
no commit or push; the subsequent owner-approved checkpoint authorizes both.
