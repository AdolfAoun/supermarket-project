import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AuthRepository } from '../src/modules/auth/repository.js';
import type { ShoppingListRepository } from '../src/modules/shopping-lists/repository.js';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';
import { tokenHash } from '../src/modules/auth/routes.js';

const token = 'a'.repeat(64);
const user = { id: 7, displayName: 'Demo', email: 'demo@example.com' };
const fail = async (): Promise<never> => { throw new Error('private SQL password_hash token_hash stack'); };
const auth: AuthRepository = {
  register: fail, findAccount: fail, createSession: fail,
  authenticate: async hash => hash === tokenHash(token) ? user : null, logout: fail,
};
const lists: ShoppingListRepository = {
  list: fail, create: fail, get: fail, rename: fail, remove: fail, addItem: fail, setQuantity: fail, removeItem: fail,
};
const app = (a: Partial<AuthRepository> = {}, l: Partial<ShoppingListRepository> = {}) =>
  createApp(async () => {}, [], undefined, { ...auth, ...a }, { ...lists, ...l });

test('password hashing is salted, bounded, verifiable and preserves exact input', async () => {
  const [first, second] = await Promise.all([hashPassword(' hello123 '), hashPassword(' hello123 ')]);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(' hello123 ', first), true);
  assert.equal(await verifyPassword('hello123', first), false);
  await assert.rejects(verifyPassword('hello123', 'corrupt'));
});
test('registration rejects invalid bodies, emails, names and password bounds before SQL', async () => {
  const valid = { displayName: 'Demo', email: 'demo@example.com', password: 'password123' };
  const cases: unknown[] = [null, [], {}, { ...valid, userId: 1 }];
  for (const displayName of ['', ' \t\n', 'a'.repeat(81), 3]) cases.push({ ...valid, displayName });
  for (const email of ['', 'invalid', 'a@b', 'a..b@example.com', '.a@example.com', 'a@-bad.com', 'a@b..com', 'é@example.com', 'a'.repeat(65) + '@example.com']) cases.push({ ...valid, email });
  for (const password of ['', '1234567', 'a'.repeat(129), 12345678, null]) cases.push({ ...valid, password });
  for (const value of cases) await request(app()).post('/api/auth/register').send(value as object).expect(400);
});
test('registration trims profile fields, normalizes email, hashes password and requires explicit login', async () => {
  const response = await request(app({ register: async (name, email, hash) => {
    assert.equal(name, 'Demo'); assert.equal(email, user.email);
    assert.equal(await verifyPassword('password123', hash), true);
    return user;
  } })).post('/api/auth/register').send({ displayName: ' Demo ', email: ' DEMO@example.COM ', password: 'password123' }).expect(201);
  assert.deepEqual(response.body, { user });
  assert.equal(response.headers['cache-control'], 'no-store');
});
test('login validates required fields and rejects oversized bodies safely', async () => {
  for (const input of [{}, { email: 'bad', password: 'password123' }, { email: user.email, password: '' },
    { email: user.email, password: 'a'.repeat(129) }, { email: user.email, password: 'password123', userId: 7 }]) {
    await request(app()).post('/api/auth/login').send(input).expect(400);
  }
  const response = await request(app()).post('/api/auth/register').send({ password: 'a'.repeat(17000) }).expect(400);
  assert.deepEqual(response.body, { status: 'error', message: 'Request body too large' });
});
test('bearer middleware rejects missing, malformed and unknown sessions', async () => {
  for (const header of ['', 'Basic abc', 'Bearer', 'Bearer abc', `Bearer ${token} extra`, `Bearer ${'b'.repeat(64)}`]) {
    await request(app()).get('/api/auth/me').set('Authorization', header).expect(401);
  }
  const response = await request(app()).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
  assert.deepEqual(response.body, { user });
});
test('all eight private list operations require authentication', async () => {
  for (const [method, path] of [['get', ''], ['post', ''], ['get', '/1'], ['patch', '/1'], ['delete', '/1'],
    ['post', '/1/items'], ['patch', '/1/items/1'], ['delete', '/1/items/1']] as const) {
    await request(app())[method](`/api/shopping-lists${path}`).send({}).expect(401);
  }
});
test('list/item input validation rejects invalid names, IDs, products and quantities', async () => {
  const application = app();
  const send = (path: string, value: object) => request(application).post(path).set('Authorization', `Bearer ${token}`).send(value);
  for (const name of ['', ' \n\t', 'a'.repeat(121), 3, null]) await send('/api/shopping-lists', { name }).expect(400);
  for (const quantity of [undefined, 0, -1, 1.5, 1000, '2', null, {}, true]) {
    await send('/api/shopping-lists/1/items', { productId: 1, quantity }).expect(400);
    await request(application).patch('/api/shopping-lists/1/items/1').set('Authorization', `Bearer ${token}`).send({ quantity }).expect(400);
  }
  for (const productId of [undefined, 0, -1, 1.5, 4294967296, '1', null]) await send('/api/shopping-lists/1/items', { productId, quantity: 1 }).expect(400);
  for (const id of ['0', '-1', '01', '1.5', '1e2', 'abc', '4294967296', '%E0%A4%A']) {
    await request(application).get(`/api/shopping-lists/${id}`).set('Authorization', `Bearer ${token}`).expect(400);
    await request(application).delete(`/api/shopping-lists/1/items/${id}`).set('Authorization', `Bearer ${token}`).expect(400);
  }
  await send('/api/shopping-lists', { name: 'Demo', userId: 999 }).expect(400);
});
test('private routes derive owner from session and PATCH sets explicit quantity', async () => {
  const application = app({}, {
    setQuantity: async (owner, id, itemId, quantity) => {
      assert.deepEqual([owner, id, itemId, quantity], [7, 12, 3, 2]);
      return { id: itemId, quantity } as never;
    },
  });
  const response = await request(application).patch('/api/shopping-lists/12/items/3')
    .set('Authorization', `Bearer ${token}`).send({ quantity: 2 }).expect(200);
  assert.equal(response.body.item.quantity, 2);
});
test('auth and all list database failures return sanitized centralized errors', async () => {
  const application = app();
  const safe = { status: 'error', message: 'Internal server error' };
  assert.deepEqual((await request(application).post('/api/auth/login').send({ email: user.email, password: 'password123' }).expect(500)).body, safe);
  assert.deepEqual((await request(app({ authenticate: fail })).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(500)).body, safe);
  assert.deepEqual((await request(application).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(500)).body, safe);
  for (const [method, path, body] of [['get', '', {}], ['post', '', { name: 'Demo' }], ['get', '/1', {}],
    ['patch', '/1', { name: 'New' }], ['delete', '/1', {}], ['post', '/1/items', { productId: 1, quantity: 1 }],
    ['patch', '/1/items/1', { quantity: 2 }], ['delete', '/1/items/1', {}]] as const) {
    assert.deepEqual((await request(application)[method](`/api/shopping-lists${path}`).set('Authorization', `Bearer ${token}`).send(body).expect(500)).body, safe);
  }
});
