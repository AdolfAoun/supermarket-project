import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import type { RowDataPacket } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { createCatalogRepository, createSqlReader } from '../src/modules/catalog/repository.js';

// Opt-in tests perform SELECT only. CTEs shadow table names with adversarial
// fixtures, exercising real MySQL query semantics without changing imported data.
const fixtures = `WITH
  products AS (
    SELECT 1 id, 'Coca-Cola' name, 'Coca-Cola' brand, 'Original' variant,
      CAST(1.5 AS DECIMAL(10,3)) size, 'L' unit, 1 pack_quantity,
      'Beverages' category, NULL image_url, 1 is_active
    UNION ALL SELECT 2, 'Coca-Cola', 'Coca-Cola', 'Original', 330, 'ml', 1, 'Beverages', NULL, 1
    UNION ALL SELECT 3, 'Inactive', 'Test', '', 1, 'piece', 1, 'Test', NULL, 0
    UNION ALL SELECT 4, 'No eligible prices', 'Test', '', 1, 'piece', 1, 'Test', NULL, 1
  ),
  product_aliases AS (
    SELECT 1 product_id, 'coke1.5l' normalized_alias
    UNION ALL SELECT 1, 'cocacola1.5l'
    UNION ALL SELECT 2, 'coke330ml'
    UNION ALL SELECT 3, 'hidden'
  ),
  supermarkets AS (
    SELECT 1 id, 'Demo A' name UNION ALL SELECT 2, 'Empty chain'
  ),
  branches AS (
    SELECT 1 id, 1 supermarket_id, 'Branch A' name, 'Fictional' address,
      CAST(NULL AS DECIMAL(9,6)) latitude, CAST(NULL AS DECIMAL(9,6)) longitude
    UNION ALL SELECT 2, 1, 'Branch B', 'Fictional', 33.8, 35.5
    UNION ALL SELECT 3, 1, 'Branch C', 'Fictional', NULL, NULL
  ),
  prices AS (
    SELECT 1 id, 1 product_id, 1 branch_id, CAST(0.20 AS DECIMAL(12,2)) price,
      'USD' currency, CAST('2026-01-01 12:00:00' AS DATETIME(6)) observed_at,
      'verified' status, 'seed' source_type
    UNION ALL SELECT 2, 1, 1, 1.70, 'USD', '2026-01-15 12:00:00', 'verified', 'seed'
    UNION ALL SELECT 3, 1, 1, 0.10, 'USD', '2026-01-16 12:00:00', 'pending', 'seed'
    UNION ALL SELECT 4, 1, 1, 0.05, 'USD', '2026-01-17 12:00:00', 'flagged', 'seed'
    UNION ALL SELECT 5, 1, 1, 0.01, 'USD', '2026-01-18 12:00:00', 'rejected', 'seed'
    UNION ALL SELECT 6, 1, 1, 999, 'LBP', '2026-01-19 12:00:00', 'verified', 'seed'
    UNION ALL SELECT 7, 1, 1, 0.30, 'USD', '2026-01-20 12:00:00', 'verified', 'manual'
    UNION ALL SELECT 8, 1, 1, 0.40, 'USD', '2026-01-21 12:00:00', 'verified', 'online'
    UNION ALL SELECT 9, 1, 2, 1.50, 'USD', '2026-01-15 12:00:00', 'verified', 'seed'
    UNION ALL SELECT 10, 1, 2, 1.60, 'USD', '2026-01-15 12:00:00', 'verified', 'seed'
    UNION ALL SELECT 11, 1, 3, 1.60, 'USD', '2026-01-15 12:00:00', 'verified', 'seed'
    UNION ALL SELECT 12, 2, 1, 0.50, 'USD', '2026-01-15 12:00:00', 'verified', 'seed'
    UNION ALL SELECT 13, 4, 1, 1.00, 'USD', '2026-01-15 12:00:00', 'pending', 'seed'
  )`;

