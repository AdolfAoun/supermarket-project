import { executeSqlScript } from '../../backend/tests/fixtures/sql-script';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { normalize, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../backend/src/app';
import { configurePoolSessions } from '../../backend/src/config/database';
import { createAuthRepository } from '../../backend/src/modules/auth/repository';
import { createCatalogRepository, createSqlReader } from '../../backend/src/modules/catalog/repository';
import { createShoppingListRepository } from '../../backend/src/modules/shopping-lists/repository';
import { createBasketRepository } from '../../backend/src/modules/basket/repository';
import { createApiClient, createCatalogApi, ApiError } from '../services/api';
import { createAuthApi, createListApi } from '../services/account-api';
import { createSession, type TokenStorage } from '../services/session';
import { basketPresentation } from '../services/basket-presentation';
import type { RoutingAdapter } from '../../backend/src/modules/journeys/routing';

const backendRequire = createRequire(resolve('../backend/package.json'));
const mysql = backendRequire('mysql2/promise') as typeof import('../../backend/node_modules/mysql2/promise');
const callbackMysql = backendRequire('mysql2') as typeof import('../../backend/node_modules/mysql2');

// Explicit command only: real fetch → Express → disposable MySQL. Application
// credentials and owner records are never used for these write workflows.
test('T03-C mobile clients → Express → disposable MySQL', { skip: !process.env.T03_TEST_PORT }, async t => {
  const port = Number(process.env.T03_TEST_PORT), directory = process.env.T03_TEST_DATADIR;
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== 3306); assert.ok(directory);
  const canonical = (v: string) => normalize(v).replace(/[\\/]+$/, '').toLowerCase();
  assert.equal(canonical(directory), canonical(resolve(process.env.TEMP!, 'supermarket-t03a-mysql')));
  const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', timezone: 'Z', multipleStatements: true });
  const [[serverRow]] = await admin.query<import('../../backend/node_modules/mysql2/promise').RowDataPacket[]>('SELECT @@datadir AS directory');
  assert.equal(canonical(serverRow.directory), canonical(directory));
  const schema = 't03c_disposable_tests'; let ownsSchema = false;
  let pool: ReturnType<typeof mysql.createPool> | undefined;
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  try {
    await admin.query(`CREATE DATABASE ${schema}`); ownsSchema = true; await admin.query(`USE ${schema}`);
    for (const file of ['migrations/001_catalog.sql', 'migrations/002_users_and_shopping_lists.sql', 'seeds/001_demo_catalog.sql']) {
      await admin.query(await readFile(resolve('..', 'database', file), 'utf8'));
    }
    const snapshot = async () => {
      const result: unknown[] = [];
      for (const table of ['products', 'product_aliases', 'supermarkets', 'branches', 'prices']) {
        const [rows] = await admin.query(`SELECT * FROM ${table} ORDER BY id`); result.push(rows);
      }
      return result;
    };
    const before = await snapshot();
    const callbackPool = callbackMysql.createPool({ host: '127.0.0.1', port, user: 'root', password: '', database: schema, timezone: 'Z' });
    configurePoolSessions(callbackPool); pool = callbackPool.promise();
    // Explicit deterministic routing fixture; live OSRM checks are recorded separately.
    const routing: RoutingAdapter = { route: async (points, geometry) => geometry
      ? { distanceMeters: 20000, durationSeconds: 1500, geometry: points.map(p => [p.longitude, p.latitude]) }
      : { distanceMeters: 22000, durationSeconds: 1500 + (points.some(p => Math.abs(p.latitude - 33.935035) < 0.000001) ? 520 : 240), geometry: null } };
    const application = createApp(async () => { await pool!.query('SELECT 1'); }, [], createCatalogRepository(createSqlReader(pool)),
      createAuthRepository(pool), createShoppingListRepository(pool), createBasketRepository(pool), undefined, routing);
    const realLocationFixture = async (enabled: boolean) => {
      if (enabled) await executeSqlScript(sql => admin.query(sql), await readFile(resolve('..', 'database/seeds/002_optional_real_locations.sql'), 'utf8'));
      else { await admin.query('DELETE FROM branches WHERE supermarket_id = 1001'); await admin.query('DELETE FROM supermarkets WHERE id = 1001'); }
    };
    server = application.listen(0, '127.0.0.1'); await once(server, 'listening');
    const baseUrl = () => `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
    const client = createApiClient({ baseUrl }), auth = createAuthApi(client), catalog = createCatalogApi(client);
    let stored: string | null = null;
    const storage: TokenStorage = { get: async () => stored, set: async token => { stored = token; }, remove: async () => { stored = null; } };
    let session = createSession(storage, auth), lists = createListApi(session.run, client), listId = 0, itemId = 0;
    await t.test('guest catalog and registration/login use real transport and validation', async () => {
      assert.equal((await catalog.products('')).length, 36);
      await auth.register({ displayName: 'Mobile Demo', email: 'mobile@example.com', password: 'password123' });
      await assert.rejects(auth.login({ email: 'mobile@example.com', password: 'wrong password' }), error => error instanceof ApiError && error.status === 401);
      await session.restore(); await session.login({ email: 'mobile@example.com', password: 'password123' });
      assert.equal(session.getState().status, 'authenticated'); assert.ok(stored);
    });
    await t.test('new session controller restores token using current-user API', async () => {
      session = createSession(storage, auth); await session.restore(); lists = createListApi(session.run, client);
      assert.equal(session.getState().user!.email, 'mobile@example.com');
    });
    await t.test('create/rename, duplicate increments, replacement and retrieval follow actual backend contracts', async () => {
      const list = await lists.create('Mobile list'); listId = list.id;
      assert.equal((await lists.rename(listId, 'Accepted mobile list')).name, 'Accepted mobile list');
      const first = await lists.add(listId, 1, 2); itemId = first.id;
      assert.equal((await lists.add(listId, 1, 3)).quantity, 5);
      assert.equal((await lists.setQuantity(listId, itemId, 2)).quantity, 2);
      await lists.add(listId, 13, 1);
      assert.equal((await lists.detail(listId)).items.length, 2);
    });
    await t.test('comparison preserves exact backend ranking and names missing product coverage', async () => {
      const comparison = await lists.compare(listId), view = basketPresentation(comparison);
      assert.deepEqual(comparison.eligibleBranches.map(b => [b.branchId, b.totalUsd, b.rank]), [[3, '3.90', 1], [1, '4.20', 2], [2, '4.50', 3]]);
      assert.equal(view.incomplete[0].branchId, 4); assert.match(view.incomplete[0].explanation, /Master Potato Chips/);
      assert.equal(view.branches.filter(b => b.cheapest).length, 1);
    });
    await t.test('foreign owner is rejected without discarding their valid session', async () => {
      await auth.register({ displayName: 'Other', email: 'other@example.com', password: 'password123' });
      const other = createSession({ get: async () => null, set: async () => {}, remove: async () => {} }, auth);
      await other.restore(); await other.login({ email: 'other@example.com', password: 'password123' });
      await assert.rejects(createListApi(other.run, client).detail(listId), error => error instanceof ApiError && error.status === 404);
      assert.equal(other.getState().status, 'authenticated'); await other.logout();
    });
    await t.test('T04 mobile optimizer uses actual API/SQL contract and refreshes after saved quantity changes', async () => {
      const first = await lists.optimize(listId);
      assert.equal(first.multiStore.status, 'complete');
      assert.equal(first.comparison.eligibleBranches[0].totalUsd, '3.90');
      assert.equal(first.multiStore.solution!.totalUsd, '3.90');
      assert.equal(first.multiStore.savings!.amountUsd, '0.00');
      for (const max of [1, 2, 3]) assert.equal((await lists.optimize(listId, max)).maximumStores, max);
      await lists.setQuantity(listId, itemId, 3);
      const changed = await lists.optimize(listId);
      assert.equal(changed.comparison.shoppingList.items.find(i => i.id === itemId)!.quantity, 3);
      assert.equal(changed.multiStore.solution!.totalUsd, '5.50');
      await lists.setQuantity(listId, itemId, 2);
    });
    await t.test('T05-A imports through real session auth without changing catalog/list data or T04 totals', async () => {
      const beforeList = await lists.detail(listId);
      const imported = await lists.importGoogleMaps('https://www.google.com/maps/dir/?api=1&origin=34,35&destination=34.1,35.2&travelmode=driving');
      assert.equal(imported.status, 'complete'); assert.equal('requiresConfirmation' in imported, false);
      assert.equal(imported.origin!.latitude, 34); assert.equal(imported.destination!.longitude, 35.2);
      assert.deepEqual(await lists.detail(listId), beforeList);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await lists.optimize(listId)).multiStore.solution!.totalUsd, '3.90');
    });
    await t.test('T05-B optional real-location seed preserves demo data; real SQL discovery needs no prices and never borrows demo totals', async () => {
      await realLocationFixture(true);
      try {
        const [[count]] = await admin.query<import('../../backend/node_modules/mysql2/promise').RowDataPacket[]>('SELECT COUNT(*) AS count FROM prices WHERE branch_id >= 1000');
        assert.equal(count.count, 0);
        const response = await lists.discoverSupermarkets({ origin: { latitude: 33.9808, longitude: 35.6389 },
          destination: { latitude: 33.8938, longitude: 35.5018 }, waypoints: [], maxDetourMinutes: 30 });
        assert.ok(response.options.some(o => o.branchId === 1032));
        const prices = await lists.optimize(listId); assert.equal(prices.multiStore.solution!.totalUsd, '3.90');
        assert.ok(prices.comparison.incompleteBranches.some(b => b.branchId === 1032));
        assert.ok(!prices.comparison.eligibleBranches.some(b => b.branchId >= 1000));
      } finally { await realLocationFixture(false); }
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('remove/delete/logout clear private access and catalog records remain byte-for-byte unchanged', async () => {
      await lists.removeItem(listId, itemId); assert.equal((await lists.detail(listId)).items.length, 1);
      await lists.remove(listId); await session.logout();
      assert.equal(stored, null); assert.equal(session.getState().status, 'guest');
      await assert.rejects(lists.lists(), error => error instanceof ApiError && error.status === 401);
      assert.equal((await catalog.products('')).length, 36);
      assert.deepEqual(await snapshot(), before);
    });
    if (process.env.RUN_T03_BROWSER_TESTS === '1') await t.test('rendered mobile web registration, list editor, basket breakdown and logout with real SQL', async () => {
      const { runPrivateBrowser } = await import('./private-browser');
      await realLocationFixture(true);
      try {
        await runPrivateBrowser(baseUrl(), async enabled => {
          if (enabled) await admin.query(`INSERT INTO prices (id,product_id,branch_id,price,currency,observed_at,status,source_type,source_note)
            VALUES (99001,1,4,0.10,'USD','2026-11-01','verified','seed','DEMONSTRATION DATA T04 disposable browser split fixture')`);
          else await admin.query('DELETE FROM prices WHERE id = 99001');
        });
      } finally { await realLocationFixture(false); }
      assert.deepEqual(await snapshot(), before);
    });
  } finally {
    if (server) await new Promise<void>(resolve => { server!.close(() => resolve()); server!.closeAllConnections(); });
    if (pool) await pool.end();
    if (ownsSchema) await admin.query(`DROP DATABASE ${schema}`);
    await admin.end();
  }
});
