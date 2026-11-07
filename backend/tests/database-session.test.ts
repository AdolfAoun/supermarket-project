import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool, PoolConnection } from 'mysql2';
import { configurePoolSessions } from '../src/config/database.js';

test('borrowers wait for session setup on every checkout, including reused connections', () => {
  let finishSetup: ((error: Error | null) => void) | undefined;
  let setups = 0;
  const connection = {
    query: (_options: unknown, callback: (error: Error | null) => void) => { setups++; finishSetup = callback; },
  } as PoolConnection;
  const databasePool: Pick<Pool, 'getConnection'> = { getConnection: callback => callback(null, connection) };
  configurePoolSessions(databasePool);
  for (let checkout = 0; checkout < 2; checkout++) {
    let returned = false;
    databasePool.getConnection((error, value) => { assert.equal(error, null); assert.equal(value, connection); returned = true; });
    assert.equal(returned, false);
    finishSetup!(null);
    assert.equal(returned, true);
  }
  assert.equal(setups, 2);
});

test('failed session setup discards the connection and reports failure instead of lending it', () => {
  const failure = new Error('session setup failed');
  let destroyed = false;
  const connection = {
    query: (_options: unknown, callback: (error: Error) => void) => callback(failure),
    destroy: () => { destroyed = true; },
  } as unknown as PoolConnection;
  const databasePool: Pick<Pool, 'getConnection'> = { getConnection: callback => callback(null, connection) };
  configurePoolSessions(databasePool);
  let callbacks = 0;
  databasePool.getConnection(error => { callbacks++; assert.equal(error, failure); assert.equal(destroyed, true); });
  assert.equal(callbacks, 1);
});

test('acquisition errors are propagated without attempting session configuration', () => {
  const failure = new Error('database unavailable');
  const databasePool: Pick<Pool, 'getConnection'> = { getConnection: callback => callback(failure, undefined as unknown as PoolConnection) };
  configurePoolSessions(databasePool);
  let callbacks = 0;
  databasePool.getConnection(error => { callbacks++; assert.equal(error, failure); });
  assert.equal(callbacks, 1);
});
