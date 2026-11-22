import { inflateRawSync } from 'node:zlib';
export const HOT_URL = 'https://production-raw-data-api.s3.amazonaws.com/ISO3/LBN/points_of_interest/hotosm_lbn_points_of_interest_osm_geojson.zip';
export const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'] as const;
export class SourceError extends Error {
  constructor(public readonly reason: 'timeout' | 'unavailable' | 'rate_limited' | 'invalid' | 'oversized') { super(`Location source ${reason}`); }
}
export async function download(url: string, transport = fetch, timeoutMs = 25000, maxBytes = 32000000): Promise<Buffer> {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json, application/zip', 'User-Agent': 'LebanonSupermarketCapstone/1.0 (offline location import)' } });
    if (!response.ok) { await response.body?.cancel(); throw new SourceError(response.status === 429 ? 'rate_limited' : 'unavailable'); }
    if (!response.body || Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new SourceError('oversized'); }
    const reader = response.body.getReader(), chunks: Buffer[] = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) throw new SourceError('oversized'); chunks.push(Buffer.from(value)); } }
    finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(chunks);
  } catch (error) { if (error instanceof SourceError) throw error; throw new SourceError(controller.signal.aborted ? 'timeout' : 'unavailable'); }
  finally { clearTimeout(timeout); }
}
// Read exactly one bounded GeoJSON member in memory. Never extract archive paths
// to disk, launch a shell, accept encrypted/ZIP64 archives or add a ZIP dependency.
export function geojsonFromZip(bytes: Buffer): unknown {
  try {
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
    if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new Error();
    const count = bytes.readUInt16LE(end + 10); let cursor = bytes.readUInt32LE(end + 16), found: Buffer | null = null;
    if (count > 100 || cursor >= end) throw new Error();
    for (let i = 0; i < count; i++) {
      if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error();
      const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
      const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32), offset = bytes.readUInt32LE(cursor + 42);
      const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength);
      cursor += 46 + nameLength + extra + comment;
      if (!name.endsWith('.geojson')) continue;
      if (found || flags & 1 || ![0, 8].includes(method) || size > 128000000 || compressed > 32000000 || bytes.readUInt32LE(offset) !== 0x04034b50) throw new Error();
      const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
      if (start + compressed > end) throw new Error();
      const data = bytes.subarray(start, start + compressed);
      found = method === 8 ? inflateRawSync(data, { maxOutputLength: 128000000 }) : data;
      if (found.length !== size) throw new Error();
    }
    if (!found) throw new Error();
    return JSON.parse(found.toString('utf8'));
  } catch { throw new SourceError('invalid'); }
}
export function overpassQuery(bbox: number[]): string {
  if (bbox.length !== 4 || !bbox.every(Number.isFinite) || bbox[0] < 33 || bbox[2] > 35 || bbox[1] < 35 || bbox[3] > 37 || bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 0.04) throw new Error('Use a small Lebanon bounding box (at most 0.04 square degrees)');
  return `[out:json][timeout:15][maxsize:16777216];nwr["shop"="supermarket"](${bbox.join(',')});out meta geom;`;
}
