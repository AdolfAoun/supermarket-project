// Run from repository root: node database/tests/catalog.test.cjs
// Reuses installed backend mysql2/dotenv; no additional dependencies.
// Creates uniquely named test tables in the configured LOCAL database. Existing
// catalog tables are never used. All fixture rows are rolled back before cleanup.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(resolve(__dirname, '../../backend/package.json'));
const mysql = backendRequire('mysql2/promise');
backendRequire('dotenv').config({ path: resolve(__dirname, '../../backend/.env'), quiet: true });

const tables = ['products', 'product_aliases', 'supermarkets', 'branches', 'prices'];
const prefix = `t02a_${Date.now()}_${process.pid}_`;
const rewrite = sql => sql
  .replace(/\b(products|product_aliases|supermarkets|branches|prices)\b/g, name => prefix + name)
  .replace(/CONSTRAINT (\w+)/g, (_, name) => `CONSTRAINT ${prefix}${name}`);

async function main() {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST), 'Tests require a loopback DB_HOST');
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, multipleStatements: true, connectTimeout: 5000,
  });
  let ownsNames = false;
  let passed = 0;
  const query = (sql, params) => c.query(rewrite(sql), params);
  async function check(name, fn) {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  }
  async function rejected(sql, errno) {
    await assert.rejects(query(sql), error => error.errno === errno);
  }
  try {
    const [[server]] = await c.query('SELECT VERSION() AS version, @@SESSION.sql_mode AS mode');
    assert.match(server.version, /^8\./, 'Requires MySQL 8');
    console.log(`MySQL ${server.version}; isolated test prefix ${prefix}`);
    const [existing] = await c.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?)',
      [tables.map(name => prefix + name)],
    );
    assert.equal(existing.length, 0, 'Test names must not already exist');
    ownsNames = true;
    await check('migration executes all five tables', async () => {
      await query(readFileSync(resolve(__dirname, '../migrations/001_catalog.sql'), 'utf8'));
      const [[session]] = await c.query('SELECT @@SESSION.sql_mode AS mode');
      assert.match(session.mode, /STRICT_(TRANS_TABLES|ALL_TABLES)/, 'Migration enables session strict mode');
      const [rows] = await c.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?)',
        [tables.map(name => prefix + name)],
      );
      assert.equal(rows.length, 5);
    });
    await c.beginTransaction();
    await check('seed inserts 36 products, 12 aliases, 3 chains, 4 branches, 125 observations', async () => {
      const seed = readFileSync(resolve(__dirname, '../seeds/001_demo_catalog.sql'), 'utf8')
        .replace(/^START TRANSACTION;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
      await query(seed);
      for (const [table, expected] of [['products', 36], ['product_aliases', 12], ['supermarkets', 3], ['branches', 4], ['prices', 125]]) {
        const [[row]] = await query(`SELECT COUNT(*) AS n FROM ${table}`);
        assert.equal(row.n, expected);
      }
    });
    await check('every demo observation is USD and explicitly labeled', async () => {
      const [[row]] = await query("SELECT COUNT(*) AS n FROM prices WHERE currency <> 'USD' OR source_type <> 'seed' OR source_note IS NULL OR source_note NOT LIKE 'DEMONSTRATION DATA%'");
      assert.equal(row.n, 0);
    });
    await check('all four verification statuses are represented', async () => {
      const [rows] = await query('SELECT DISTINCT status FROM prices ORDER BY status');
      assert.deepEqual(rows.map(row => row.status), ['flagged', 'pending', 'rejected', 'verified']);
    });
    await check('all price relationships resolve through products, branches and chains', async () => {
      const [[row]] = await query('SELECT COUNT(*) AS n FROM prices r JOIN products p ON p.id=r.product_id JOIN branches b ON b.id=r.branch_id JOIN supermarkets s ON s.id=b.supermarket_id');
      assert.equal(row.n, 125);
    });
    await check('unknown product, branch, chain and alias target fail foreign keys', async () => {
      await rejected("INSERT INTO prices (product_id,branch_id,price,observed_at,source_type) VALUES (4294967295,1,1,'2026-01-01','manual')", 1452);
      await rejected("INSERT INTO prices (product_id,branch_id,price,observed_at,source_type) VALUES (1,4294967295,1,'2026-01-01','manual')", 1452);
      await rejected("INSERT INTO branches (supermarket_id,name,address) VALUES (4294967295,'Test','Test')", 1452);
      await rejected("INSERT INTO product_aliases (product_id,alias) VALUES (4294967295,'Unknown 1kg')", 1452);
    });
    await check('zero/negative/null prices, invalid status/currency/source and unlabeled seed fail', async () => {
      for (const value of ['0', '-1']) {
        await rejected(`INSERT INTO prices (product_id,branch_id,price,observed_at,source_type) VALUES (1,1,${value},'2026-01-01','manual')`, 3819);
      }
      await rejected("INSERT INTO prices (product_id,branch_id,price,observed_at,source_type) VALUES (1,1,NULL,'2026-01-01','manual')", 1048);
      for (const [column, value] of [['status', 'outdated'], ['currency', 'EUR'], ['source_type', 'receipt']]) {
        const columns = column === 'source_type' ? 'source_type' : `source_type,${column}`;
        const values = column === 'source_type' ? `'${value}'` : `'manual','${value}'`;
        await rejected(`INSERT INTO prices (product_id,branch_id,price,observed_at,${columns}) VALUES (1,1,1,'2026-01-01',${values})`, 3819);
      }
      await rejected("INSERT INTO prices (product_id,branch_id,price,observed_at,source_type) VALUES (1,1,1,'2026-01-01','seed')", 3819);
    });
    await check('duplicate identities, normalized alias collisions, chains and branches fail', async () => {
      await rejected('INSERT INTO products (name,brand,variant,size,unit,pack_quantity,category) SELECT name,brand,variant,size,unit,pack_quantity,category FROM products WHERE id=1', 1062);
      await rejected("INSERT INTO product_aliases (product_id,alias) VALUES (2,'Coca-Cola 1.5 L')", 1062);
      await rejected("INSERT INTO supermarkets (name) VALUES ('Spinneys - DEMONSTRATION DATA')", 1062);
      await rejected("INSERT INTO branches (supermarket_id,name,address) VALUES (1,'Beirut - DEMO','Test')", 1062);
    });
    await check('invalid package size/count, empty names and coordinates fail', async () => {
      await rejected("INSERT INTO products (name,brand,size,unit,category) VALUES ('Test','Test',0,'g','Test')", 3819);
      await rejected("INSERT INTO products (name,brand,size,unit,pack_quantity,category) VALUES ('Test','Test',1,'g',0,'Test')", 3819);
      await rejected("INSERT INTO supermarkets (name) VALUES ('   ')", 3819);
      await rejected("INSERT INTO product_aliases (product_id,alias) VALUES (1,' - ')", 3819);
      await rejected("INSERT INTO branches (supermarket_id,name,address,latitude,longitude) VALUES (1,'Test','Test',91,0)", 3819);
      await rejected("INSERT INTO branches (supermarket_id,name,address,latitude) VALUES (1,'Test','Test',33)", 3819);
    });
    await check('different sizes and multipacks have distinct product IDs', async () => {
      const [rows] = await query('SELECT id,size,unit,pack_quantity FROM products WHERE id IN (1,2,4,5) ORDER BY id');
      assert.equal(rows.length, 4);
      assert.notEqual(rows[0].size, rows[1].size);
      assert.equal(rows[2].pack_quantity, 1);
      assert.equal(rows[3].pack_quantity, 6);
    });
    await check('history retained; latest verified excludes newer pending/flagged/rejected', async () => {
      const [[count]] = await query('SELECT COUNT(*) AS n FROM prices WHERE product_id=1 AND branch_id=1');
      assert.equal(count.n, 6);
      const [[latest]] = await query("SELECT price FROM prices WHERE product_id=1 AND branch_id=1 AND status='verified' ORDER BY observed_at DESC,id DESC LIMIT 1");
      assert.equal(latest.price, '1.70');
      // Even identical observation times must remain insertable; no unique product/branch pair.
      await query("INSERT INTO prices (product_id,branch_id,price,observed_at,source_type) VALUES (1,1,2.00,'2026-01-15 12:00:00','manual')");
      const [[after]] = await query('SELECT COUNT(*) AS n FROM prices WHERE product_id=1 AND branch_id=1');
      assert.equal(after.n, 7);
    });
    await check('parents with referenced observations cannot be deleted', async () => {
      await rejected('DELETE FROM products WHERE id=1', 1451);
      await rejected('DELETE FROM branches WHERE id=1', 1451);
      await rejected('DELETE FROM supermarkets WHERE id=1', 1451);
    });
    console.log(`${passed} checks passed`);
  } finally {
    try {
      await c.rollback();
      if (ownsNames) {
        for (const table of [...tables].reverse()) {
          await c.query(`DROP TABLE IF EXISTS \`${prefix}${table}\``);
        }
        console.log('Rolled back fixture rows and removed isolated test tables');
      }
    } finally {
      await c.end();
    }
  }
}
main().catch(error => {
  // Do not print connection options, credentials or raw server messages.
  console.error(`FAIL ${error.code || error.name}${error.errno ? ` (${error.errno})` : ''}`);
  if (error instanceof assert.AssertionError) console.error(error.message);
  process.exitCode = 1;
});
