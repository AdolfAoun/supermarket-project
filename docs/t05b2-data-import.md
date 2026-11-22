# T05-B2 — OSM supermarket import and review

Prepared 2026-11-22. **No application migration or import has been applied.**

The subsequent [engineering audit](engineering-audit-and-explanations.md) adds
candidate-hash checks for insertion decisions: edits to previously reviewed
duplicate candidates now invalidate the old approval, requiring a fresh preview.
Isolated repeat/rollback and stale-approval regressions passed. This is technical
readiness for owner review, not approval of any real record or import.

Owner/device acceptance and application migration/import approval remain pending.
The owner authorized committing and pushing the T05 source checkpoint after review;
that authorization does not approve any database operation or the proposed pilot.
No fuel optimizer or unrelated redesign is included.

## Final pilot review: hold the proposed 30-record batch

The subsequent read-only review recommends against importing the 30-record pilot
as-is. It has zero Spinneys, Charcutier Aoun, Carrefour, Fahed or Metro classifications.
Only 15 records lie in the broad priority box; none are in Jounieh or Dbayeh.
Fresh baseline/corridor checks found only Jabroun Roastery for the illustrative
Jounieh-to-Jbeil route and 11 Beirut-cluster candidates for Jounieh-to-Beirut.
These are geographic checks, not completed driving-detour evaluations.
Haidar Military Store and Jabroun Roastery particularly need category review.
The stored auto_validated status is a technical classification, not field verification.

The preferred replacement is five coordinate-corroborated Spinneys locations from
the valid dataset: Jbeil (node/4279861633, fixture 1053), Sahel Alma
(node/282761227, 1023), Dbayeh (way/529244245, 1032), Signature
(node/8887176447, 1065), and Ain El Tineh (way/482594452, 1014). Their OSM
points/representatives are about 21-30 m from the retailer's published pins.
All 12 fixture pins were rechecked against the retailer and still matched to six
decimals. This is coordinate corroboration, not a verified entrance or opening claim.

Those five records must reconcile to canonical fixture branches, not be falsely
approved as distinct. The current importer requires the target branches to exist
before linking OSM provenance. The existing fixture SQL imports all 12 locations;
it cannot apply only these five unchanged. A five-location-only deployment needs
a separately reviewed fixture-aware subset plan, or the owner must explicitly
approve all 12 retailer locations before adding reviewed OSM links.

The checked-in 30-record proposal remains unchanged for traceability and is not
approved or recommended as the first application batch. Earlier pilot suggestions
below are preparation history, superseded by this review. No migration or import
was performed during the review or source-checkpoint preparation.

## Delivery and actual coverage

The importer fetches an offline OSM snapshot, normalizes it, validates and flags
records, previews against the existing catalog, and applies only explicitly
approved records in one transaction. It never fetches Overpass during app use.

The [complete per-record review report](../database/sources/osm/2026-11-22-review.md)
and [machine-readable preview](../database/sources/osm/2026-11-22-preview.json)
contain the actual data and decision queue, not invented example locations.

| Metric | Result |
|---|---:|
| Retrieved OSM supermarket records | 521 |
| Nodes / polygon features | 430 / 91 |
| Valid locations | 462 |
| Technically auto-validated | 30 |
| Valid records needing manual review | 432 |
| Rejected, all because their names are missing | 59 |
| Priority-chain name matches | 40 |
| Other named stores, independent or unclassified | 422 |
| Records with suspected duplicate/nearby/fixture signals | 186 |
| Duplicate OSM identifiers in the snapshot | 0 |
| Possible matches to the prepared Spinneys fixture | 10 |
| Valid locations in broad Jbeil–Jounieh–Dbayeh–Beirut box | 179 |

These categories overlap where indicated: review flags are not confirmed
identifications or duplicates. The 422 other stores are **not an audited count of
independently owned businesses**; some may belong to additional regional chains.
No uncertain pair was merged and no missing name was fabricated.

