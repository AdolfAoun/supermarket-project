# T02-A verification record

**Status:** complete. On 2026-11-06, the owner confirmed that T02-A was
implemented, imported into the local WampServer MySQL database, and manually
verified. T02-B has not started; full T02 end-to-end acceptance remains pending.

## Owner-confirmed local import

Migration: `database/migrations/001_catalog.sql`.
Seed: `database/seeds/001_demo_catalog.sql`.

| Table | Expected rows | Owner-confirmed rows |
|---|---:|---:|
| `products` | 36 | 36 |
| `product_aliases` | 12 | 12 |
| `supermarkets` | 3 | 3 |
| `branches` | 4 | 4 |
| `prices` | 125 | 125 |

The local import and counts above are reported by the owner, independently of
the automated test run. No additional manual constraint checks are inferred from
the count confirmation. All seeded price observations remain explicitly labeled
**DEMONSTRATION DATA**, use USD, and do not establish current or accurate prices.

## Automated verification

The implementation run passed all 12 integration checks on a disposable MySQL
8.4.7 instance: migration/seed execution, counts and labels, all four statuses,
relationships and foreign keys, invalid values, duplicate identities and aliases,
package distinctions, historical observations, latest verified candidate selection,
and restrictive parent deletion. Fixture rows were rolled back, test tables
removed, and the disposable server and data directory cleaned up.

The existing configured WAMP account lacked `REFERENCES` during the earlier test
attempt; no application grants were changed. This historical test limitation
does not negate the owner's subsequent successful local import.

Commands: `node database/tests/catalog.test.cjs` (integration checks on the
disposable instance), `node --check database/tests/catalog.test.cjs`, and
`git diff --check`. See [database instructions](../database/README.md).

## Remaining scope

No import action remains for the verified local catalog. Do not rerun its seed.
Product search/detail APIs and comparison UI belong to T02-B and are unimplemented.
Freshness, source trust, exchange-rate policy and receipt linkage remain deferred
as documented in [the database model](database.md). No requirements or broader
architecture were changed by this verification update.
