import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fuelNavigation, readFuelResult, validFuel, type FuelRequest } from '../services/fuel';
import { createFuelPreferences } from '../services/fuel-preferences';
import { createListApi } from '../services/account-api';
import { createApiClient, ApiError } from '../services/api';
import { createResource } from '../services/resource';
import { deferred } from './fixtures';
import { optimizeTrip } from '../../backend/src/modules/basket/trip';
import { readFuelSettings } from '../../backend/src/modules/basket/fuel';
import { fuelSnapshot, fuelRouting, tripInput } from '../../backend/tests/fixtures/fuel';
import { createApp } from '../../backend/src/app';
import type { AuthRepository } from '../../backend/src/modules/auth/repository';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

const now = new Date('2026-11-22T12:00:00Z');
async function response(input = tripInput()) {
  const snapshot = fuelSnapshot([['1.00', '5.00'], ['5.00', '1.00']]);
  return optimizeTrip(snapshot, input, fuelRouting(snapshot), undefined, now);
}
test('mobile and server agree on consumption/price boundaries and explicit free fuel', () => {
  for (const consumption of ['', '0', '-1', '100.01', 'NaN', '1,5', '1e1', ' 8', '8.001', '0.01', '6', '18.25', '100.00']) {
    for (const price of ['', '-1', 'Infinity', '1.234', '10000000000', '0', '1.25', '90000']) {
      const fuel = { consumption, price, currency: 'USD' as const };
      let serverValid = true; try { readFuelSettings(fuel); } catch { serverValid = false; }
      assert.equal(validFuel(fuel), serverValid, JSON.stringify(fuel));
    }
  }
});
test('fuel reader accepts exact backend plans, full active coverage, units, freshness and visit order', async () => {
  const raw = await response(), result = readFuelResult(raw, 5, tripInput());
  assert.equal(result.plans[0].grocery.totalUsd, '2.00'); assert.equal(result.plans[0].fuelUsd, '1.00'); assert.equal(result.plans[0].totalUsd, '3.00');
  assert.deepEqual(result.plans[0].visitOrder, [1, 2]); assert.equal(result.plans[0].grocery.allocations[0].items[0].freshness, 'recent');
  assert.equal(result.distancePolicy, 'nonnegative_additional_distance');
});
test('malformed totals, missing coverage, wrong parameters, bad routes and misleading completeness fail closed', async () => {
  const original = await response();
  const cases = [
    (r: typeof original) => { r.plans[0].totalUsd = '0.00'; },
    (r: typeof original) => { r.plans[0].grocery.allocations[0].items = []; },
    (r: typeof original) => { r.plans[0].grocery.allocations[0].items[0].quantity = 999; },
    (r: typeof original) => { r.plans[0].fuelExactUsd.denominator = '0'; },
    (r: typeof original) => { r.plans[0].routeDistanceMeters = NaN; },
    (r: typeof original) => { r.plans[0].chargedDistanceMeters = 0; },
    (r: typeof original) => { r.plans[0].routePoints.reverse(); },
    (r: typeof original) => { r.plans[0].visitOrder = [1, 1]; },
    (r: typeof original) => { r.journey.origin.latitude = 0; },
    (r: typeof original) => { r.fuel.price = '0'; },
    (r: typeof original) => { r.maximumStores = 1; },
    (r: typeof original) => { r.routeEvaluations = 25; },
    (r: typeof original) => { r.evaluationComplete = true; r.routeFailures.push({ branchIds: [1], reason: 'timeout' }); },
  ];
  for (const change of cases) { const raw = structuredClone(original); change(raw); assert.throws(() => readFuelResult(raw, 5, tripInput())); }
  assert.throws(() => readFuelResult(original, 6, tripInput()));
});
test('unavailable routes remain an explicit empty fuel result and matching endpoints use full-route fuel', async () => {
  const snapshot = fuelSnapshot([['1.00']]); snapshot.locations = [];
  const raw = await optimizeTrip(snapshot, tripInput(), fuelRouting(snapshot), undefined, now);
  const result = readFuelResult(raw, 5, tripInput()); assert.deepEqual(result.plans, []); assert.equal(result.evaluationComplete, false);
  const input = tripInput(); input.journey.destination = input.journey.origin;
  const full = readFuelResult(await response(input), 5, input);
  assert.equal(full.distancePolicy, 'full_shopping_route'); assert.equal(full.plans[0].fuelUsd, '2.00');
});
test('authenticated fuel client sends typed POST once, validates payload and permits independent grocery mode', async () => {
  const raw = await response(), calls: string[] = [];
  const client = createApiClient({ baseUrl: () => 'http://fixture/api', fetch: async (url, options) => {
    calls.push(String(url)); assert.equal(options?.method, 'POST'); assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer fixture');
    assert.deepEqual(JSON.parse(String(options?.body)), tripInput()); return new Response(JSON.stringify(raw));
  } });
  const api = createListApi((operation, signal) => operation('fixture', signal ?? new AbortController().signal), client);
  assert.equal((await api.optimizeFuel(5, tripInput())).plans[0].totalUsd, '3.00');
  assert.equal(calls.length, 1); assert.equal(calls[0], 'http://fixture/api/shopping-lists/5/fuel-optimization');
  assert.throws(() => api.optimizeFuel(5, { ...tripInput(), fuel: { ...tripInput().fuel, price: '-1' } }), ApiError);
});
test('fuel route network errors retain a safe retry message, not free-fuel plans', async () => {
  for (const status of [422, 503]) {
    const api = createListApi(operation => operation('fixture', new AbortController().signal), createApiClient({ baseUrl: () => 'http://fixture/api',
      fetch: async () => new Response('private provider detail', { status }) }));
    await assert.rejects(api.optimizeFuel(5, tripInput()), e => e instanceof ApiError && e.message.includes('Grocery only') && !e.message.includes('private'));
  }
});

