import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../services/api';
import { createSession, type TokenStorage } from '../services/session';
import { createAuthApi } from '../services/account-api';
import { deferred } from './fixtures';
import { token, user, stamp } from './private-fixtures';

function setup(saved: string | null = null, overrides: Partial<ReturnType<typeof createAuthApi>> = {}) {
  let value = saved;
  const storage: TokenStorage = { get: async () => value, set: async token => { value = token; }, remove: async () => { value = null; } };
  const api: ReturnType<typeof createAuthApi> = {
    register: async () => user, me: async () => user,
    login: async () => ({ token, user, expiresAt: stamp }), logout: async () => undefined, ...overrides,
  };
  return { storage, api, session: createSession(storage, api), value: () => value };
}
test('restores secure token through me; exposed state contains only profile and session version', async () => {
  let received = '';
  const fixture = setup(token, { me: async value => { received = value; return user; } });
  await fixture.session.restore();
  assert.equal(received, token); assert.equal(fixture.session.getState().status, 'authenticated');
  assert.deepEqual(fixture.session.getState().user, user);
  assert.equal(JSON.stringify(fixture.session.getState()).includes(token), false);
});
test('missing/malformed storage restores guest; valid login persists only token', async () => {
  for (const saved of [null, 'invalid']) {
    const fixture = setup(saved); await fixture.session.restore();
    assert.equal(fixture.session.getState().status, 'guest'); assert.equal(fixture.value(), null);
    await fixture.session.login({ email: user.email, password: 'password123' });
    assert.equal(fixture.value(), token); assert.equal(fixture.session.getState().status, 'authenticated');
  }
});
test('expired/revoked stored session clears secure storage and requires login', async () => {
  const fixture = setup(token, { me: async () => { throw new ApiError('http', 'expired', 401); } });
  await fixture.session.restore();
  assert.equal(fixture.value(), null); assert.equal(fixture.session.getState().status, 'guest');
  assert.match(fixture.session.getState().message!, /expired/);
});
test('network/500 restoration failures retain saved token and support retry', async () => {
  for (const failure of [new ApiError('network', 'offline'), new ApiError('http', 'server', 500)]) {
    let attempts = 0;
    const fixture = setup(token, { me: async () => { if (!attempts++) throw failure; return user; } });
    await fixture.session.restore();
    assert.equal(fixture.value(), token); assert.equal(fixture.session.getState().status, 'restore_error');
    await fixture.session.restore(); assert.equal(fixture.session.getState().status, 'authenticated');
  }
});
test('logout hides private state immediately, deletes secure token and revokes server token', async () => {
  const gate = deferred<void>(); let revoked = '';
  const fixture = setup(token, { logout: async value => { revoked = value; await gate.promise; } });
  await fixture.session.restore();
  const pending = fixture.session.logout();
  assert.equal(fixture.session.getState().status, 'guest');
  gate.resolve(); await pending;
  assert.equal(fixture.value(), null); assert.equal(revoked, token);
});
test('private 401 clears session but network/500 errors preserve it', async () => {
  for (const status of [500, 401]) {
    const fixture = setup(token); await fixture.session.restore();
    await assert.rejects(fixture.session.run(async () => { throw new ApiError('http', 'safe', status); }));
    assert.equal(fixture.session.getState().status, status === 401 ? 'guest' : 'authenticated');
    assert.equal(fixture.value(), status === 401 ? null : token);
  }
});
test('late private response after logout is cancelled even if transport ignores abort', async () => {
  const fixture = setup(token); await fixture.session.restore();
  const response = deferred<string>(); let signal: AbortSignal | undefined;
  const pending = fixture.session.run(async (_token, ownSignal) => { signal = ownSignal; return response.promise; });
  await fixture.session.logout(); assert.equal(signal?.aborted, true);
  response.resolve('private old data');
  await assert.rejects(pending, error => error instanceof ApiError && error.kind === 'cancelled');
});
test('late 401 from former account cannot log out a newly authenticated account', async () => {
  const fixture = setup(token); await fixture.session.restore(); const response = deferred<string>();
  const pending = fixture.session.run(() => response.promise);
  await fixture.session.logout();
  await fixture.session.login({ email: user.email, password: 'password123' });
  response.reject(new ApiError('http', 'old 401', 401));
  await assert.rejects(pending, error => error instanceof ApiError && error.kind === 'cancelled');
  assert.equal(fixture.session.getState().status, 'authenticated'); assert.equal(fixture.value(), token);
});
test('delayed server logout failure cannot overwrite a new login', async () => {
  const response = deferred<void>(); const fixture = setup(token, { logout: async () => { await response.promise; return undefined; } });
  await fixture.session.restore(); const pending = fixture.session.logout();
  await fixture.session.login({ email: user.email, password: 'password123' });
  response.reject(new ApiError('network', 'offline')); await pending;
  assert.equal(fixture.session.getState().status, 'authenticated');
});
test('storage failures are reported safely; unsuccessful login never exposes an authenticated profile', async () => {
  const fixture = setup();
  fixture.storage.set = async () => { throw new Error('private platform details'); };
  await fixture.session.restore();
  await assert.rejects(fixture.session.login({ email: user.email, password: 'password123' }), error => error instanceof ApiError && !error.message.includes('private'));
  assert.equal(fixture.session.getState().status, 'guest');
  fixture.storage.remove = async () => { throw new Error(); };
  await fixture.session.logout(); assert.match(fixture.session.getState().message!, /storage could not be cleared/);
});
test('pending storage write cannot restore a token after logout', async () => {
  const fixture = setup(), started = deferred<void>(), finish = deferred<void>();
  const set = fixture.storage.set;
  fixture.storage.set = async value => { started.resolve(); await finish.promise; await set(value); };
  await fixture.session.restore();
  const pending = fixture.session.login({ email: user.email, password: 'password123' });
  await started.promise;
  const logout = fixture.session.logout(); finish.resolve();
  await assert.rejects(pending, error => error instanceof ApiError && error.kind === 'cancelled');
  await logout; assert.equal(fixture.value(), null); assert.equal(fixture.session.getState().status, 'guest');
});
test('a partially successful secure write is removed and its newly issued server session revoked', async () => {
  let revoked = '';
  const fixture = setup(null, { logout: async value => { revoked = value; return undefined; } });
  const set = fixture.storage.set;
  fixture.storage.set = async value => { await set(value); throw new Error('native write failure'); };
  await fixture.session.restore();
  await assert.rejects(fixture.session.login({ email: user.email, password: 'password123' }));
  assert.equal(fixture.value(), null); assert.equal(revoked, token); assert.equal(fixture.session.getState().status, 'guest');
});
