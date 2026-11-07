# T02 final cleanup and database consistency

Date: 2026-11-07. **Full T02 owner acceptance is confirmed, including physical-iPhone verification.**
T03 is not implemented.
Subsequent owner iPhone testing confirmed functionality but found header overlap
on Product Details and Supermarket Browsing. A focused root-stack correction is
implemented; [the retest record](t02cde-verification.md#2026-11-07--owner-iphone-header-layout-correction)
records the correction. The owner subsequently confirmed both corrected layouts
on the physical iPhone and approved the complete T02 milestone.

## Changes

`backend/src/config/database.ts` retains the existing lazy, bounded mysql2 pool
and exports the same promise-pool interface. A small checkout wrapper configures
each borrowed connection before returning it, for `query`, `execute` and explicit
`getConnection` callers. Settings are reapplied on reuse as well as new/replacement
connections:

```sql
SET SESSION
  sql_mode = CONCAT_WS(',', @@SESSION.sql_mode,
    'STRICT_TRANS_TABLES', 'NO_ZERO_DATE', 'NO_ZERO_IN_DATE'),
  time_zone = '+00:00';
```

Existing SQL modes are preserved. These strict/date modes match the existing
migration/seed setup and are supported by local MySQL 8.4.7. Pool option
`timezone: 'Z'` also makes mysql2's Date encoding/decoding use UTC. Server session
timezone and driver timezone are separate settings; both are configured.

The callback pool is configured before its standard `.promise()` conversion.
Every checkout awaits one small SET statement with a five-second timeout. This
avoids an unawaited async pool event and changes no repository/API architecture.
Connection acquisition/setup failure rejects the request; setup failure destroys
the connection instead of returning it to callers. Process health still starts
without MySQL; database health reports unavailable on failure as before.

No global settings, existing records or stored dates are changed. Existing
`DATETIME(6)` observations keep their documented UTC meaning, and comparison SQL
continues emitting the original six fractional digits. JavaScript Date objects
have millisecond precision; this does not truncate stored observations or the
SQL-formatted API timestamp. No migration or data conversion is necessary.

## Regression verification

| Working directory | Command | Result |
|---|---|---|
| `backend/` | `$env:RUN_CATALOG_DB_TESTS='1'; npm test` | **31/31 passed**, no skips |
| `backend/` | `npm run typecheck` | Passed |
| `backend/` | `npm run typecheck:tests` | Passed |
| `backend/` | `npm run build` | Passed |
| `mobile/` | `npm test` | **31/31 passed** |
| `mobile/` | `npm run typecheck` | Passed |
| `mobile/` | `npm run typecheck:tests` | Passed |
| `mobile/` | `npm run test:live` | **6/6 passed** against existing Express/MySQL |
| `mobile/` | `npx expo install --check` | Dependencies are up to date |
| Repository | `git diff --check` | Passed |

The optional database flag affects only the process; remove it afterward with
`Remove-Item Env:RUN_CATALOG_DB_TESTS`. No environment file was edited. Authorized
execution outside the subprocess-restricting sandbox was used for the test runs.

New `backend/tests/database-session.test.ts` checks waiting before checkout,
reinitialization on reuse, setup-failure disposal and acquisition-error handling.
The existing live MySQL suite now checks two simultaneously held connections,
UTC clock behavior, Date decoding, and required modes. It temporarily drifts only
one exclusively borrowed test session, then confirms reacquisition repairs it
while preserving unrelated modes. After destroying held test connections, a
replacement is also checked. Global SQL mode/timezone match the initial snapshot.
No tests insert/update/delete application data or create tables. No invalid-write
probe was run: strict/date mode activation is checked directly without modifying
the database. Existing query/HTTP regressions exercise the same configured pool.

Catalog search, canonical details, inactive/invalid IDs, latest verified USD seed
prices, tied timestamps, money/timestamp metadata, supermarket branches, health,
CORS and sanitized errors remain covered. The live client still sees 36 products,
the separate Coca-Cola packages and the four product-1 demo amounts in the same
order. No price eligibility, verification, freshness or currency policy changed.

## Documentation and repository preparation

Updated database/architecture guidance, database import instructions, decisions,
roadmap and README. T02-F remains a historical audit with a note resolving its
session-consistency finding; its other observations were not reaudited or acted
on. Original user requirements remain unchanged.

The complete uncommitted T02 inventory was reviewed, including earlier work:

- Backend app wiring, catalog routes/repository, narrow error corrections,
  session configuration, regression tests, read-only query-audit script and test
  typecheck configuration/scripts.
- Mobile Home/Explore, product/comparison/branch routes, shared UI, API/contract
  readers, screen-local state, tests and test-only configuration/scripts.
- T02 architecture/API/database/frontend/decision/roadmap documentation and
  milestone verification reports. T03 content is clearly a future proposal.

These files belong to T02. Generated exports/builds, node_modules and local
environment files remain ignored. Changed/new contents were checked against
configured secret values and credential patterns without printing them. Dependency
lockfiles, SQL setup/migration/seed and original requirements remain unchanged.
No unrelated feature was introduced. No files were staged, committed or pushed.

## Remaining limitations and acceptance

- Physical-iPhone interaction/LAN acceptance was not performed by the agent.
  Use the existing [iPhone checklist](t02cde-verification.md#manual-iphone-owner-acceptance).
- Prices remain clearly labeled USD demonstration data. Freshness/conversion
  policies are still undecided; historical data must not be presented as current.
- Catalog retrieval remains capped at 100 results with a visible limit notice.
- One session SET per checkout is a deliberate small capstone cost; no caching,
  infrastructure changes or broader optimization was added. Code holding an
  explicit connection must not change its session settings during normal work.
- Existing application processes need the updated backend code loaded (normal
  dev-watch reload or ordinary restart when next launched). No local service was
  manually stopped/reconfigured during this task.

No known functional blocker remains for **owner demonstration acceptance**.
The owner has now provided full T02 sign-off; earlier pending notes/checklists are
historical. This cleanup
does not start T03 or introduce another security/infrastructure audit.
