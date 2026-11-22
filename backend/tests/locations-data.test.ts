import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { download, geojsonFromZip, overpassQuery, SourceError } from '../src/modules/locations-data/sources.js';
import { normalizeDocument, type LocationDataset } from '../src/modules/locations-data/normalize.js';
import { representative, withinBoundary, overpassGeometry } from '../src/modules/locations-data/geometry.js';
import { preview, branchDigest, recordDigest, type CatalogSnapshot } from '../src/modules/locations-data/preview.js';

export const boundary = { type: 'Polygon', coordinates: [[[35, 33], [37, 33], [37, 35], [35, 35], [35, 33]]] };
export const source: LocationDataset['source'] = { url: 'https://example.com/osm', retrievedAt: '2026-11-22T00:00:00Z', license: 'ODbL-1.0', rawSha256: 'a'.repeat(64), dataDate: null };
export const node = (id: number, name = 'Local supermarket', lat = 34, lon = 35.6) => ({ type: 'node', id, lat, lon, tags: { shop: 'supermarket', name, 'addr:city': 'Fixture town', 'addr:street': 'Fixture road' } });
export const dataset = (...elements: unknown[]) => normalizeDocument({ elements }, boundary, source);
export const empty: CatalogSnapshot = { supermarkets: [], branches: [], sources: [] };