test('read-only MySQL catalog integration', { skip: process.env.RUN_CATALOG_DB_TESTS !== '1' }, async t => {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(env.db.host), 'Requires a loopback database');
  try {
    await t.test('pool sessions are strict and UTC on parallel, reused and replacement connections', async () => {
      const [[globalBefore]] = await pool.query<RowDataPacket[]>('SELECT @@GLOBAL.sql_mode AS mode, @@GLOBAL.time_zone AS zone');
      async function inspect(connection: Awaited<ReturnType<typeof pool.getConnection>>) {
        const [[row]] = await connection.query<RowDataPacket[]>(`SELECT CONNECTION_ID() AS id,
          @@SESSION.sql_mode AS mode, @@SESSION.time_zone AS zone,
          TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS offsetSeconds,
          CAST('2026-01-15 12:00:00.123456' AS DATETIME(6)) AS observed`);
        const modes = String(row.mode).split(',');
        for (const required of ['STRICT_TRANS_TABLES', 'NO_ZERO_DATE', 'NO_ZERO_IN_DATE']) assert.ok(modes.includes(required));
        assert.equal(row.zone, '+00:00'); assert.equal(row.offsetSeconds, 0);
        assert.equal((row.observed as Date).toISOString(), '2026-01-15T12:00:00.123Z');
        return row.id as number;
      }
      const [first, second] = await Promise.all([pool.getConnection(), pool.getConnection()]);
      let firstId: number;
      try {
        firstId = await inspect(first);
        assert.notEqual(await inspect(second), firstId);
        // Drift only this borrowed test session, never global state or records.
        await first.query("SET SESSION sql_mode = 'NO_BACKSLASH_ESCAPES', time_zone = '+03:00'");
      } finally { second.destroy(); first.release(); }
      const reused = await pool.getConnection();
      try {
        assert.equal(await inspect(reused), firstId!);
        const [[row]] = await reused.query<RowDataPacket[]>('SELECT @@SESSION.sql_mode AS mode');
        assert.ok(String(row.mode).split(',').includes('NO_BACKSLASH_ESCAPES'), 'Preserve unrelated existing modes');
      } finally { reused.destroy(); }
      const replacement = await pool.getConnection();
      try { assert.notEqual(await inspect(replacement), firstId!); }
      finally { replacement.release(); }
      const [[globalAfter]] = await pool.query<RowDataPacket[]>('SELECT @@GLOBAL.sql_mode AS mode, @@GLOBAL.time_zone AS zone');
      assert.deepEqual(globalAfter, globalBefore);
    });
    const repository = createCatalogRepository(async (sql, values) => {
      const [rows] = await pool.execute<RowDataPacket[]>({ sql: `${fixtures} ${sql}`, values, timeout: 5000 });
      return rows;
    });
    await t.test('normalized name/alias/category searches deduplicate active products', async () => {
      assert.deepEqual((await repository.listProducts('COCA - COLA', 50)).map(p => p.id), [1, 2]);
      assert.deepEqual((await repository.listProducts('COKE 1.5-L', 50)).map(p => p.id), [1]);
      assert.deepEqual((await repository.listProducts(' \tCOKE\n1.5\u00a0L ', 50)).map(p => p.id), [1]);
      assert.equal((await repository.listProducts('\t\n\u00a0', 50)).length, 3);
      assert.deepEqual((await repository.listProducts('coke', 50)).map(p => p.id), [1, 2]);
      // LOCATE keeps accents literal even though catalog identity comparisons
      // use an accent-insensitive collation. Do not promise fuzzy equivalence.
      assert.deepEqual(await repository.listProducts('cóca', 50), []);
      assert.deepEqual((await repository.listProducts('330', 50)).map(p => p.id), [2]);
      for (const unmatched of ['牛奶', '\u200b', '🥛', 'Coke!']) assert.deepEqual(await repository.listProducts(unmatched, 50), []);
      assert.deepEqual((await repository.listProducts('beverages', 50)).map(p => p.id), [1, 2]);
      assert.deepEqual(await repository.listProducts('hidden', 50), []);
      assert.deepEqual(await repository.listProducts('not found', 50), []);
      for (const literal of ['%', '_', '\\', "' OR 1=1 --"]) {
        assert.deepEqual(await repository.listProducts(literal, 50), []);
      }
      assert.equal((await repository.listProducts('', 1)).length, 1);
      assert.equal((await repository.listProducts('', 50)).length, 3);
    });
    await t.test('details preserve sizes, hide inactive products and whitelist fields', async () => {
      const one = await repository.findProduct(1);
      const two = await repository.findProduct(2);
      assert.equal(one?.size, 1.5); assert.equal(two?.size, 330);
      assert.equal(one?.packQuantity, 1);
      assert.equal(await repository.findProduct(3), null);
      assert.equal(await repository.findProduct(4294967295), null);
      assert.equal(Object.hasOwn(one!, 'is_active'), false);
    });
    await t.test('latest eligible per branch, timestamp ties, numeric price order and product isolation', async () => {
      const prices = await repository.listPrices(1);
      assert.deepEqual(prices.map(p => [p.branchId, p.price]), [[2, '1.60'], [3, '1.60'], [1, '1.70']]);
      assert.equal(prices[0].observedAt, '2026-01-15T12:00:00.000000Z');
      assert.ok(prices.every(p => p.status === 'verified' && p.currency === 'USD'
        && p.demonstrationData && p.availability === 'check_with_store'));
      assert.deepEqual(await repository.listPrices(4), []);
      assert.deepEqual((await repository.listPrices(2)).map(p => p.price), ['0.50']);
    });
    await t.test('chains include nested branches, nullable locations and chains without branches', async () => {
      const chains = await repository.listSupermarkets();
      assert.equal(chains.length, 2);
      assert.equal(chains[0].branches.length, 3);
      assert.equal(chains[0].branches[0].latitude, null);
      assert.equal(chains[0].branches[1].latitude, 33.8);
      assert.deepEqual(chains[1].branches, []);
    });
    await t.test('HTTP comparison uses real SQL results and safe demo metadata', async () => {
      const application = createApp(async () => {}, [], repository);
      const response = await request(application).get('/api/products/1/prices').expect(200);
      assert.equal(response.body.demonstrationData, true);
      assert.equal(response.body.prices.length, 3);
      assert.equal(response.body.prices[0].price, '1.60');
      await request(application).get('/api/products/3').expect(404);
      const empty = await request(application).get('/api/products/4/prices').expect(200);
      assert.deepEqual(empty.body.prices, []);
    });
    await t.test('imported local catalog read-only smoke check', async () => {
      const live = createCatalogRepository();
      const products = await live.listProducts('', 100);
      assert.equal(products.length, 36);
      assert.deepEqual((await live.listProducts('Coke 1.5L', 50)).map(p => p.id), [1]);
      const prices = await live.listPrices(1);
      assert.deepEqual(prices.map(p => p.price), ['1.60', '1.70', '1.75', '1.80']);
      const chains = await live.listSupermarkets();
      assert.equal(chains.length, 3);
      assert.equal(chains.reduce((sum, chain) => sum + chain.branches.length, 0), 4);
      const [[count]] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM prices');
      assert.equal(count.n, 125);
    });
    await t.test('production SQL binding handles quotes and backslashes independently of SQL mode', async () => {
      const connection = await pool.getConnection();
      try {
        // Session-local setting on a disposable connection, never a global change.
        await connection.query("SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'NO_BACKSLASH_ESCAPES')");
        const read = createSqlReader(connection);
        const search = "O'Brien\\test";
        const [row] = await read('SELECT ? AS sample', [search]);
        assert.equal(row.sample, search);
        const repository = createCatalogRepository(read);
        assert.deepEqual(await repository.listProducts(search, 2), []);
        assert.deepEqual(await repository.listProducts("' OR 1=1 --", 2), []);
        assert.equal((await repository.listProducts('', 2)).length, 2);
      } finally { connection.destroy(); }
    });
  } finally {
    await pool.end();
  }
});
