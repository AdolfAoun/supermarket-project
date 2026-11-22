# Optional real supermarket locations

`001_real_branches.json` records 12 **retailer-listed** Spinneys locations reviewed
on 2026-11-21. `../seeds/002_optional_real_locations.sql` inserts those facts into
the existing supermarkets/branches tables only. It inserts no prices.

Primary source: [Spinneys Lebanon branch finder](https://www.spinneyslebanon.com/branch-finder/).
The published location list supplies retailer location IDs, branch names,
addresses and marker coordinates. Retain its full coordinate precision here;
the existing MySQL DECIMAL(9,6) fields round to six decimals in the optional SQL.
Names/addresses are descriptive source facts, not guaranteed current operations
or field-verified entrances. No opening hours or stock claims are imported.

The selected branches cover Sahel Alma, Zouk, Dbayeh, Elissar, Ajaltoun, Jbeil and
several Beirut neighborhoods. This is one chain's small sample, not comprehensive
coverage of Ghazir, Kaslik, Halat, Fidar, Antelias or Lebanon. No store was invented
to fill those gaps. Ajaltoun/Elissar provide actual inland location points, but
the standard live coastal journeys exclude them at the geographic prefilter.
The synthetic mountain-road regression tests separately test geographic closeness
with excessive driving time; that fixture is not asserted to describe these stores.

## OpenStreetMap/Overpass investigation

The intended open-data query was:

```overpass
[out:json][timeout:15];
nwr["shop"="supermarket"]["name"](33.86,35.45,34.18,35.75);
out center meta;
```

Manual bounded requests to the primary Overpass instance returned HTTP 502 or
timed out. Kumi/Private.coffee and the OSM-listed VK endpoint also timed out in
this session. A documented POST to the primary instance timed out too. These
are observed availability failures, not a claim that OSM has no supermarkets.
See the [public instance list](https://wiki.openstreetmap.org/wiki/Overpass_API)
and [Overpass usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).

Use the retailer's actual published points as the practical alternative for this
fixture. Every `osmId` is null; no OSM identifiers, addresses or businesses were
guessed. The application does not depend on Overpass at runtime, scrape Google
business listings, or call the retailer's embedded map APIs.

## Review/deduplication and importing

Source retailer IDs, names and six-decimal coordinate pairs are unique in this
fixture. Existing demo records have distinct IDs and names and remain untouched.
Source IDs 5/8/14/23/32/38/44/53/56/65/78/81 map to branch IDs 1005–1081 under
supermarket ID 1001. Generic future imports still need explicit deduplication
against owner records. A matching ID/name must not be overwritten automatically.

Review the JSON and SQL, then manually import the optional SQL into the selected
existing schema using phpMyAdmin or the MySQL client. It is not a migration. Do not
reload seed 001. Use a dedicated session without an open transaction: routine DDL
implicitly commits. CREATE ROUTINE, EXECUTE and ALTER ROUTINE privileges are needed.

The temporary t05b_import_real_locations procedure starts one InnoDB transaction.
It inserts missing IDs, then checks exact names, addresses, chain identity and
six-decimal coordinates. Identical repeated records are accepted without updates.
Unique-name collisions or differing existing IDs/content raise an error; an EXIT
handler rolls back every fixture write and rethrows the error. This remains safe
even if an import client continues to a later COMMIT. Concurrent conflicting
imports may fail safely rather than retry automatically.

The routine is dropped after success. If your client stops at the failed CALL,
the routine can remain, but its data transaction has already rolled back. Inspect
the reported conflict; run `DROP PROCEDURE t05b_import_real_locations` in that
selected schema before retrying. The script deliberately does not drop an existing
routine at startup or overwrite owner data. There is no IGNORE/REPLACE/UPDATE/DELETE
or automatic application import. Do not issue a blind COMMIT to recover a failure.
The checked-in fixture has only been applied to disposable integration schemas
by Codex. Owner application data has not been modified.

Expected addition: 1 supermarket, 12 branches, **0 price observations**. A normal
demo catalog becomes 4 supermarkets/16 branches, while all 125 demo observations
remain assigned to original demo branch IDs. Real branches display Prices
unavailable and cannot become cheapest complete baskets through inherited prices.
If the owner already has additional data, verify increments rather than assuming
these historical totals apply.
