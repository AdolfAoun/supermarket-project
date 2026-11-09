import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, normalize } from 'node:path';
import { test } from 'node:test';
import callbackMysql from 'mysql2';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { configurePoolSessions } from '../src/config/database.js';
import { createAuthRepository } from '../src/modules/auth/repository.js';
import { tokenHash } from '../src/modules/auth/routes.js';
import { createShoppingListRepository } from '../src/modules/shopping-lists/repository.js';
import { createBasketRepository } from '../src/modules/basket/repository.js';
import { compareBasket } from '../src/modules/basket/compare.js';
import { createCatalogRepository, createSqlReader } from '../src/modules/catalog/repository.js';

// Same opt-in dedicated server as T03-A, but a separate disposable schema.
// Never uses the application credentials or schema for writes.
test('T03-B disposable MySQL integration', { skip: !process.env.T03_TEST_PORT }, async t => {
  const port = Number(process.env.T03_TEST_PORT);
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== 3306);
  const directory = process.env.T03_TEST_DATADIR;
  assert.ok(directory);
  const canonical = (path: string) => normalize(path).replace(/[\\/]+$/, '').toLowerCase();
  assert.equal(canonical(directory), canonical(resolve(process.env.TEMP!, 'supermarket-t03a-mysql')));
  const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', timezone: 'Z', multipleStatements: true });
  const schema = 't03b_disposable_tests';
  let ownsSchema = false;
  let database: Pool | undefined;
  try {
    const [[server]] = await admin.query<RowDataPacket[]>('SELECT @@datadir AS directory, VERSION() AS version');
    assert.equal(canonical(server.directory), canonical(directory)); assert.match(server.version, /^8\./);
    await admin.query(`CREATE DATABASE ${schema}`); ownsSchema = true;
    await admin.query(`USE ${schema}`);
    for (const file of ['migrations/001_catalog.sql', 'migrations/002_users_and_shopping_lists.sql', 'seeds/001_demo_catalog.sql']) {
      await admin.query(await readFile(resolve('..', 'database', file), 'utf8'));
    }
    const callbackPool = callbackMysql.createPool({ host: '127.0.0.1', port, user: 'root', password: '', database: schema,
      timezone: 'Z', connectionLimit: 5 });
    configurePoolSessions(callbackPool); database = callbackPool.promise();
    const lists = createShoppingListRepository(database);
    const basket = createBasketRepository(database);
    const auth = createAuthRepository(database);
    const catalog = createCatalogRepository(createSqlReader(database));
    const application = createApp(async () => { await database!.query('SELECT 1'); }, [], catalog, auth, lists, basket);
    await admin.execute("INSERT INTO users (id,display_name,email,password_hash) VALUES (1,'Demo A','a@example.com','fixture'),(2,'Demo B','b@example.com','fixture')");
    const token = 'b'.repeat(64), otherToken = 'c'.repeat(64);
    await auth.createSession(1, tokenHash(token)); await auth.createSession(2, tokenHash(otherToken));
    const list = await lists.create(1, 'Basket SQL');
    const first = await lists.addItem(1, list.id, 1, 2);
    await lists.addItem(1, list.id, 2, 3);
    const snapshotTables = async () => {
      const result: Record<string, unknown> = {};
      for (const table of ['products', 'product_aliases', 'supermarkets', 'branches', 'prices', 'shopping_lists', 'shopping_list_items']) {
        const [rows] = await admin.query<RowDataPacket[]>(`SELECT * FROM ${table} ORDER BY id`); result[table] = rows;
      }
      return result;
    };
    const original = await snapshotTables();
    await t.test('seeded basket compares all physical branches with exact quantity totals and no record changes', async () => {
      const result = compareBasket(await basket.snapshot(1, list.id));
      assert.equal(result.eligibleBranches.length, 4);
      const branch1 = result.eligibleBranches.find(b => b.branchId === 1)!;
      assert.equal(branch1.totalUsd, '5.35'); // 1.70*2 + .65*3, not package size*price
      assert.equal(branch1.items[0].originalPrice, '1.70');
      assert.equal(branch1.items[0].observedAt, '2026-01-15T12:00:00.000000Z');
      assert.deepEqual(await snapshotTables(), original);
    });
    await t.test('incomplete cheap branch is excluded with missing product IDs and no subtotal', async () => {
      await lists.addItem(1, list.id, 13, 1); // seed branch four has only products 1–12
      const before = await snapshotTables();
      const result = compareBasket(await basket.snapshot(1, list.id));
      assert.equal(result.eligibleBranches.length, 3);
      assert.deepEqual(result.incompleteBranches.map(b => [b.branchId, b.missingProductIds]), [[4, [13]]]);
      assert.equal('totalUsd' in result.incompleteBranches[0], false);
      assert.deepEqual(await snapshotTables(), before);
      const added = (await lists.get(1, list.id)).items.find(i => i.productId === 13)!;
      await lists.removeItem(1, list.id, added.id);
    });
    await t.test('latest eligible mixed-currency price uses timestamp then ID; statuses and sources are excluded', async () => {
      await admin.query(`INSERT INTO prices (id,product_id,branch_id,price,currency,observed_at,status,source_type,source_note) VALUES
        (7001,1,1,0.01,'USD','2027-01-01','verified','seed','DEMONSTRATION DATA history'),
        (7002,1,1,90000,'LBP','2028-01-01','verified','seed','DEMONSTRATION DATA mixed'),
        (7003,1,1,180000,'LBP','2028-01-01','verified','seed','DEMONSTRATION DATA timestamp tie'),
        (7004,1,1,0.01,'USD','2029-01-01','pending','seed','DEMONSTRATION DATA pending'),
        (7005,1,1,0.01,'USD','2029-01-02','flagged','seed','DEMONSTRATION DATA flagged'),
        (7006,1,1,0.01,'USD','2029-01-03','rejected','seed','DEMONSTRATION DATA rejected'),
        (7007,1,1,0.01,'USD','2030-01-01','verified','manual',NULL),
        (7008,1,1,0.01,'USD','2030-01-02','verified','online',NULL),
        (7009,3,2,0.01,'USD','2030-01-03','verified','seed','DEMONSTRATION DATA unrelated product'),
        (7010,2,1,1.00,'USD','2028-01-01','verified','seed','DEMONSTRATION DATA package two')`);
      const before = await snapshotTables();
      const data = await basket.snapshot(1, list.id);
      assert.equal(data.prices.length, 8); // two products, four branches
      const selected = data.prices.find(p => p.branchId === 1 && p.productId === 1)!;
      assert.equal(selected.originalPrice, '180000.00'); assert.equal(selected.originalCurrency, 'LBP');
      const result = compareBasket(data);
      assert.equal(result.eligibleBranches.find(b => b.branchId === 1)!.totalUsd, '7.00');
      assert.equal(result.eligibleBranches.find(b => b.branchId === 1)!.items[1].originalCurrency, 'USD');
      assert.deepEqual(await snapshotTables(), before);
      // T02 remains USD-only and picks its latest eligible USD seed, not LBP or manual.
      assert.equal((await catalog.listPrices(1)).find(p => p.branchId === 1)!.price, '0.01');
    });
    await t.test('product with only ineligible observations prevents all branches from qualifying', async () => {
      await admin.query("INSERT INTO products (id,name,brand,size,unit,category) VALUES (99,'No eligible price','Demo',1,'piece','Test')");
      await admin.query("INSERT INTO prices (product_id,branch_id,price,currency,observed_at,status,source_type,source_note) VALUES (99,1,1,'USD','2026-01-01','pending','seed','DEMONSTRATION DATA pending only')");
      const added = await lists.addItem(1, list.id, 99, 1);
      const result = compareBasket(await basket.snapshot(1, list.id));
      assert.deepEqual(result.eligibleBranches, []); assert.deepEqual(result.cheapestBranchIds, []);
      assert.ok(result.incompleteBranches.every(b => b.missingProductIds.includes(99)));
      await lists.removeItem(1, list.id, added.id);
    });
    await t.test('inactive required product blocks ranking, retains quantity and does not change the saved list', async () => {
      await admin.execute('UPDATE products SET is_active = 0 WHERE id = 2');
      try {
        const before = await snapshotTables();
        const response = await request(application).get(`/api/shopping-lists/${list.id}/compare`).set('Authorization', `Bearer ${token}`).expect(200);
        assert.equal(response.body.outcome, 'inactive_products');
        assert.deepEqual(response.body.inactiveProductIds, [2]); assert.deepEqual(response.body.eligibleBranches, []);
        assert.equal(response.body.shoppingList.items[1].quantity, 3);
        assert.deepEqual(await snapshotTables(), before);
      } finally { await admin.execute('UPDATE products SET is_active = 1 WHERE id = 2'); }
    });
    await t.test('HTTP ownership, nonexistent/empty lists and session expiry/revocation use existing errors', async () => {
      await request(application).get(`/api/shopping-lists/${list.id}/compare`).expect(401);
      const foreign = await request(application).get(`/api/shopping-lists/${list.id}/compare`).set('Authorization', `Bearer ${otherToken}`).expect(404);
      const missing = await request(application).get('/api/shopping-lists/4294967295/compare').set('Authorization', `Bearer ${token}`).expect(404);
      assert.deepEqual(foreign.body, missing.body);
      const empty = await lists.create(1, 'Empty');
      await request(application).get(`/api/shopping-lists/${empty.id}/compare`).set('Authorization', `Bearer ${token}`).expect(400);
      const response = await request(application).get(`/api/shopping-lists/${list.id}/compare`).set('Authorization', `Bearer ${token}`).expect(200);
      assert.equal(response.body.shoppingList.id, list.id); assert.equal(response.headers['cache-control'], 'no-store');
      await auth.logout(tokenHash(otherToken));
      await request(application).get(`/api/shopping-lists/${list.id}/compare`).set('Authorization', `Bearer ${otherToken}`).expect(401);
    });
    await t.test('comparison holds a coherent snapshot while a real list update waits and new prices commit', async () => {
      let announceRead!: () => void, resume!: () => void;
      const readReached = new Promise<void>(resolve => { announceRead = resolve; });
      const gate = new Promise<void>(resolve => { resume = resolve; });
      // Pause the real SQL connection after its first nonlocking item read. No
      // test hooks are added to production. All other methods bind to the driver.
      const instrumented = { getConnection: async () => {
        const connection = await database!.getConnection();
        return new Proxy(connection, { get(target, key) {
          if (key === 'execute') return async (sql: string, values?: (string | number)[]) => {
            const result = await target.execute(sql, values);
            if (sql.includes('FROM shopping_list_items i JOIN products')) {
              announceRead(); await gate;
            }
            return result;
          };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
      } } as Pool;
      const pending = createBasketRepository(instrumented).snapshot(1, list.id);
      await Promise.race([readReached, pending.then(() => { throw new Error('Snapshot completed before interception'); })]);
      let updateFinished = false;
      const update = lists.setQuantity(1, list.id, first.id, 8).then(value => { updateFinished = true; return value; });
      try {
        await admin.query("INSERT INTO prices (product_id,branch_id,price,currency,observed_at,status,source_type,source_note) VALUES (1,1,9,'USD','2035-01-01','verified','seed','DEMONSTRATION DATA concurrent insert')");
        // Observe MySQL's actual lock wait rather than depending on an arbitrary sleep.
        let waiting = false;
        for (let attempt = 0; attempt < 50; attempt++) {
          const [[row]] = await admin.execute<RowDataPacket[]>(`SELECT COUNT(*) n FROM performance_schema.data_lock_waits w
            JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
            WHERE l.OBJECT_SCHEMA = ? AND l.OBJECT_NAME = 'shopping_lists'`, [schema]);
          if (row.n >= 1) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        assert.ok(waiting); assert.equal(updateFinished, false);
      } finally { resume(); }
      const data = await pending;
      await update;
      assert.equal(data.shoppingList.items[0].quantity, 2);
      assert.equal(data.prices.find(p => p.branchId === 1 && p.productId === 1)!.originalPrice, '180000.00');
      const after = await basket.snapshot(1, list.id);
      assert.equal(after.shoppingList.items[0].quantity, 8);
      assert.equal(after.prices.find(p => p.branchId === 1 && p.productId === 1)!.originalPrice, '9.00');
    });
    await t.test('failed snapshot rolls back and releases its list lock', async () => {
      // A missing list rolls back; a following normal mutation remains possible.
      await assert.rejects(basket.snapshot(2, list.id), (error: unknown) => error instanceof Error && 'status' in error && error.status === 404);
      await lists.rename(1, list.id, 'Still usable');
      assert.equal((await lists.get(1, list.id)).name, 'Still usable');
    });
  } finally {
    if (database) await database.end();
    if (ownsSchema) await admin.query(`DROP DATABASE ${schema}`);
    await admin.end();
  }
});
