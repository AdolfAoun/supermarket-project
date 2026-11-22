import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalize, resolve } from 'node:path';
import { test } from 'node:test';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createCatalogRepository, createSqlReader } from '../src/modules/catalog/repository.js';
import type { AuthRepository } from '../src/modules/auth/repository.js';
import { normalizeDocument, digest } from '../src/modules/locations-data/normalize.js';
import { preview } from '../src/modules/locations-data/preview.js';
import { importApproved, readSnapshot, type Approval } from '../src/modules/locations-data/import.js';
import { executeSqlScript } from './fixtures/sql-script.js';

test('OSM approved imports on verified disposable MySQL', { skip: !process.env.T03_TEST_PORT }, async t => {
  const port = Number(process.env.T03_TEST_PORT), directory = process.env.T03_TEST_DATADIR;
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== 3306); assert.ok(directory);
  const canonical = (s: string) => normalize(s).replace(/[\\/]+$/, '').toLowerCase();
  assert.equal(canonical(directory), canonical(resolve(process.env.TEMP!, 'supermarket-t03a-mysql')));
  const db = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', multipleStatements: true, timezone: 'Z' });
  const schema = 't05b2_disposable_tests'; let owns = false;
  const fixture = JSON.parse(await readFile('../database/sources/001_real_branches.json', 'utf8')).branches;
  const boundary = JSON.parse(await readFile('../database/sources/osm/lebanon-boundary.geojson', 'utf8'));
  const make = (id: number, name: string, latitude = 34.08, longitude = 35.65) => normalizeDocument({ elements: [{ type: 'node', id, lat: latitude, lon: longitude,
    tags: { shop: 'supermarket', name, 'addr:street': 'Test road', 'addr:city': 'Test locality' } }] }, boundary,
    { url: 'https://example.com/disposable-osm-fixture', retrievedAt: '2026-11-22T00:00:00Z', license: 'ODbL-1.0', rawSha256: 'a'.repeat(64), dataDate: null });
  const approve = async (data: ReturnType<typeof make>, decisions?: Approval['decisions']) => {
    const plan = preview(data, await readSnapshot(db), fixture);
    const approval: Approval = { datasetHash: digest(data), previewHash: digest(plan), database: schema,
      decisions: decisions ?? data.records.map(r => ({ key: r.key, action: 'insert' as const, note: 'Disposable fixture reviewed for this test only' })) };
    return { plan, approval };
  };
  const snapshot = async () => {
    const result = [];
    for (const table of ['products', 'product_aliases', 'supermarkets', 'branches', 'prices', 'branch_location_sources']) result.push((await db.query(`SELECT * FROM ${table} ORDER BY ${table === 'branch_location_sources' ? 'osm_type,osm_id' : 'id'}`))[0]);
    return result;
  };
  try {
    const [[server]] = await db.query<RowDataPacket[]>('SELECT @@datadir directory'); assert.equal(canonical(server.directory), canonical(directory));
    await db.query(`CREATE DATABASE ${schema}`); owns = true; await db.query(`USE ${schema}`);
    await db.query(await readFile('../database/migrations/001_catalog.sql', 'utf8'));
    await db.query(await readFile('../database/seeds/001_demo_catalog.sql', 'utf8'));
    await db.query(await readFile('../database/migrations/003_branch_location_sources.sql', 'utf8'));
    const original = await snapshot();
    const data = make(90000001, 'OSM independent fixture');
    const { plan, approval } = await approve(data);
    await t.test('explicit import inserts real-location identities without demo prices, then repeats without writes', async () => {
      const result = await importApproved(db, data, plan, approval, fixture, boundary); assert.equal(result.insertedBranches, 1); assert.equal(result.insertedSupermarkets, 1);
      const after = await snapshot();
      const repeated = await importApproved(db, data, plan, approval, fixture, boundary); assert.equal(repeated.alreadyPresent, 1); assert.equal(repeated.insertedBranches, 0);
      assert.deepEqual(await snapshot(), after);
      assert.deepEqual(after[0], original[0]); assert.deepEqual(after[1], original[1]); assert.deepEqual(after[4], original[4]);
    });
    await t.test('approval digest/database, rejected data and changed source records fail safely', async () => {
      const before = await snapshot();
      await assert.rejects(importApproved(db, data, plan, { ...approval, previewHash: 'wrong' }, fixture, boundary));
      await assert.rejects(importApproved(db, data, plan, { ...approval, database: 'wrong' }, fixture, boundary));
      const changed = structuredClone(data); changed.records[0].latitude += 0.01;
      const next = await approve(changed); await assert.rejects(importApproved(db, changed, next.plan, next.approval, fixture, boundary), /changed/);
      const rejected = make(90000002, ''); const bad = await approve(rejected); await assert.rejects(importApproved(db, rejected, bad.plan, bad.approval, fixture, boundary));
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('late duplicate branch-name failure rolls back newly inserted chains, branches and source ledger', async () => {
      const a = make(90000003, 'Carrefour', 34.13), b = make(90000004, 'Carrefour', 34.15);
      const batch = { ...a, records: [...a.records, ...b.records] }, ready = await approve(batch), before = await snapshot();
      await assert.rejects(importApproved(db, batch, ready.plan, ready.approval, fixture, boundary));
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('nearby distinct stores require review and can be explicitly confirmed without merging', async () => {
      const nearby = make(90000005, 'Different nearby business', 34.0801), ready = await approve(nearby);
      const before = await snapshot(); await assert.rejects(importApproved(db, nearby, ready.plan, ready.approval, fixture, boundary), /Possible existing duplicate/);
      assert.deepEqual(await snapshot(), before);
      ready.approval.decisions[0].distinctFromBranchIds = ready.plan.rows[0].existingBranchIds;
      assert.equal((await importApproved(db, nearby, ready.plan, ready.approval, fixture, boundary)).insertedBranches, 1);
      const state = await readSnapshot(db); assert.notEqual(state.sources.find(s => s.key === 'node/90000005')!.branchId, state.sources.find(s => s.key === 'node/90000001')!.branchId);
    });
    await t.test('prepared Spinneys conflicts prevent duplicates before fixture import; approved links preserve retailer coordinates after import', async () => {
      const source = make(90000006, 'Spinneys', 34.0009, 35.6477), beforeFixture = await approve(source);
      await assert.rejects(importApproved(db, source, beforeFixture.plan, beforeFixture.approval, fixture, boundary), /retailer-fixture duplicate/);
      await executeSqlScript(sql => db.query(sql), await readFile('../database/seeds/002_optional_real_locations.sql', 'utf8'));
      const before = await snapshot(), ready = await approve(source, [{ key: source.records[0].key, action: 'link', branchId: 1023, note: 'Disposable owner link to retailer branch reviewed' }]);
      assert.equal((await importApproved(db, source, ready.plan, ready.approval, fixture, boundary)).linkedSources, 1);
      const after = await snapshot(); assert.deepEqual(after.slice(0, 5), before.slice(0, 5));
      assert.equal((await readSnapshot(db)).sources.find(s => s.key === source.records[0].key)!.branchId, 1023);
    });
    await t.test('known case/alias variants reuse a real chain instead of inserting duplicate supermarket identities', async () => {
      await db.query("INSERT INTO supermarkets(name) VALUES ('CHARCUTERIE AOUN')");
      const data = make(90000009, 'Le Charcutier Aoun', 34.18, 35.66), ready = await approve(data);
      const result = await importApproved(db, data, ready.plan, ready.approval, fixture, boundary);
      assert.equal(result.insertedSupermarkets, 0); assert.equal(result.insertedBranches, 1);
      const state = await readSnapshot(db), branchId = state.sources.find(s => s.key === data.records[0].key)!.branchId;
      assert.equal(state.supermarkets.find(s => s.id === state.branches.find(b => b.id === branchId)!.supermarketId)!.name, 'CHARCUTERIE AOUN');
    });
    await t.test('linking to fictional records is forbidden; stale approvals cannot ignore a newly inserted neighbor', async () => {
      const source = make(90000007, 'Spinneys', 34.0009, 35.6477), ready = await approve(source, [{ key: source.records[0].key, action: 'link', branchId: 1, note: 'Invalid attempt to attach real source to demo' }]);
      await assert.rejects(importApproved(db, source, ready.plan, ready.approval, fixture, boundary), /Unsafe branch link/);
      const newStore = make(90000008, 'New remote fixture', 34.16), stale = await approve(newStore);
      await db.query("INSERT INTO supermarkets(name) VALUES ('Neighbor fixture')");
      await db.query("INSERT INTO branches(supermarket_id,name,address,latitude,longitude) VALUES (LAST_INSERT_ID(),'Neighbor','Test',34.1601,35.65)");
      const before = await snapshot(); await assert.rejects(importApproved(db, newStore, stale.plan, stale.approval, fixture, boundary), /Catalog changed/); assert.deepEqual(await snapshot(), before);
    });
    await t.test('real HOT snapshot approved technical-quality subset imports and repeats without affecting any prices', async () => {
      const real = JSON.parse(await readFile('../database/sources/osm/2026-11-22-supermarkets.normalized.json', 'utf8'));
      const plan = preview(real, await readSnapshot(db), fixture);
      const decisions: Approval['decisions'] = plan.rows.filter(r => r.status === 'auto_validated' && r.action === 'insert').map(r => ({ key: r.key, action: 'insert' }));
      assert.ok(decisions.length >= 20);
      const approval: Approval = { datasetHash: digest(real), previewHash: digest(plan), database: schema, decisions };
      const result = await importApproved(db, real, plan, approval, fixture, boundary);
      assert.equal(result.insertedBranches, decisions.length);
      const after = await snapshot();
      assert.equal((await importApproved(db, real, plan, approval, fixture, boundary)).alreadyPresent, decisions.length);
      assert.deepEqual(await snapshot(), after); assert.deepEqual(after[4], original[4]);
    });
    await t.test('actual catalog contract and authenticated route discovery see imported locations without prices', async () => {
      const auth: AuthRepository = { register: async () => { throw new Error(); }, findAccount: async () => null, createSession: async () => '', logout: async () => {}, authenticate: async () => ({ id: 1, displayName: 'Fixture', email: 'fixture@example.com' }) };
      const catalog = createCatalogRepository(createSqlReader(db));
      const routing = { route: async (points: { latitude: number; longitude: number }[], geometry: boolean) => ({ distanceMeters: geometry ? 18000 : 19000, durationSeconds: geometry ? 1200 : 1440, geometry: geometry ? points.map(p => [p.longitude, p.latitude] as [number, number]) : null }) };
      const app = createApp(async () => {}, [], catalog, auth, undefined, undefined, undefined, routing);
      const journey = { origin: { latitude: 34, longitude: 35.65 }, destination: { latitude: 34.17, longitude: 35.65 } };
      await request(app).post('/api/journeys/supermarkets').send(journey).expect(401);
      const response = await request(app).post('/api/journeys/supermarkets').set('Authorization', 'Bearer ' + 'a'.repeat(64)).send(journey).expect(200);
      assert.ok(response.body.options.some((o: { supermarket: string }) => o.supermarket === 'OSM independent fixture'));
      assert.ok(response.body.options.every((o: object) => !('totalUsd' in o)));
      const [prices] = await db.query('SELECT * FROM prices ORDER BY id'); assert.deepEqual(prices, original[4]);
    });
  } finally { if (owns) await db.query(`DROP DATABASE ${schema}`); await db.end(); }
});
