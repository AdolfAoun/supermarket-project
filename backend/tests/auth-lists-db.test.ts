import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, normalize } from 'node:path';
import { test } from 'node:test';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { configurePoolSessions } from '../src/config/database.js';
import { createAuthRepository } from '../src/modules/auth/repository.js';
import { createShoppingListRepository } from '../src/modules/shopping-lists/repository.js';
import { createCatalogRepository, createSqlReader } from '../src/modules/catalog/repository.js';
import { tokenHash } from '../src/modules/auth/routes.js';

// Explicit disposable server only. Never loads credentials from backend/.env.
// Verify @@datadir before any DDL; refuse the application's ordinary port.
test('T03-A disposable MySQL integration', { skip: !process.env.T03_TEST_PORT }, async t => {
  const port = Number(process.env.T03_TEST_PORT);
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== 3306);
  const expectedDirectory = process.env.T03_TEST_DATADIR;
  assert.ok(expectedDirectory, 'Set the dedicated disposable server datadir');
  assert.equal(normalize(expectedDirectory).toLowerCase(), normalize(resolve(process.env.TEMP!, 'supermarket-t03a-mysql')).toLowerCase());
  const admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', multipleStatements: true, timezone: 'Z' });
  const schema = 't03a_disposable_tests';
  let ownsSchema = false;
  let database: mysql.Pool | undefined;
  try {
    const [[server]] = await admin.query<RowDataPacket[]>('SELECT @@datadir AS directory, VERSION() AS version');
    assert.equal(normalize(server.directory).replace(/[\\/]+$/, '').toLowerCase(), normalize(expectedDirectory).replace(/[\\/]+$/, '').toLowerCase());
    assert.match(server.version, /^8\./);
    await admin.query(`CREATE DATABASE ${schema}`); // Fails safely if already present.
    ownsSchema = true;
    await admin.query(`USE ${schema}`);
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const table of ['products', 'product_aliases', 'supermarkets', 'branches', 'prices']) {
        const [rows] = await admin.query<RowDataPacket[]>(`SELECT * FROM ${table} ORDER BY id`);
        result[table] = rows;
      }
      return result;
    };
    await admin.query(await readFile(resolve('..', 'database/migrations/001_catalog.sql'), 'utf8'));
    await admin.query(await readFile(resolve('..', 'database/seeds/001_demo_catalog.sql'), 'utf8'));
    const original = await snapshot();
    await t.test('migration creates four tables and preserves every T02 fixture value', async () => {
      await admin.query(await readFile(resolve('..', 'database/migrations/002_users_and_shopping_lists.sql'), 'utf8'));
      assert.deepEqual(await snapshot(), original);
      const [tables] = await admin.query<RowDataPacket[]>("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()");
      assert.equal(tables.length, 9);
    });
    const callbackPool = (await import('mysql2')).default.createPool({ host: '127.0.0.1', port, user: 'root', password: '',
      database: schema, timezone: 'Z', connectionLimit: 5 });
    configurePoolSessions(callbackPool);
    database = callbackPool.promise();
    const auth = createAuthRepository(database);
    const lists = createShoppingListRepository(database);
    const catalog = createCatalogRepository(createSqlReader(database));
    const application = createApp(async () => { await database!.query('SELECT 1'); }, [], catalog, auth, lists);
    const profile = { displayName: 'Demo A', email: 'a@example.com', password: 'correct password' };
    let userId = 0;
    let token = '';
    let otherToken = '';
    let listId = 0;
    let itemId = 0;
    const bearer = () => `Bearer ${token}`;
    await t.test('valid registration returns safe profile without automatic session', async () => {
      const response = await request(application).post('/api/auth/register').send(profile).expect(201);
      userId = response.body.user.id;
      assert.deepEqual(response.body, { user: { id: userId, displayName: profile.displayName, email: profile.email } });
      const [[stored]] = await admin.query<RowDataPacket[]>('SELECT password_hash FROM users WHERE id = ?', [userId]);
      assert.match(stored.password_hash, /^scrypt\$/);
      assert.equal(stored.password_hash.includes(profile.password), false);
      const [[count]] = await admin.query<RowDataPacket[]>('SELECT COUNT(*) n FROM sessions');
      assert.equal(count.n, 0);
    });
    await t.test('duplicate/case-variant and concurrent registrations enforce unique normalized email', async () => {
      for (const email of [profile.email, ' A@EXAMPLE.COM ']) await request(application).post('/api/auth/register').send({ ...profile, email }).expect(409);
      const responses = await Promise.all(['race@example.com', 'RACE@example.COM'].map(email => request(application).post('/api/auth/register').send({ ...profile, email })));
      assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
      // Direct SQL also enforces case-insensitive uniqueness.
      await assert.rejects(admin.execute('INSERT INTO users (display_name,email,password_hash) VALUES (?, ?, ?)', ['SQL', 'A@EXAMPLE.COM', 'hash']), { code: 'ER_DUP_ENTRY' });
    });
    await t.test('correct login returns random token; only SHA-256 stored; expiry is exactly seven days', async () => {
      const response = await request(application).post('/api/auth/login').send({ email: ' A@EXAMPLE.COM ', password: profile.password }).expect(200);
      token = response.body.token;
      assert.match(token, /^[a-f0-9]{64}$/);
      assert.equal(response.body.tokenType, 'Bearer');
      assert.match(response.body.expiresAt, /^\d{4}-\d\d-\d\dT.*Z$/);
      assert.deepEqual(Object.keys(response.body.user).sort(), ['displayName', 'email', 'id']);
      const [[stored]] = await admin.execute<RowDataPacket[]>('SELECT token_hash, user_id, TIMESTAMPDIFF(SECOND,created_at,expires_at) lifetime FROM sessions WHERE user_id = ?', [userId]);
      assert.equal(stored.token_hash, tokenHash(token)); assert.notEqual(stored.token_hash, token);
      assert.equal(stored.lifetime, 604800);
      assert.equal(stored.user_id, userId);
      const second = await request(application).post('/api/auth/login').send({ email: profile.email, password: profile.password }).expect(200);
      assert.notEqual(second.body.token, token);
    });
    await t.test('incorrect password and nonexistent account return identical generic errors', async () => {
      const wrong = await request(application).post('/api/auth/login').send({ email: profile.email, password: 'incorrect password' }).expect(401);
      const absent = await request(application).post('/api/auth/login').send({ email: 'missing@example.com', password: profile.password }).expect(401);
      assert.deepEqual(wrong.body, absent.body);
      assert.deepEqual(wrong.body, { status: 'error', message: 'Invalid email or password' });
    });
    await t.test('current user derives identity from session and second user gets separate session', async () => {
      const response = await request(application).get('/api/auth/me').set('Authorization', bearer()).expect(200);
      assert.equal(response.body.user.id, userId);
      await request(application).post('/api/auth/register').send({ ...profile, email: 'b@example.com' }).expect(201);
      otherToken = (await request(application).post('/api/auth/login').send({ email: 'b@example.com', password: profile.password }).expect(200)).body.token;
      assert.notEqual(otherToken, token);
    });
    await t.test('create multiple empty lists, allow duplicate names, trim and rename', async () => {
      const first = await request(application).post('/api/shopping-lists').set('Authorization', bearer()).send({ name: ' Weekly ' }).expect(201);
      listId = first.body.shoppingList.id;
      assert.equal(first.body.shoppingList.name, 'Weekly');
      assert.match(first.body.shoppingList.createdAt, /Z$/);
      await request(application).post('/api/shopping-lists').set('Authorization', bearer()).send({ name: 'Weekly' }).expect(201);
      const all = await request(application).get('/api/shopping-lists').set('Authorization', bearer()).expect(200);
      assert.equal(all.body.shoppingLists.length, 2);
      const empty = await request(application).get(`/api/shopping-lists/${listId}`).set('Authorization', bearer()).expect(200);
      assert.deepEqual(empty.body.shoppingList.items, []);
      const renamed = await request(application).patch(`/api/shopping-lists/${listId}`).set('Authorization', bearer()).send({ name: ' New name ' }).expect(200);
      assert.equal(renamed.body.shoppingList.name, 'New name');
    });
    await t.test('adding canonical products combines quantities and keeps package sizes distinct', async () => {
      const first = await request(application).post(`/api/shopping-lists/${listId}/items`).set('Authorization', bearer()).send({ productId: 1, quantity: 2 }).expect(200);
      itemId = first.body.item.id;
      assert.equal(first.body.item.quantity, 2); assert.equal(first.body.item.product.size, 1.5);
      assert.equal(first.body.item.product.isActive, true);
      const second = await request(application).post(`/api/shopping-lists/${listId}/items`).set('Authorization', bearer()).send({ productId: 1, quantity: 3 }).expect(200);
      assert.equal(second.body.item.id, itemId); assert.equal(second.body.item.quantity, 5);
      const small = await request(application).post(`/api/shopping-lists/${listId}/items`).set('Authorization', bearer()).send({ productId: 2, quantity: 3 }).expect(200);
      assert.equal(small.body.item.product.size, 330); assert.notEqual(small.body.item.id, itemId);
      const detail = await request(application).get(`/api/shopping-lists/${listId}`).set('Authorization', bearer()).expect(200);
      assert.equal(detail.body.shoppingList.items.length, 2);
      await request(application).post(`/api/shopping-lists/${listId}/items`).set('Authorization', bearer()).send({ productId: 4294967295, quantity: 1 }).expect(404);
    });
    await t.test('every other-owner operation is inaccessible with the same 404 as missing resources', async () => {
      for (const [method, suffix, input] of [['get', '', {}], ['patch', '', { name: 'stolen' }], ['delete', '', {}],
        ['post', '/items', { productId: 3, quantity: 1 }], ['patch', `/items/${itemId}`, { quantity: 9 }], ['delete', `/items/${itemId}`, {}]] as const) {
        const other = await request(application)[method](`/api/shopping-lists/${listId}${suffix}`).set('Authorization', `Bearer ${otherToken}`).send(input).expect(404);
        const missing = await request(application)[method](`/api/shopping-lists/4294967295${suffix}`).set('Authorization', bearer()).send(input).expect(404);
        assert.deepEqual(other.body, missing.body);
      }
      const otherLists = await request(application).get('/api/shopping-lists').set('Authorization', `Bearer ${otherToken}`).expect(200);
      assert.deepEqual(otherLists.body.shoppingLists, []);
      const detail = await lists.get(userId, listId);
      assert.equal(detail.name, 'New name'); assert.equal(detail.items[0].quantity, 5);
    });
    await t.test('item IDs from another list cannot be changed or removed', async () => {
      const another = await lists.create(userId, 'Another');
      const item = await lists.addItem(userId, another.id, 1, 1);
      for (const method of ['patch', 'delete'] as const) {
        await request(application)[method](`/api/shopping-lists/${listId}/items/${item.id}`).set('Authorization', bearer()).send({ quantity: 4 }).expect(404);
      }
      assert.equal((await lists.get(userId, another.id)).items[0].quantity, 1);
      await lists.remove(userId, another.id);
    });
    await t.test('PATCH replaces quantity including no-op; deleting an item preserves product', async () => {
      for (let i = 0; i < 2; i++) {
        const response = await request(application).patch(`/api/shopping-lists/${listId}/items/${itemId}`).set('Authorization', bearer()).send({ quantity: 2 }).expect(200);
        assert.equal(response.body.item.quantity, 2);
      }
      const detail = await lists.get(userId, listId);
      const small = detail.items.find(item => item.productId === 2)!;
      await request(application).delete(`/api/shopping-lists/${listId}/items/${small.id}`).set('Authorization', bearer()).expect(204);
      await request(application).delete(`/api/shopping-lists/${listId}/items/${small.id}`).set('Authorization', bearer()).expect(404);
      assert.ok(await catalog.findProduct(2));
    });
    await t.test('inactive products remain visible with quantity, can be edited/removed, cannot be added', async () => {
      await admin.execute('UPDATE products SET is_active = 0 WHERE id = 1');
      try {
        const detail = await request(application).get(`/api/shopping-lists/${listId}`).set('Authorization', bearer()).expect(200);
        assert.equal(detail.body.shoppingList.items[0].product.isActive, false);
        assert.equal(detail.body.shoppingList.items[0].quantity, 2);
        await request(application).post(`/api/shopping-lists/${listId}/items`).set('Authorization', bearer()).send({ productId: 1, quantity: 1 }).expect(400);
        await lists.setQuantity(userId, listId, itemId, 3);
        await lists.removeItem(userId, listId, itemId);
      } finally { await admin.execute('UPDATE products SET is_active = 1 WHERE id = 1'); }
    });
    await t.test('concurrent duplicate additions create one row and lose no increments', async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => lists.addItem(userId, listId, 1, 2)));
      assert.equal(new Set(results.map(item => item.id)).size, 1);
      const detail = await lists.get(userId, listId);
      assert.equal(detail.items.length, 1); assert.equal(detail.items[0].quantity, 24);
      itemId = detail.items[0].id;
    });
    await t.test('concurrent increments enforce cap atomically and roll back rejected additions', async () => {
      await lists.setQuantity(userId, listId, itemId, 998);
      const results = await Promise.allSettled([lists.addItem(userId, listId, 1, 1), lists.addItem(userId, listId, 1, 1)]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
      assert.equal(failure.reason.status, 400);
      assert.equal((await lists.get(userId, listId)).items[0].quantity, 999);
      await request(application).post(`/api/shopping-lists/${listId}/items`).set('Authorization', bearer()).send({ productId: 1, quantity: 1 }).expect(400);
    });
    await t.test('concurrent explicit quantity updates remain whole values without lost partial writes', async () => {
      await Promise.all([lists.setQuantity(userId, listId, itemId, 2), lists.setQuantity(userId, listId, itemId, 7)]);
      assert.ok([2, 7].includes((await lists.get(userId, listId)).items[0].quantity));
    });
    await t.test('concurrent delete and addition cannot leave orphan items or delete a product', async () => {
      const temporary = await lists.create(userId, "O'Brien \\ list");
      assert.equal(temporary.name, "O'Brien \\ list");
      const results = await Promise.allSettled([lists.remove(userId, temporary.id), lists.addItem(userId, temporary.id, 2, 1)]);
      assert.equal(results[0].status, 'fulfilled');
      if (results[1].status === 'rejected') assert.equal(results[1].reason.status, 404);
      const [[count]] = await admin.execute<RowDataPacket[]>('SELECT COUNT(*) n FROM shopping_list_items WHERE shopping_list_id = ?', [temporary.id]);
      assert.equal(count.n, 0); assert.ok(await catalog.findProduct(2));
    });
    await t.test('foreign keys, item identity, quantities, session uniqueness and nonempty names are enforced', async () => {
      const rejected = async (sql: string, values: (string | number)[], code: string) => assert.rejects(admin.execute(sql, values), { code });
      await rejected('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 7 DAY))', [4294967295, 'f'.repeat(64)], 'ER_NO_REFERENCED_ROW_2');
      await rejected('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 7 DAY))', [userId, tokenHash(token)], 'ER_DUP_ENTRY');
      await rejected('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES (?, ?, ?)', [userId, 'e'.repeat(64), '2000-01-01'], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejected('INSERT INTO shopping_lists (user_id,name) VALUES (?, ?)', [4294967295, 'bad'], 'ER_NO_REFERENCED_ROW_2');
      await rejected('INSERT INTO shopping_lists (user_id,name) VALUES (?, ?)', [userId, '   '], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejected('INSERT INTO shopping_list_items (shopping_list_id,product_id,quantity) VALUES (?, ?, ?)', [listId, 1, 1], 'ER_DUP_ENTRY');
      for (const values of [[listId, 4294967295, 1], [4294967295, 2, 1]]) await rejected('INSERT INTO shopping_list_items (shopping_list_id,product_id,quantity) VALUES (?, ?, ?)', values, 'ER_NO_REFERENCED_ROW_2');
      for (const q of [0, 1000]) await rejected('INSERT INTO shopping_list_items (shopping_list_id,product_id,quantity) VALUES (?, ?, ?)', [listId, 2, q], 'ER_CHECK_CONSTRAINT_VIOLATED');
    });
    await t.test('list delete cascades items and leaves all catalog rows unchanged', async () => {
      await request(application).delete(`/api/shopping-lists/${listId}`).set('Authorization', bearer()).expect(204);
      const [[count]] = await admin.execute<RowDataPacket[]>('SELECT COUNT(*) n FROM shopping_list_items WHERE shopping_list_id = ?', [listId]);
      assert.equal(count.n, 0);
      await request(application).get(`/api/shopping-lists/${listId}`).set('Authorization', bearer()).expect(404);
      assert.deepEqual(await snapshot(), original);
    });
    await t.test('expired sessions are rejected at the expiry boundary', async () => {
      await admin.execute('UPDATE sessions SET created_at = DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 8 DAY), expires_at = UTC_TIMESTAMP(6) WHERE token_hash = ?', [tokenHash(otherToken)]);
      await request(application).get('/api/auth/me').set('Authorization', `Bearer ${otherToken}`).expect(401);
      await request(application).get('/api/shopping-lists').set('Authorization', `Bearer ${otherToken}`).expect(401);
    });
    await t.test('logout revokes current token and preserves other independent sessions', async () => {
      await request(application).post('/api/auth/logout').set('Authorization', bearer()).expect(204);
      await request(application).get('/api/auth/me').set('Authorization', bearer()).expect(401);
      await request(application).post('/api/auth/logout').set('Authorization', bearer()).expect(401);
      const [[count]] = await admin.execute<RowDataPacket[]>('SELECT COUNT(*) n FROM sessions WHERE user_id = ?', [userId]);
      assert.equal(count.n, 1);
    });
    await t.test('user delete cascades sessions/lists/items without deleting products', async () => {
      const list = await lists.create(userId, 'cascade');
      await lists.addItem(userId, list.id, 1, 1);
      await admin.execute('DELETE FROM users WHERE id = ?', [userId]);
      for (const [table, column, id] of [['sessions', 'user_id', userId], ['shopping_lists', 'user_id', userId], ['shopping_list_items', 'shopping_list_id', list.id]] as const) {
        const [[row]] = await admin.execute<RowDataPacket[]>(`SELECT COUNT(*) n FROM ${table} WHERE ${column} = ?`, [id]);
        assert.equal(row.n, 0);
      }
      assert.deepEqual(await snapshot(), original);
    });
    await t.test('guest T01/T02 routes still work against real SQL', async () => {
      await request(application).get('/api/health').expect(200);
      await request(application).get('/api/health/db').expect(200);
      assert.equal((await request(application).get('/api/products').expect(200)).body.products.length, 36);
      assert.equal((await request(application).get('/api/products?search=Coke%201.5L').expect(200)).body.products[0].id, 1);
      await request(application).get('/api/products/1').expect(200);
      assert.equal((await request(application).get('/api/products/1/prices').expect(200)).body.prices.length, 4);
      assert.equal((await request(application).get('/api/supermarkets').expect(200)).body.supermarkets.length, 3);
    });
  } finally {
    if (database) await database.end();
    if (ownsSchema) await admin.query(`DROP DATABASE ${schema}`);
    await admin.end();
  }
});
