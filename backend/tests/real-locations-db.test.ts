import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalize, resolve } from 'node:path';
import { test } from 'node:test';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { executeSqlScript } from './fixtures/sql-script.js';

test('optional real locations: atomic, repeatable and collision-safe in disposable MySQL', { skip: !process.env.T03_TEST_PORT }, async t => {
  const port = Number(process.env.T03_TEST_PORT), directory = process.env.T03_TEST_DATADIR;
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== 3306);
  assert.ok(directory);
  const canonical = (s: string) => normalize(s).replace(/[\\/]+$/, '').toLowerCase();
  assert.equal(canonical(directory), canonical(resolve(process.env.TEMP!, 'supermarket-t03a-mysql')));
  const connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', multipleStatements: true });
  const schema = 't05b_disposable_fixture_tests'; let owns = false;
  try {
    const [[server]] = await connection.query<RowDataPacket[]>('SELECT @@datadir directory');
    assert.equal(canonical(server.directory), canonical(directory));
    await connection.query(`CREATE DATABASE ${schema}`); owns = true;
    await connection.query(`USE ${schema}`);
    await connection.query(await readFile(resolve('../database/migrations/001_catalog.sql'), 'utf8'));
    await connection.query(await readFile(resolve('../database/seeds/001_demo_catalog.sql'), 'utf8'));
    const script = await readFile(resolve('../database/seeds/002_optional_real_locations.sql'), 'utf8');
    const run = () => executeSqlScript(sql => connection.query(sql), script);
    const snapshot = async () => {
      const rows = [];
      for (const table of ['supermarkets', 'branches', 'prices']) rows.push((await connection.query(`SELECT * FROM ${table} ORDER BY id`))[0]);
      return rows;
    };
    const original = await snapshot();
    await t.test('successful and repeated imports add only identical locations, never prices', async () => {
      await run(); const imported = await snapshot(); await run();
      assert.deepEqual(await snapshot(), imported);
      assert.deepEqual(imported[2], original[2]);
      assert.equal((imported[0] as unknown[]).length, 4); assert.equal((imported[1] as unknown[]).length, 16);
      await connection.query('DELETE FROM branches WHERE id=1081');
      await run(); assert.deepEqual(await snapshot(), imported, 'An identical existing subset can be completed safely');
    });
    await connection.query('DELETE FROM branches WHERE supermarket_id=1001; DELETE FROM supermarkets WHERE id=1001');
    for (const [name, setup] of [
      ['occupied supermarket ID', "INSERT INTO supermarkets VALUES (1001,'Owner chain')"],
      ['same supermarket name at another ID', "INSERT INTO supermarkets VALUES (2001,'Spinneys')"],
      ['late branch ID collision rolls back earlier inserts and chain', "INSERT INTO branches VALUES (1081,1,'Owner branch','Owner address',NULL,NULL)"],
      ['branch unique-name collision', "INSERT INTO supermarkets VALUES (1001,'Spinneys'); INSERT INTO branches VALUES (2001,1001,'Ajaltoun','Owner address',NULL,NULL)"],
      ['changed coordinate at fixture ID', "INSERT INTO supermarkets VALUES (1001,'Spinneys'); INSERT INTO branches VALUES (1081,1001,'Ajaltoun','Ajaltoun main road, Keserwan',NULL,NULL)"],
    ]) await t.test(name, async () => {
      await connection.query(setup); const before = await snapshot();
      await assert.rejects(run());
      // Even a client that continues past the failed CALL cannot commit partial rows.
      await connection.query('COMMIT'); assert.deepEqual(await snapshot(), before);
      await connection.query('DROP PROCEDURE t05b_import_real_locations');
      await connection.query('DELETE FROM branches WHERE id>=1000; DELETE FROM supermarkets WHERE id>=1000');
      assert.deepEqual(await snapshot(), original);
    });
  } finally {
    if (owns) await connection.query(`DROP DATABASE ${schema}`);
    await connection.end();
  }
});