test('bounded source retrieval handles valid data, timeout, unavailable, rate limits and oversize without automatic retries', async () => {
  let calls = 0;
  const fake = (async () => { calls++; return new Response('{"elements":[]}'); }) as typeof fetch;
  assert.equal((await download('https://example.com', fake)).toString(), '{"elements":[]}'); assert.equal(calls, 1);
  for (const status of [429, 500, 503]) await assert.rejects(download('https://example.com', (async () => new Response('', { status })) as typeof fetch),
    error => error instanceof SourceError && error.reason === (status === 429 ? 'rate_limited' : 'unavailable'));
  await assert.rejects(download('https://example.com', (async () => new Response('12345')) as typeof fetch, 100, 4), error => error instanceof SourceError && error.reason === 'oversized');
  await assert.rejects(download('https://example.com', ((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort'))))) as typeof fetch, 5),
    error => error instanceof SourceError && error.reason === 'timeout');
  assert.match(overpassQuery([33.88, 35.48, 33.92, 35.55]), /out meta geom/);
  assert.throws(() => overpassQuery([33, 35, 35, 37]));
});

test('bounded ZIP reader retrieves a single GeoJSON member and rejects invalid/multiple/oversized archives', () => {
  const data = Buffer.from('{"type":"FeatureCollection","features":[]}'), compressed = deflateRawSync(data), name = Buffer.from('poi.geojson');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  const zip = Buffer.concat([local, name, compressed, central, name, end]);
  assert.equal((geojsonFromZip(zip) as { type: string }).type, 'FeatureCollection');
  const twice = Buffer.from(end); twice.writeUInt16LE(2, 10);
  assert.throws(() => geojsonFromZip(Buffer.concat([local, name, compressed, central, name, central, name, twice])));
  assert.throws(() => geojsonFromZip(Buffer.from('invalid')));
  const oversized = Buffer.from(zip); oversized.writeUInt32LE(128000001, end.readUInt32LE(16) + 24); assert.throws(() => geojsonFromZip(oversized));
  const encrypted = Buffer.from(zip); encrypted.writeUInt16LE(1, end.readUInt32LE(16) + 8); assert.throws(() => geojsonFromZip(encrypted));
});

test('normalization preserves Arabic names, names/locality/address metadata, chains and independent identities', () => {
  const d = dataset(node(1, 'Spinneys'), node(2, 'متجر الأرز', 34.05));
  assert.equal(d.records[0].chain, 'Spinneys'); assert.equal(d.records[1].supermarket, 'متجر الأرز');
  assert.equal(d.records[1].status, 'auto_validated'); assert.equal(d.records[1].branch, 'متجر الأرز - Fixture town');
  const hot = normalizeDocument({ type: 'FeatureCollection', features: [{ properties: { id: 'node/3', shop: 'supermarket', name: 'محل', name_en: 'Local shop', adm0_pcode: 'LBN', adm3_name: 'Byblos', website: 'https://example.com' }, geometry: { type: 'Point', coordinates: [35.65, 34.12] } }] }, boundary, source);
  assert.equal(hot.records[0].locality, 'Byblos'); assert.equal(hot.records[0].originalName, 'محل'); assert.equal(hot.records[0].website, 'https://example.com'); assert.ok(hot.records[0].reasons.includes('incomplete_address'));
});

test('missing names, invalid coordinates/IDs, foreign countries and partial provider output are rejected', () => {
  const d = dataset(node(1, ''), node(2, 'Invalid', 91), node(3, 'Outside', 32), { ...node(4), tags: { ...node(4).tags, 'addr:country': 'SY' } }, { ...node(5), id: -1 });
  assert.ok(d.records.every(r => r.status === 'rejected'));
  assert.throws(() => normalizeDocument({ elements: [node(1)], remark: 'runtime error: timeout' }, boundary, source));
});

test('node/way/relation geometry uses interior points for concavity, holes and multipolygons; incomplete relations fail safely', () => {
  const ring = [[35.5, 34], [35.6, 34], [35.6, 34.01], [35.51, 34.01], [35.51, 34.1], [35.5, 34.1], [35.5, 34]];
  const geometry = { type: 'Polygon', coordinates: [ring] };
  const result = representative(geometry); assert.equal(result.method, 'interior_point'); assert.ok(withinBoundary(result.point, geometry));
  const hole = { type: 'Polygon', coordinates: [boundary.coordinates[0], [[35.3, 33.3], [36.7, 33.3], [36.7, 34.7], [35.3, 34.7], [35.3, 33.3]]] };
  assert.ok(withinBoundary(representative(hole).point, hole));
  const p = (lon: number, lat: number) => ({ lon, lat });
  const relation = { type: 'relation', id: 2, members: [
    { type: 'way', role: 'outer', geometry: [p(35.5, 34), p(35.51, 34), p(35.51, 34.01)] },
    { type: 'way', role: 'outer', geometry: [p(35.5, 34), p(35.5, 34.01), p(35.51, 34.01)] },
  ], tags: node(1).tags };
  const d = dataset({ type: 'way', id: 1, geometry: ring.map(([lon, lat]) => p(lon, lat)), tags: node(1).tags }, relation);
  assert.ok(d.records.every(r => r.status === 'manual_review' && r.method === 'interior_point'));
  assert.ok(withinBoundary(representative(overpassGeometry(relation)).point, boundary));
  assert.throws(() => overpassGeometry({ ...relation, members: relation.members.slice(0, 1) }));
});

test('duplicate OSM IDs are rejected; nearby distinct stores and same names remain separate review records', () => {
  const duplicate = dataset(node(1), node(1)); assert.ok(duplicate.records.every(r => r.reasons.includes('duplicate_osm_identifier')));
  const d = dataset(node(1, 'Shop A'), node(2, 'Shop B', 34.0001), node(3, 'Shop A', 34.03));
  const p = preview(d, empty, []); assert.equal(p.rows.length, 3);
  assert.ok(p.rows[0].reasons.some(r => r.startsWith('nearby_osm:')));
  assert.ok(p.rows[2].reasons.includes('duplicate_branch_or_independent_name'));
  assert.equal(d.records[0].key, 'node/1'); assert.equal(d.records[1].key, 'node/2');
});

test('existing demo records never match; retailer fixture conflicts are identified before either import order', () => {
  const d = dataset(node(1, 'Spinneys'));
  const catalog: CatalogSnapshot = { supermarkets: [{ id: 1, name: 'Spinneys - DEMONSTRATION DATA' }], branches: [{ id: 1, supermarketId: 1, name: 'DEMO', address: 'fictional', latitude: 34, longitude: 35.6 }], sources: [] };
  const p = preview(d, catalog, [{ branchId: 1023, supermarketId: 1001, name: 'Sahel Alma', address: 'Retailer point', latitude: 34, longitude: 35.6 }]);
  assert.deepEqual(p.rows[0].existingBranchIds, []); assert.deepEqual(p.rows[0].fixtureBranchIds, [1023]); assert.equal(p.rows[0].action, 'review');
  catalog.sources.push({ key: d.records[0].key, branchId: 1, recordHash: recordDigest(d.records[0]), catalogHash: branchDigest(catalog.branches[0]) });
  assert.ok(preview(d, catalog, []).rows[0].reasons.includes('mapped_record_changed'), 'Externally tainted demo mappings cannot count as existing real locations');
});

test('checked-in live HOT dataset is reproducible, has all priority chains and coherent quality accounting', async () => {
  const raw = JSON.parse(await readFile('../database/sources/osm/2026-11-22-supermarkets.raw.json', 'utf8'));
  const boundary = JSON.parse(await readFile('../database/sources/osm/lebanon-boundary.geojson', 'utf8'));
  const saved = JSON.parse(await readFile('../database/sources/osm/2026-11-22-supermarkets.normalized.json', 'utf8'));
  assert.deepEqual(normalizeDocument(raw.document, boundary, raw.source), saved);
  const result = preview(saved, empty, []);
  assert.equal(result.summary.retrieved, 521); assert.deepEqual(result.summary.missingExpectedChains, []);
  assert.equal(result.summary.valid + result.summary.rejected, 521);
  assert.ok(saved.records.some((r: { name: string }) => /[\u0600-\u06ff]/.test(r.name)));
});