test('real mobile HTTP client and Express preserve valid USD/LBP totals and reject malformed currencies without a database', async () => {
  const snapshot = fuelSnapshot([['1.00']]);
  const auth: AuthRepository = { authenticate: async () => ({ id: 7, displayName: 'Fixture', email: 'fixture@example.com' }),
    register: async () => { throw new Error(); }, findAccount: async () => null, createSession: async () => '', logout: async () => {} };
  const app = createApp(async () => {}, [], undefined, auth, undefined, { snapshot: async () => structuredClone(snapshot) }, undefined,
    fuelRouting(snapshot, () => 30000));
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const baseUrl = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const token = 'a'.repeat(64);
    const api = createListApi((operation, signal) => operation(token, signal ?? new AbortController().signal), createApiClient({ baseUrl }));
    for (const currency of ['USD', 'LBP'] as const) {
      const input = tripInput(); input.fuel = { consumption: '10', price: currency === 'USD' ? '1' : '90000', currency };
      const result = await api.optimizeFuel(5, input);
      assert.equal(result.plans[0].fuelUsd, '2.00'); assert.equal(result.plans[0].totalUsd, '3.00');
    }
    const bad = await fetch(`${baseUrl()}/shopping-lists/5/fuel-optimization`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...tripInput(), fuel: { ...tripInput().fuel, currency: ['USD'] } }),
    });
    assert.equal(bad.status, 400); assert.equal((await bad.json()).status, 'error');
    assert.equal((await api.optimize(5)).multiStore.solution!.totalUsd, '1.00');
  } finally {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  }
});
test('rapid fuel/route/branch changes and leaving fuel mode prevent stale success or failure, even if transport ignores abort', async () => {
  let latest: { key: string; data: string | null; status: string } | undefined;
  const resource = createResource<string>(state => { latest = state; }, () => false);
  const a = deferred<string>(), b = deferred<string>();
  resource.start('fuel:old-route:8:2', () => a.promise);
  resource.start('fuel:new-route:10:3', () => b.promise);
  a.resolve('old'); await a.promise; assert.equal(latest!.data, null); assert.equal(latest!.status, 'loading');
  b.resolve('new'); await b.promise; assert.equal(latest!.data, 'new');
  const pending = deferred<string>(); resource.start('fuel:retry', () => pending.promise); resource.cancel();
  pending.reject(new Error('late error')); await Promise.resolve(); await Promise.resolve();
  assert.equal(latest!.status, 'loading'); assert.equal(latest!.data, null);
});
test('device preferences store only valid fuel values, survive a new controller and serialize delayed saves', async () => {
  let saved: string | null = null;
  const storage = { get: async () => saved, set: async (value: string) => { saved = value; } };
  const preferences = createFuelPreferences(storage); await preferences.save(tripInput().fuel);
  assert.deepEqual(await createFuelPreferences(storage).load(), tripInput().fuel);
  assert.deepEqual(Object.keys(JSON.parse(saved!)).sort(), ['consumption', 'currency', 'price']);
  for (const bad of ['broken json', 'null', '{"consumption":"0","price":"1","currency":"USD"}']) { saved = bad; assert.equal(await preferences.load(), null); }
  await assert.rejects(preferences.save({ ...tripInput().fuel, consumption: '-1' }));
  const gate = deferred<void>(), writes: string[] = [];
  const queued = createFuelPreferences({ get: async () => null, set: async v => { if (!writes.length) await gate.promise; writes.push(v); } });
  const first = queued.save(tripInput().fuel), second = queued.save({ ...tripInput().fuel, price: '2' });
  gate.resolve(); await Promise.all([first, second]); assert.equal(JSON.parse(writes[1]).price, '2');
});
test('fuel navigation preserves origin, ordered intermediate stops and intended destination', async () => {
  const input: FuelRequest = tripInput(); input.journey.waypoints = [{ latitude: 34.01, longitude: 35.6 }];
  const result = readFuelResult(await response(input), 5, input);
  const url = new URL(fuelNavigation(result.plans[0].routePoints));
  assert.equal(url.searchParams.get('origin'), '34,35.6'); assert.equal(url.searchParams.get('destination'), '34.02,35.6');
  assert.ok(url.searchParams.get('waypoints')!.includes('34.01,35.6')); assert.throws(() => fuelNavigation([]));
});
