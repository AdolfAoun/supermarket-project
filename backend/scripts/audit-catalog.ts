// Read-only catalog plans/metadata. Run: npx tsx scripts/audit-catalog.ts
import assert from 'node:assert/strict';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { createCatalogRepository } from '../src/modules/catalog/repository.js';

async function audit() {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(env.db.host), 'Audit requires loopback MySQL');
  const calls: { sql: string; values: (number | string)[] }[] = [];
  const repository = createCatalogRepository(async (sql, values) => { calls.push({ sql, values }); return []; });
  await repository.listProducts('', 100);
  await repository.listProducts('coca', 100);
  await repository.findProduct(1);
  await repository.listPrices(1);
  await repository.listSupermarkets();
  const labels = ['catalog browse', 'catalog search', 'product detail', 'eligible comparison', 'supermarkets'];
  for (const [i, query] of calls.entries()) {
    const [rows] = await pool.execute<RowDataPacket[]>({ sql: `EXPLAIN ${query.sql}`, values: query.values, timeout: 5000 });
    console.log(JSON.stringify({ query: labels[i], plan: rows.map(row => ({
      selectType: row.select_type, table: row.table, access: row.type, key: row.key,
      estimatedRows: row.rows, extra: row.Extra,
    })) }));
  }
  const [counts] = await pool.query(`SELECT 'products' AS entity, COUNT(*) AS count FROM products
    UNION ALL SELECT 'product_aliases', COUNT(*) FROM product_aliases
    UNION ALL SELECT 'supermarkets', COUNT(*) FROM supermarkets
    UNION ALL SELECT 'branches', COUNT(*) FROM branches
    UNION ALL SELECT 'prices', COUNT(*) FROM prices`);
  console.log(JSON.stringify({ counts }));
  const [integrity] = await pool.query(`SELECT COUNT(*) AS orphanPrices FROM prices r
    LEFT JOIN products p ON p.id=r.product_id LEFT JOIN branches b ON b.id=r.branch_id
    LEFT JOIN supermarkets s ON s.id=b.supermarket_id
    WHERE p.id IS NULL OR b.id IS NULL OR s.id IS NULL`);
  const [constraints] = await pool.query(`SELECT table_name AS tableName, constraint_type AS constraintType, COUNT(*) AS count
    FROM information_schema.table_constraints WHERE constraint_schema=DATABASE()
    AND table_name IN ('products','product_aliases','supermarkets','branches','prices')
    GROUP BY table_name,constraint_type ORDER BY table_name,constraint_type`);
  const [relationships] = await pool.query(`SELECT table_name AS childTable, column_name AS childColumn,
    referenced_table_name AS parentTable, referenced_column_name AS parentColumn
    FROM information_schema.key_column_usage WHERE constraint_schema=DATABASE()
    AND referenced_table_name IS NOT NULL ORDER BY table_name,column_name`);
  const [indexes] = await pool.query(`SELECT table_name AS tableName, index_name AS indexName,
    GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columnsInOrder
    FROM information_schema.statistics WHERE table_schema=DATABASE()
    AND table_name IN ('products','product_aliases','supermarkets','branches','prices')
    GROUP BY table_name,index_name ORDER BY table_name,index_name`);
  const [[mode]] = await pool.query<RowDataPacket[]>('SELECT VERSION() AS version, @@SESSION.sql_mode AS sqlMode, @@SESSION.time_zone AS timeZone');
  const [grants] = await pool.query<RowDataPacket[]>('SHOW GRANTS');
  // Log capability names only, never account identities, connection options or passwords.
  const capabilities = grants.map(row => String(Object.values(row)[0]).split(' ON ')[0].replace(/^GRANT /, ''));
  console.log(JSON.stringify({ integrity, constraints, relationships, indexes, mode, capabilities }));
}
audit().catch(error => { console.error(`Audit failed: ${error.code ?? error.name}`); process.exitCode = 1; })
  .finally(() => pool.end());
