# T02-B backend verification

**Status:** read-only backend implemented and automated checks passed on
2026-11-06. The owner's subsequent T02-C/D/E assignment confirms live API checks.
This record describes T02-B at implementation time; see
[T02-C/D/E verification](t02cde-verification.md) for mobile integration, the
malformed-URL correction and the updated 26-test backend regression result.
T02-B itself added no mobile screens, schema changes, dependencies or environment changes.

## Commands and results

From `backend/`:

```powershell
npm test
npm run typecheck
npm run build
# Optional SELECT-only integration using existing local backend configuration:
$env:RUN_CATALOG_DB_TESTS = '1'
npm test
Remove-Item Env:RUN_CATALOG_DB_TESTS
```

The first sandboxed test attempt failed because Node subprocess creation was
blocked (`spawn EPERM`). The authorized run outside the sandbox, with MySQL
integration enabled, passed **25/25 tests**, with no skips. TypeScript checking
and production compilation passed. Without the integration flag, HTTP/unit tests
run without requiring MySQL and the MySQL parent test is explicitly skipped.

Coverage includes input validation, bounded limits, package fields, missing and
inactive products, empty responses, read-only methods, sanitized database errors,
parameter binding, and the seven existing health/CORS/error tests.

Real MySQL integration uses SELECT-only CTE fixtures that shadow table names;
it requires no DDL or fixture writes. Checks cover normalized aliases/names,
literal wildcard/injection input, active filtering, duplicate prevention, limits,
distinct package sizes, latest verified observations, timestamp/ID ties, exclusion
of untrusted/currency/source alternatives, deterministic sorting, empty prices,
nested branches and null coordinates. HTTP tests also exercise real SQL results.

A read-only smoke check of the imported WAMP catalog found 36 active products,
3 supermarkets, 4 branches and 125 unchanged observations. `Coke 1.5L` returned
product 1; its eligible amounts were USD 1.60, 1.70, 1.75 and 1.80. These remain
demonstration amounts. No import was rerun; no catalog/price data was written.

## Owner API acceptance

Start the backend (`npm run dev`), then from another terminal:

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/api/products'
Invoke-RestMethod 'http://127.0.0.1:3000/api/products?search=Coke%201.5L&limit=10'
Invoke-RestMethod 'http://127.0.0.1:3000/api/products/1'
Invoke-RestMethod 'http://127.0.0.1:3000/api/products/1/prices' | ConvertTo-Json -Depth 6
Invoke-RestMethod 'http://127.0.0.1:3000/api/supermarkets' | ConvertTo-Json -Depth 6
```

Confirm package identity, demo labels, dates, cheapest-first amounts and the
availability caveat. Invalid IDs return 400, absent products 404, and unmatched
searches return empty arrays. Full T02 acceptance still requires a later mobile
comparison flow. Freshness/conversion remain open; no current price or stock
availability is asserted.
