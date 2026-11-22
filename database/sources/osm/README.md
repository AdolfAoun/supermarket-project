# Lebanon OSM supermarket snapshot

© OpenStreetMap contributors. OSM data available under the
[Open Database License (ODbL)](https://www.openstreetmap.org/copyright).

Source: [HOT/HDX Lebanon points of interest](https://data.humdata.org/dataset/hotosm_lbn_points_of_interest).
Fetched 2026-11-22; package data date 2026-11-15. See source-manifest.json for
provider metadata, archive/boundary hashes and the bounded Overpass investigation.

- `2026-11-22-supermarkets.raw.json`: supermarket-only GeoJSON subset with source metadata.
- `2026-11-22-supermarkets.normalized.json`: 521 technical validation/review records; no owner approval implied.
- `2026-11-22-catalog-snapshot.json`: read-only existing demo branch snapshot; no credentials/accounts.
- `2026-11-22-preview.json` / `2026-11-22-review.md`: machine-readable and human-readable per-record review queues.
- `lebanon-boundary.geojson`: coarse Geofabrik extract extent, not a surveyed border.
- `approval.template.json`: empty decision list; importing nothing is intentional.
- `pilot-approval.proposed.json`: proposed 30-record technical-quality pilot, **not approved or applied**.

The final read-only review recommends against applying that original pilot as-is:
it lacks the five priority chains and useful Jounieh/Dbayeh coverage, and includes
business-category uncertainties. A smaller, coordinate-corroborated Spinneys
corridor batch is recommended, subject to fixture reconciliation and a separately
approved execution plan. The proposal is retained unchanged for traceability;
see the final-review section of the full report below.

Actual results: 462 valid, 59 unnamed/rejected, 30 technically auto-validated and
432 valid needing review. 40 priority-chain name matches, 422 other named stores
(independent/unclassified), 179 valid records in the broad priority box. 186 records
have duplicate/nearby/fixture signals, not 186 confirmed duplicate stores. There
are zero duplicate OSM IDs and ten potential matches to the retailer fixture.

The downloaded archive/full package metadata and live-fetch check are ignored
`.tmp` artifacts. Checked-in data contains only the requested supermarket subset.
No application data has been imported. Do not treat raw or auto-validated records
as physically verified entrances, current operations or price observations.

See [the full methodology, approval procedure, tests and critical assessment](../../../docs/t05b2-data-import.md).