| Priority name | National records | Priority box |
|---|---:|---:|
| Spinneys | 17 | 14 |
| Le Charcutier Aoun | 14 | 13 |
| Carrefour | 4 | 3 |
| Fahed Supermarket | 4 | 3 |
| Metro Superstore | 1 | 1 |

All five expected names are present, but Metro, Carrefour and Fahed are sparsely
represented. Counts reflect mapped name matches, not verified current chains,
franchises or complete branch networks. Brand identity inferred only from a name
is explicitly flagged for review.

Valid regional counts from HOT metadata: Mount Lebanon 174, Beirut 72, Bekaa 65,
South 56, North 39, El Nabatieh 34, Baalbek-El Hermel 14, Akkar 8. The priority
box is latitude 33.85–34.18 / longitude 35.45–35.75, not a route corridor or a
claim that every listed location lies on the coastal road.

## Sources, investigation and licence

Primary retrieved source: [HOT/HDX Points of Interest of Lebanon](https://data.humdata.org/dataset/hotosm_lbn_points_of_interest),
using its official [OSM GeoJSON ZIP](https://production-raw-data-api.s3.amazonaws.com/ISO3/LBN/points_of_interest/hotosm_lbn_points_of_interest_osm_geojson.zip).
The package API reports a source-data date of **2026-11-15**, metadata updated
2026-11-19. Downloaded 2026-11-22. The raw ZIP was 1,706,940 bytes; only the 521
shop=supermarket features are retained in the checked-in raw subset. Full POI
archives and unrelated catalog metadata remain ignored temporary files.

The checked-in source manifest records URLs, dates, raw archive hash, boundary
hash and actual provider investigation. The normalized snapshot retains names,
original-language name, locality, source OSM identity/URL, coordinate method and
review reasons. HOT's export includes administrative locality enrichment. It
omits many original OSM tags, including business contacts in this snapshot; the
Overpass path retains available website/phone tags. Missing contacts are not guessed.

Two small Beirut-area Overpass GET queries, one each on overpass-api.de and
Private.coffee, timed out at 20 seconds. A much smaller POST on the primary also
timed out at 12 seconds; its status endpoint returned HTTP 406. HOT and Geofabrik
downloads worked. This evidence does not isolate server load, network routing or
request filtering. It does show that an oversized country query alone does not
explain the observed failures. No continuous retries or provider-hopping loop is
implemented. Each fetch invocation makes one bounded request.

[Overpass public-service guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
favors small requests and discourages using public instances as an application
backend. The importer accepts a small Lebanon bbox, uses a 15-second Overpass
query timeout, a 25-second transport deadline and response limits; it fails safely
on HTTP 429/5xx, malformed data and incomplete HTTP-200 responses with an error
remark. Operators must inspect failures and wait before another attempt. The HOT
extract has a longer bounded download allowance and avoids live Overpass dependency.

[Geofabrik's Lebanon extract](https://download.geofabrik.de/asia/lebanon.html)
provides an additional PBF option (~50 MB at investigation time). It is documented,
not decoded by a custom PBF parser in this increment. An offline operator can use
established OSM tools to generate supported Overpass-shaped JSON or GeoJSON.
The checked-in Geofabrik boundary is a **coarse extract extent**, not a surveyed
national border. Outside points and explicit foreign-country tags are rejected;
points within 2 km of that coarse boundary require review. Border certainty
remains limited, rather than silently presented as exact country validation.

© OpenStreetMap contributors. OSM data is available under the
[Open Database License](https://www.openstreetmap.org/copyright).
Redistributed OSM subsets/derived location data retain this notice, source and
licence. Keep original OSM data/provenance available when redistributing the
adapted database under the licence's conditions. The retailer fixture retains its
own separate provenance. Mobile directory and route results now show OSM credits,
ODbL identification and a copyright/licence link. No Google scraping, paid API,
Cloud billing, map tiles or new dependency was used.

## Validation and geometry

Only exact shop=supermarket records are selected. Names are Unicode-normalized,
whitespace is standardized and comparison names are case/punctuation normalized;
Arabic names are preserved. English source names are preferred where supplied;
original names remain in provenance. City/locality and street address are used in
branch labels. Missing street addresses are flagged, and absent addresses are
explicitly unavailable; inferred street addresses or reverse geocoding are not used.

Nodes retain their own coordinates. Ways require complete closed polygon geometry.
Relations assemble outer/inner member-way rings by exact shared endpoints; open,
missing, oversized or ambiguous geometry is rejected. HOT polygon/multipolygon
features use their supplied assembled geometry. A bounded scanline algorithm
chooses an interior point, respecting concavity and holes, rather than a bounding-
box centre that may fall outside. Rounded six-decimal coordinates must still lie
inside the polygon. Polygon points remain entrance-review cases; they are not
claimed to be vehicle entrances. Large polygons are flagged as suspicious.

Other checks include OSM type/ID, duplicate IDs, finite coordinates, foreign-country
metadata, coarse geographic bounds, missing/generic names, inactive-business tags,
text lengths, website scheme/credentials, missing locality, nearby records,
existing branch identity and source conflicts. Actual review flags include 468
incomplete addresses, 91 polygon locations, 40 name-only chain identities, 47
same branch/independent-name records, 10 possible retailer-fixture matches and four
near-boundary records. These overlap and include rejected records where applicable.

Auto-validation checks technical quality only. It never means physically verified,
currently open, currently stocked, trusted prices or an owner-approved import.

## Deduplication and existing data

Read-only inspection confirmed the application has 3 demo supermarkets, 4 demo
branches with null coordinates, 36 products and 125 price observations. The
optional 12-branch Spinneys fixture is not installed. Existing unique keys,
foreign keys and coordinate/text constraints were inspected before implementation.

OSM node/way/relation identifiers are distinct identities. Repeated source IDs in
an input batch are rejected, not silently selected from conflicting versions.
Within the snapshot, a small geographic grid flags pairs within 150 m without
merging them. Name collisions are also flagged even when records are farther apart.

Preview compares against current non-demo branches and their coordinates/names.
It also checks the prepared retailer fixture even when that fixture is absent,
using a conservative 300 m Spinneys review radius. Thus changing import order does
not silently create a second record for a likely fixture branch. These are possible
matches, not 10 confirmed duplicate stores.

A reviewed existing-branch link adds provenance only: no branch coordinates,
address/name or price is overwritten. It must match an eligible candidate and the
same business, and the branch fingerprint must still match the approved preview.
Demo names are never eligible source-link targets. Existing real branches without
coordinates require separate owner correction before they can be linked; this
importer does not silently fill or overwrite owner fields.

Nearby distinct businesses can be approved separately: an insert must list every
reviewed existing/fixture candidate in distinctFromBranchIds/distinctFromFixtureIds
and include a review note. Unique branch-name conflicts still fail; a reviewed
branchName can resolve a proven distinct branch's label. Unknown same-name stores
are not automatically grouped into a chain; explicit supermarketId review is
needed to reuse an existing independent business identity. Review notes are an
operator decision record, not evidence of a field visit.

## Database effects and transaction safety

One **optional additive migration**, 003_branch_location_sources.sql, creates a
provenance ledger with OSM type/ID primary key, branch FK, normalized-record hash,
current branch fingerprint, review status, source/review JSON and import timestamp.
This durable identity link is necessary for safe repeats and change detection;
coordinates/names alone cannot reliably distinguish duplicates or preserve source
identity across updates. Existing supermarkets and branches remain the actual
catalog entities. No existing table/record is altered, deleted or replaced.

The importer runs no DDL. Apply migration 003 separately and manually only after
approval; DDL has implicit-commit semantics. A failed data import may leave the
approved ledger table empty, but cannot commit a partially imported data batch.

Application imports require the precise dataset/preview hashes, selected OSM keys,
approval-file digest and exact configured database name. There is no --all mode,
startup import, public import endpoint or default approval. The checked-in pilot
is **proposed**, not approved or applied.

A fresh dedicated connection sets UTC/strict SQL, starts a serializable transaction,
locks current catalog/source rows and revalidates approved decisions against current
state. New neighbors or changed mapped/linked records require a fresh review.
All selected supermarket, branch and source inserts commit together or roll back
together. Lock waits are bounded. Unique/FK collisions and deadlocks fail safely;
there is no hidden transaction retry. The result separates newly inserted chains,
new branches, links to existing branches and already-present source records.

Identical repeat imports do no record updates. Changed source/canonical branch
fingerprints are reported for separate review; automatic replacement/update/delete
is intentionally unsupported. Prices, products, aliases, users and lists are
never written by the importer. Real branches receive no demo observations, so
missing basket prices cannot become invented totals.

## Exact owner-controlled import procedure

These commands are instructions, **not actions already performed on WAMP**.
All CLI commands below run from backend. Existing backend .env supplies the
loopback connection; never copy credentials into commands or mobile configuration.

1. Read the source manifest, this report and the full per-record review queue.
   The original proposed pilot contains 30 technically clean records, but the final
   review above advises against applying it as-is. Select a separately reviewed batch;
   do not treat technical validation or this source checkpoint as import approval.
   Keep a catalog backup under your normal database procedures before applying DDL.
2. If approved, manually apply only database/migrations/003_branch_location_sources.sql
   in the intended schema using your database-administration tool. Do not rerun
   migrations 001/002, demo seed 001 or the real-retailer fixture automatically.
3. Generate a fresh SELECT-only preview against the current database:

```powershell
npx tsx scripts/osm-locations.ts preview --input ../database/sources/osm/2026-11-22-supermarkets.normalized.json --output ../database/sources/osm/local-preview.json.tmp --snapshot ../database/sources/osm/local-catalog.json.tmp --report ../database/sources/osm/local-review.md.tmp
```

4. Copy approval.template.json or pilot-approval.proposed.json to an ignored local
   approval file, e.g. ../database/sources/osm/approval.local.json.tmp. Set database
   to the intended configured schema, and set datasetHash/previewHash to the values
   printed by that fresh preview. List only approved decisions. Unlisted records
   are omitted. For review cases, record a meaningful note (minimum 12 characters)
   and any explicit branch link, distinct-candidate acknowledgement or branch label.
   Rejected records cannot be approved.

```json
{
  "datasetHash": "VALUE_FROM_PREVIEW",
  "previewHash": "VALUE_FROM_PREVIEW",
  "database": "YOUR_CONFIGURED_SCHEMA",
  "decisions": [
    { "key": "node/SELECTED_OSM_ID", "action": "insert" }
  ]
}
```

5. Obtain the approval-file digest, then execute only after explicit approval:

```powershell
npx tsx scripts/osm-locations.ts digest --input ../database/sources/osm/approval.local.json.tmp
npx tsx scripts/osm-locations.ts apply --input ../database/sources/osm/2026-11-22-supermarkets.normalized.json --preview ../database/sources/osm/local-preview.json.tmp --approval ../database/sources/osm/approval.local.json.tmp --approve APPROVAL_FILE_DIGEST --database YOUR_CONFIGURED_SCHEMA
```

The command refuses hash/database mismatches and requires migration 003 already
present. Never use the proposed file's existence as approval. If a transaction
fails, inspect the error, regenerate preview if catalog/source changed, resolve
review decisions, recompute hashes and retry deliberately. Do not issue a blind
COMMIT or use IGNORE/REPLACE to suppress conflicts. Identical completed records
are recognized on retry without adding duplicate branches.

6. Check inserted/link/already-present counts, catalog locations, unchanged prices
   and real-device discovery/navigation. Record the accepted batch and owner
   decision in repository documentation; do not automatically commit.

## Fetching updates

Fetch to a new dated file; keep prior reviewed snapshots for traceability:

```powershell
npx tsx scripts/osm-locations.ts fetch --provider hot --output ../database/sources/osm/NEW-DATE-supermarkets.raw.json
npx tsx scripts/osm-locations.ts normalize --input ../database/sources/osm/NEW-DATE-supermarkets.raw.json --output ../database/sources/osm/NEW-DATE-supermarkets.normalized.json
```

Check the HOT package metadata for its actual data date; --data-date may record
that value. A retrieval timestamp is not the last OSM edit date. For a small
Overpass query, use an approved instance number (0 primary, 1 Private.coffee):

```powershell
npx tsx scripts/osm-locations.ts fetch --provider overpass --instance 0 --bbox 33.88,35.48,33.92,35.55 --output ../database/sources/osm/NEW-DATE-beirut.raw.json
```

Then normalize, preview and approve a new batch. This increment does not merge
multiple raw files automatically: normalize/deduplicate a deliberately combined
input first, treating conflicting source IDs as review failures. Missing records
in a later snapshot do not prove business closure. Existing source changes are
flagged rather than overwriting owner coordinates. A future explicit update
workflow can add reviewed corrections; no destructive sync is provided here.

## T05-B compatibility and performance

The importer reuses the existing catalog API contract and coordinate columns.
No new mobile fetching architecture or routing algorithm was introduced. Only
licence credits and clearer unselected-basket price text changed in the interface.
Valid imported coordinates are geographically eligible regardless of price coverage.
The accepted optional list-price lookup and Google Maps navigation remain in use.

A conservative route envelope now rejects obviously distant points before the
existing exact spherical corridor calculation. Its padding includes half the
longest geometry segment to avoid falsely excluding curved sparse segments;
wrapped longitudes/polar cases remain conservative. The 3 km exact corridor,
20-candidate / 24-insertion limits, original-stop preservation, throttling/cache,
deadlines and incomplete-result semantics are unchanged. No spatial service,
index migration or paid provider was added. Catalog reads still load registered
branches, and exclusion payloads grow with catalog size; this is a remaining
scaling limit rather than a claim of unbounded national performance.

The synthetic 10,000-unique-location test with 1,000 geometry vertices uses only
21 routing calls: one baseline and 20 candidate routes. It reports 9,970 outside-
corridor branches and 10 evaluation-limit exclusions. Other tests still cover
multiple original stops and the total insertion budget.

Actual live OSRM evidence in t05b2-live-routing.json loads all 462 valid public
snapshot locations **in memory only**, including review-pending records. For the
illustrative Jounieh-area → Jbeil journey, the baseline is 17,965.5 m / 1,010.8 s;
21 provider calls produce 20 options. 438 records are outside the corridor and
four remain unevaluated because of the existing candidate limit, so completeness
is correctly false. This demonstrates integration and limits, not approval of
those records or proof of accurate store entrances.

## Verification

| Check | Final outcome |
|---|---|
| Backend full suite, all database groups | 180 passed; no failures/skips |
| Mobile regressions | 101 passed; no failures/skips |
| Private SQL/transport/rendered Chrome | 11 passed; no failures/skips |
| Read-only running-API catalog checks | 6 passed; no failures/skips |
| Backend production/test TypeScript, unused audit and build | Passed |
| Mobile production/test TypeScript and unused audit | Passed |
| Expo iOS/Android/web and separate web exports | Passed |
| Actual HOT fetch CLI | 521 records fetched successfully |
| Live OSRM with national snapshot in memory | Passed; 21 calls, 20 options, honest incomplete coverage |
| Whitespace / source-artifact consistency | Passed |
| Physical iPhone | Pending owner acceptance |
| Expo dependency audit | Exit 1: pre-existing core-package patch drift |

Commands: backend npm run typecheck, typecheck:tests, build; npx tsc --noEmit
--noUnusedLocals --noUnusedParameters; npm test with T03_TEST_PORT=3308,
T03_TEST_DATADIR pointing to the existing dedicated disposable directory and
RUN_CATALOG_DB_TESTS=1. Mobile npm run typecheck, typecheck:tests, test, test:live;
the same unused-symbol audit; test:private-live with the disposable variables and
RUN_T03_BROWSER_TESTS=1; npx expo export --platform all; npx expo export --platform
web --output-dir dist/web; and npx expo install --check. Fetch/normalize/preview
commands are shown above; actual live routing evidence is separate JSON.

The dependency audit still recommends Expo ~58.0.26, constants ~58.0.16, font
~58.0.12, linking ~58.0.17, router ~58.0.32, secure-store ~58.0.3 and status-bar
~58.0.5. These pre-existing recommendations were not silently upgraded. No package
or lockfile dependency was changed by T05-B2. Exports do not establish native
runtime acceptance.

Import/migration writes target verified disposable schemas on loopback port 3308; tests reject
ordinary application port 3306 and verify @@datadir before creating/dropping schemas.
The application database is inspected with SELECT-only operations. Test schemas
are dropped afterward; the dedicated server is stopped and its existing datadir
is preserved. No application schema or records were changed.

Checks include successful live HOT CLI fetching; provider timeout/429/5xx/oversize;
invalid/incomplete JSON/ZIP; missing names/invalid coordinates/foreign country;
Arabic text; node, way and assembled relation geometries; holes/concavity;
duplicate OSM IDs, branch names and nearby distinct stores; demo isolation;
Spinneys fixture conflicts and reviewed links; hash/database/stale-plan rejection;
late atomic rollback; actual HOT subset import/repeat; unchanged prices;
authenticated actual-catalog discovery; 10,000 locations and existing API tests.
Rendered Chrome additionally covers list-free discovery, optional prices, local
slider filtering, missing prices, navigation URL preservation, import/GPS/error/
partial states, widths 320/390/430 and existing list/grocery regressions. Browser
routing is injected and GPS/navigation are emulated/intercepted. Live OSRM evidence
is separate. Physical-iPhone testing remains outstanding.

## Independent critical assessment and next steps

This is a useful national **candidate dataset**, substantially better than a
single retailer fixture for corridor demonstrations. It is not a production-
quality verified supermarket directory. Most usable records need review; 59 are
unnamed, addresses are frequently incomplete, only one Metro name is mapped,
and source freshness/open status is uncertain. Duplicate/nearby flags must not
be treated as proof that stores are the same business. A reviewed 30-record pilot
can exercise the pipeline, but major-chain corridor demonstrations need additional
reviewed chain records and entrance checks.

The name-based chain alias list is intentionally small and readable; unknown
regional chains remain unclassified rather than silently grouped. The temporary
source export can omit original tags; a later successful bounded Overpass query
or established offline PBF tools can enrich those facts. The coarse country
boundary and polygon interior coordinate remain approximations requiring review.
The source ledger adds one table and hashes, which is additional machinery, but
avoids brittle matching based only on changing names/coordinates. Existing field
corrections are preserved; automated source updates are deferred rather than
risking overwrites. The bounded ZIP reader deliberately supports only the simple
single-GeoJSON archive format, not arbitrary ZIP/ZIP64 extraction.

Recommended next steps: review the proposed pilot; inspect the 34 priority-chain
name matches in the coastal box and the ten retailer matches; reconcile known
fixture branches explicitly; verify entrances on a physical trip; and approve a
small application batch before larger expansion. Supplement missing chains using
official retailer branch directories/business confirmation with permitted reuse
and documented provenance, or local field surveys. Do not invent OSM identifiers,
scrape Google Maps or upload third-party data to OSM without licence permission.
Existing physical-iPhone checklist in t05b-verification.md still applies, with
additional checks for Arabic labels, source credit links, missing prices and
duplicate-free results after an approved import. T05-C fuel integration remains
out of scope.
