import { createHash } from 'node:crypto';
import { distanceMeters, distanceToRouteMeters, type Coordinate } from '../shared/geo.js';
import { overpassGeometry, representative, withinBoundary, polygons, polygonContains } from './geometry.js';
export const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const normalizedName = (value: string): string => value.normalize('NFKC').toLocaleLowerCase('en').replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
export const CHAINS: Record<string, string[]> = {
  Spinneys: ['spinneys', 'spinneys signature'],
  'Le Charcutier Aoun': ['le charcutier aoun', 'charcutier aoun', 'charcuterie aoun', 'le charcutier'],
  Carrefour: ['carrefour', 'carrefour market'],
  'Fahed Supermarket': ['fahed', 'fahed supermarket'],
  'Metro Superstore': ['metro', 'metro superstore', 'metro supermarket'],
};
export function chainName(name: string): string | null {
  const normalized = normalizedName(name);
  return Object.entries(CHAINS).find(([, aliases]) => aliases.some(a => normalized === a || normalized.startsWith(a + ' ')))?.[0] ?? null;
}
export interface LocationRecord extends Coordinate {
  key: string; name: string; originalName: string; supermarket: string; chain: string | null;
  branch: string; address: string; locality: string | null; region: string | null;
  method: 'osm_point' | 'interior_point';
  status: 'auto_validated' | 'manual_review' | 'rejected'; reasons: string[];
  sourceUrl: string; website: string | null; phone: string | null; sourceTimestamp: string | null;
}
export interface LocationDataset { format: 1; source: { url: string; retrievedAt: string; license: 'ODbL-1.0'; rawSha256: string; dataDate: string | null }; records: LocationRecord[] }
const text = (v: unknown): string => typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function normalizeDocument(document: unknown, boundary: unknown, source: LocationDataset['source']): LocationDataset {
  const doc = obj(document);
  const hot = doc.type === 'FeatureCollection';
  const input = hot ? doc.features : doc.elements;
  if (!Array.isArray(input) || input.length > 100000) throw new Error('Invalid/oversized OSM document');
  // Overpass can return a partial result with HTTP 200 and an error remark.
  if (doc.remark) throw new Error('Incomplete Overpass result; do not import');
  const records: LocationRecord[] = [];
  for (const [index, value] of input.entries()) {
    const row = obj(value), tags = obj(hot ? row.properties : row.tags);
    if (tags.shop !== 'supermarket') continue;
    const key = hot ? text(tags.id) : `${row.type}/${row.id}`;
    const name = text(tags['name:en'] ?? tags.name_en) || text(tags.name);
    const locality = text(tags['addr:city'] ?? tags.addr_city) || text(tags['addr:suburb']) || text(tags.adm3_name) || null;
    const street = text(tags['addr:street'] ?? tags.addr_street), house = text(tags['addr:housenumber'] ?? tags.addr_housenumber);
    const full = text(tags['addr:full'] ?? tags.addr_full);
    const address = full || [house, street, locality].filter(Boolean).join(', ') || 'Address unavailable';
    const chain = chainName(text(tags.brand) || name);
    const branch = text(tags.branch) || (locality ? `${name} - ${locality}` : name);
    const record: LocationRecord = { key, name, originalName: text(tags.name), supermarket: chain ?? name, chain,
      branch, address, locality, region: text(tags.adm1_name) || null, latitude: 0, longitude: 0, method: 'osm_point',
      status: 'auto_validated', reasons: [], sourceUrl: `https://www.openstreetmap.org/${key}`, website: null, phone: null,
      sourceTimestamp: text(row.timestamp) || null };
    const reject = (reason: string) => { record.status = 'rejected'; record.reasons.push(reason); };
    const review = (reason: string) => { if (record.status !== 'rejected') record.status = 'manual_review'; record.reasons.push(reason); };
    if (!/^(node|way|relation)\/[1-9]\d{0,18}$/.test(key) || BigInt(key.split('/')[1] || '0') > 18446744073709551615n
      || (!hot && (typeof row.id !== 'number' || !Number.isSafeInteger(row.id)))) { record.key = `invalid:${index}`; reject('invalid_osm_identifier'); }
    if (!name) reject('missing_name');
    if ([name, record.supermarket, branch].some(s => s.length > 120) || address.length > 255 || /[\u0000-\u001f\u007f]/.test(name + address)) reject('invalid_text');
    if (/demonstration data|\bdemo\b/i.test(name)) reject('demonstration_name');
    if (['supermarket', 'market', 'سوبر ماركت'].includes(normalizedName(name))) review('generic_name');
    if (!full && !street) review('incomplete_address');
    if (chain && !text(tags.brand)) review('chain_identity_from_name_only');
    if (!locality) review('missing_locality');
    if (tags['disused:shop'] || tags.disused === 'yes' || tags.abandoned === 'yes' || tags['abandoned:shop']) reject('inactive_business_tag');
    const country = text(tags['addr:country'] ?? tags.adm0_pcode).toUpperCase();
    if (country && !['LB', 'LBN', 'LEBANON'].includes(country)) reject('outside_lebanon');
    try {
      const geometry = hot ? row.geometry : overpassGeometry(row);
      const { point, method } = representative(geometry);
      record.longitude = Number(point[0].toFixed(6)); record.latitude = Number(point[1].toFixed(6)); record.method = method;
      if (!withinBoundary(point, boundary)) reject('outside_lebanon_extract_boundary');
      if (polygons(boundary).some(p => p.some(r => distanceToRouteMeters(record, r) < 2000))) review('near_coarse_extract_boundary');
      if (method === 'interior_point') {
        if (!polygons(geometry).some(p => polygonContains([record.longitude, record.latitude], p))) reject('rounded_point_outside_polygon');
        review('polygon_not_verified_entrance');
        const points = polygons(geometry).flat(2);
        if (Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])) > 0.01 || Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1])) > 0.01) review('suspicious_large_polygon');
      }
    } catch { reject('invalid_or_incomplete_geometry'); }
    const website = text(tags.website ?? tags['contact:website']);
    if (website) { try { const url = new URL(website); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || website.length > 2048) throw new Error(); record.website = website; } catch { review('invalid_website'); } }
    const phone = text(tags.phone ?? tags['contact:phone']);
    if (phone && phone.length <= 100) record.phone = phone;
    records.push(record);
  }
  const ids = new Map<string, LocationRecord[]>();
  for (const r of records) ids.set(r.key, [...(ids.get(r.key) ?? []), r]);
  for (const same of ids.values()) if (same.length > 1) for (const r of same) { r.status = 'rejected'; r.reasons.push('duplicate_osm_identifier'); }
  // Proximity is a review signal even when names differ. Never merge automatically.
  const grid = new Map<string, LocationRecord[]>();
  for (const r of records.filter(r => r.status !== 'rejected')) {
    const x = Math.floor(r.longitude / 0.003), y = Math.floor(r.latitude / 0.003);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const other of grid.get(`${x + dx}:${y + dy}`) ?? []) {
      if (distanceMeters(r, other) <= 150) for (const [a, b] of [[r, other], [other, r]]) {
        a.status = 'manual_review'; a.reasons.push(`nearby_osm:${b.key}`);
      }
    }
    const cell = `${x}:${y}`; grid.set(cell, [...(grid.get(cell) ?? []), r]);
  }
  for (const r of records) r.reasons = [...new Set(r.reasons)].sort();
  records.sort((a, b) => a.key.localeCompare(b.key, 'en'));
  return { format: 1, source, records };
}
