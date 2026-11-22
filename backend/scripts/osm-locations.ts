import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { download, geojsonFromZip, HOT_URL, OVERPASS, overpassQuery } from '../src/modules/locations-data/sources.js';
import { normalizeDocument, digest, type LocationDataset } from '../src/modules/locations-data/normalize.js';
import { preview } from '../src/modules/locations-data/preview.js';
import { importApproved, readSnapshot, type Approval } from '../src/modules/locations-data/import.js';
import { reviewReport } from '../src/modules/locations-data/report.js';

const [command, ...args] = process.argv.slice(2);
function option(name: string): string | undefined { const index = args.indexOf('--' + name); return index < 0 ? undefined : args[index + 1]; }
const required = (name: string) => { const value = option(name); if (!value || value.startsWith('--')) throw new Error(`Missing --${name}`); return value; };
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
async function save(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.tmp';
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n'); await rename(temporary, path);
}
const sources = resolve('../database/sources/osm');
async function main() {
  if (command === 'digest') { console.log(digest(await json(required('input')))); return; }
  if (command === 'fetch') {
    const provider = required('provider'), output = required('output');
    if (!['hot', 'overpass'].includes(provider)) throw new Error('Provider must be hot or overpass');
    const query = provider === 'overpass' ? overpassQuery(required('bbox').split(',').map(Number)) : null;
    const index = Number(option('instance') ?? 0);
    if (!Number.isInteger(index) || index < 0 || index >= OVERPASS.length) throw new Error('Unknown approved Overpass instance');
    const url = query ? `${OVERPASS[index]}?data=${encodeURIComponent(query)}` : HOT_URL;
    // One bounded request per invocation, no hidden retry/failover loop. Operators
    // inspect status and wait before choosing a different instance or extract.
    const bytes = await download(url, fetch, provider === 'hot' ? 60000 : 25000);
    const document = provider === 'hot' ? geojsonFromZip(bytes) : JSON.parse(bytes.toString('utf8'));
    if (document.remark) throw new Error('Overpass reports incomplete output');
    const features = provider === 'hot' ? document.features : document.elements;
    if (!Array.isArray(features)) throw new Error('Source document has no features');
    const selected = provider === 'hot' ? { type: 'FeatureCollection', features: features.filter(f => f.properties?.shop === 'supermarket') }
      : { elements: features.filter(f => f.tags?.shop === 'supermarket').map(({ user: _user, uid: _uid, changeset: _changeset, ...element }) => element), osm3s: document.osm3s };
    await save(output, { source: { url, retrievedAt: new Date().toISOString(), license: 'ODbL-1.0', rawSha256: createHash('sha256').update(bytes).digest('hex'), dataDate: option('data-date') ?? null }, document: selected });
    console.log(JSON.stringify({ fetched: selected.features?.length ?? selected.elements?.length, output, source: provider })); return;
  }
  if (command === 'normalize') {
    const input = await json(required('input')), boundary = await json(resolve(sources, 'lebanon-boundary.geojson'));
    const dataset = normalizeDocument(input.document, boundary, input.source);
    await save(required('output'), dataset); console.log(JSON.stringify({ records: dataset.records.length, datasetHash: digest(dataset) })); return;
  }
  if (!['preview', 'apply'].includes(command)) throw new Error('Commands: fetch, normalize, preview, apply (see docs/t05b2-data-import.md)');
  const dataset = await json(required('input')) as LocationDataset;
  const fixture = (await json(resolve('../database/sources/001_real_branches.json'))).branches;
  // Import env/database configuration only for DB commands. Fetch/normalize never
  // load credentials. Each command opens a fresh, dedicated loopback connection.
  const { env } = await import('../src/config/env.js');
  if (!['127.0.0.1', 'localhost', '::1'].includes(env.db.host)) throw new Error('Import tooling requires loopback MySQL');
  const connection = await mysql.createConnection({ ...env.db, timezone: 'Z', connectTimeout: 5000 });
  try {
    if (command === 'preview') {
      await connection.query('SET TRANSACTION READ ONLY'); await connection.beginTransaction();
      const snapshot = await readSnapshot(connection); await connection.commit();
      const result = preview(dataset, snapshot, fixture);
      await save(required('output'), result);
      if (option('report')) await writeFile(required('report'), reviewReport(dataset, result));
      if (option('snapshot')) await save(required('snapshot'), snapshot);
      console.log(JSON.stringify({ ...result.summary, previewHash: digest(result), datasetHash: result.datasetHash }));
    } else {
      const plan = await json(required('preview')), approval = await json(required('approval')) as Approval;
      // Approval must be intentional for this precise file AND database. No
      // default approval, --all flag, migration or automatic app startup import.
      if (required('approve') !== digest(approval) || required('database') !== env.db.database) throw new Error('Explicit approval digest and exact configured database required');
      await connection.query("SET SESSION time_zone='+00:00', sql_mode=CONCAT_WS(',',@@SESSION.sql_mode,'STRICT_TRANS_TABLES')");
      const boundary = await json(resolve(sources, 'lebanon-boundary.geojson'));
      console.log(JSON.stringify(await importApproved(connection, dataset, plan, approval, fixture, boundary)));
    }
  } finally { await connection.end(); }
}
main().catch(error => { console.error(error.code ? `Location operation failed (${error.code}); no import success claimed` : error.message); process.exitCode = 1; });
