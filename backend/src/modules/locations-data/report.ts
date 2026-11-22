import type { LocationDataset } from './normalize.js';
import type { LocationPreview } from './import.js';

export function reviewReport(dataset: LocationDataset, plan: LocationPreview): string {
  const escape = (v: string) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
  const s = plan.summary;
  return `# Lebanon OSM supermarket preview — no import applied

Source: ${dataset.source.url}

© OpenStreetMap contributors. Data available under [ODbL](https://www.openstreetmap.org/copyright).
Retrieved: ${dataset.source.retrievedAt}. Source data date: ${dataset.source.dataDate ?? 'not supplied'}.

Retrieved ${s.retrieved}; valid ${s.valid}; auto-validated ${s.autoValidated}; rejected ${s.rejected}; review ${s.requiringReview}.
${s.suspectedDuplicates} records have duplicate/nearby/fixture review signals; these are NOT confirmed duplicates.
Priority-chain name matches: ${s.majorChainBranches}. Other named stores: ${s.otherNamedBusinesses}; ownership/independence is unverified.
${s.corridorRecords} valid points fall in the broad Jbeil–Beirut priority box; this is not an OSRM route search.

## Priority-chain name matches

| Name | Records |
|---|---:|
${Object.entries(s.chainCounts).map(([name, n]) => `| ${escape(name)} | ${n} |`).join('\n')}

## Valid records by source region

| Region | Records |
|---|---:|
${Object.entries(s.regions).map(([name, n]) => `| ${escape(name)} | ${n} |`).join('\n')}

## Review queue

No record is physically verified. Auto-validation is only a technical quality classification.
Link decisions preserve existing branch coordinates. Possible matches require explicit review.

| OSM record | Name | Locality | Latitude, longitude | Status | Reasons | Existing / fixture candidates |
|---|---|---|---|---|---|---|
${plan.rows.map(row => {
    const r = dataset.records.find(r => r.key === row.key)!;
    return `| [${escape(r.key)}](${r.sourceUrl}) | ${escape(r.name || '(missing)')} | ${escape(r.locality ?? '(unknown)')} | ${r.latitude}, ${r.longitude} | ${row.status} | ${escape(row.reasons.join('; '))} | ${row.existingBranchIds.join(',')} / ${row.fixtureBranchIds.join(',')} |`;
  }).join('\n')}
`;
}
