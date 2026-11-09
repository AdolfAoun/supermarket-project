# T02-A catalog SQL

The owner successfully imported migration 002 and confirmed all four new tables
on 2026-11-09, then approved T03-A after manual API checks. Do not rerun it on the
current installation. The instructions below are retained for fresh installations.

**T03-A:** Existing populated installations must import only
[`migrations/002_users_and_shopping_lists.sql`](migrations/002_users_and_shopping_lists.sql)
after owner review. Do not rerun migration 001, seed 001 or setup scripts. Select
the existing application database in local phpMyAdmin using the existing schema
administrator, confirm the four new tables are absent, then import 002 once.
Inspect `users`, `sessions`, `shopping_lists`, `shopping_list_items`, their keys
and empty counts; recheck unchanged catalog counts 36/12/3/4/125. DDL commits
implicitly: stop and inspect any partial failure rather than rerunning blindly.
No account/grant/server configuration changes are required or authorized.
See [T03-A verification](../docs/t03a-verification.md) for complete owner commands
and disposable-server testing. The catalog instructions below describe T02 history
and fresh installs; they are not instructions to reinitialize the owner's catalog.

Requires MySQL **8.0.16+** for enforced `CHECK` constraints; tested on **8.4.7**.
Use WAMP's MySQL instance, not MariaDB. No database/user creation, grants changes,
credentials changes or removal of existing contents is included.

**Local status:** T02-A is implemented, imported into local WampServer MySQL,
and manually verified by the owner. All five counts match expectations; see
[the verification record](../docs/t02a-verification.md). The instructions below
are for a fresh database; do not rerun the migration or seed in the populated
local catalog. T02-B now provides read-only catalog APIs; see
[backend verification](../docs/t02b-verification.md). Its integration tests use
SELECT-only fixtures and do not require the schema privileges of the T02-A tests.

## Execute through local phpMyAdmin

1. Sign in with an existing local administrator/schema account and select the
   intended database (normally `supermarket_comparison`). Do **not** rerun T01's
   `setup/01-local-database.sql` or modify existing accounts. Migration execution
   requires `CREATE`, `INDEX` and `REFERENCES` privileges; use the existing local
   administrator rather than changing application grants.
2. Confirm none of the five catalog tables already exists. Import
   **`migrations/001_catalog.sql` first** using Import / SQL format, or paste the
   complete file into the SQL editor. It creates products, aliases, supermarkets,
   branches and prices in dependency order. Inspect Structure for the five tables
   and their keys.
3. This is a **run-once** migration. Record the filename and successful execution
   date manually; future numbered migrations run in increasing order. No ORM or
   migration dependency is needed. DDL commits implicitly: after any error, inspect
   the partial schema before continuing. Do not rerun blindly or delete tables.
4. The optional seed requires an **empty catalog**. Check:

   ```sql
   SELECT 'products' AS table_name, COUNT(*) AS row_count FROM products
   UNION ALL SELECT 'product_aliases', COUNT(*) FROM product_aliases
   UNION ALL SELECT 'supermarkets', COUNT(*) FROM supermarkets
   UNION ALL SELECT 'branches', COUNT(*) FROM branches
   UNION ALL SELECT 'prices', COUNT(*) FROM prices;
   ```

   All counts must be zero. Otherwise stop; use a separate owner-selected empty
   development database for a demo. Do not clear or merge existing contents.
5. Import **`seeds/001_demo_catalog.sql` second**, as one complete file with
   execution stopped on errors. It uses a transaction and explicit fixture IDs;
   never rerun it over populated tables. There are no upserts or ignored errors.
   If import fails, stop and inspect counts and transaction state before retrying.
   Roll back an open transaction in the same connection; a later phpMyAdmin
   request may use a different connection. Do not assume a partial import succeeded.
6. Expected counts: **36 products, 12 aliases, 3 chains, 4 branches, 125 prices**.
   Every price has `source_type='seed'`, currency `USD`, and a note beginning
   `DEMONSTRATION DATA`. Branches are fictional Lebanese scenarios with unknown
   coordinates. Amounts, observation dates and simulated verification statuses
   establish no real-world prices, availability or actual outlet information.

Both imports enable strict SQL mode and UTC **only for their executing session**.
The Express pool now configures each checkout independently with the same strict/
date modes and UTC, plus mysql2 `timezone:'Z'`. This changes neither global settings
nor existing timestamps. Other standalone clients must configure their own
sessions. See [final cleanup](../docs/t02-final-cleanup.md).

## Verification

Use the existing backend dependencies (`npm ci` in `backend/` if not installed).
From the repository root:

```powershell
node database/tests/catalog.test.cjs
```

The script reads the backend environment without changing it and requires a
loopback host. It creates five uniquely prefixed tables in the configured database,
executes the migration and seed statements, checks constraints and history, rolls
back all fixture rows, and drops only its own test tables. Existing catalog tables
are never used. Schema privileges including `REFERENCES` are required. If cleanup
is interrupted, inspect the printed prefix before removing any leftover tables.
An existing privileged local connection or disposable MySQL instance can instead
be supplied through process environment variables (`DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, `DB_PASSWORD`). Do not change application grants just to run tests or
put credentials in committed scripts/commands.

On 2026-11-06 the configured WAMP MySQL 8.4.7 connection was reachable but lacked
`REFERENCES`, blocking foreign-key creation. Its test tables were cleaned up and
no grants were changed. A disposable MySQL 8.4.7 instance on `127.0.0.1:3308`
then passed **all 12 checks**: SQL execution, fixture counts/labels, statuses,
relationships, foreign keys, invalid values, duplicate identities/aliases, package
distinctions, historical inserts, latest verified selection and restrictive parent
deletion. The test runner rolls back the seed rows instead of committing them.
The disposable server was shut down and its temporary directory removed afterward.
That automated test run did not migrate or seed the application catalog.
The owner subsequently confirmed successful import into local WampServer MySQL
and manual verification of all five expected table counts. This confirmation is
recorded separately from the automated checks in
[docs/t02a-verification.md](../docs/t02a-verification.md).
