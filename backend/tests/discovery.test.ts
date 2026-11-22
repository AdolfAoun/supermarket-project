import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AuthRepository } from '../src/modules/auth/repository.js';
import type { CatalogRepository, Supermarket } from '../src/modules/catalog/repository.js';
import { detour, discoverSupermarkets, readJourneyRequest } from '../src/modules/journeys/discover.js';
import { RoutingError, type RoutingAdapter, type RoadRoute } from '../src/modules/journeys/routing.js';
import { routePoints } from './fixtures/routing.js';
const journey = () => readJourneyRequest({ origin: routePoints[0], destination: routePoints[1], maxDetourMinutes: 8 });
const catalog = (): Supermarket[] => [{ id: 1, name: 'Test chain', branches: [{ id: 1, name: 'Coastal', address: 'Fixture', latitude: 34.05, longitude: 35.625 },
  { id: 2, name: 'Mountain', address: 'Fixture', latitude: 34.06, longitude: 35.63 }] }];
const baseline: RoadRoute = { distanceMeters: 18000, durationSeconds: 1500, geometry: [[35.6, 34], [35.65, 34.1]] };

test('ten thousand registered locations retain exact corridor filtering and the provider request budget', async () => {
  const shops = catalog();
  shops[0].branches = Array.from({ length: 10000 }, (_, i) => ({ id: i + 1, name: `Large fixture ${i}`, address: 'Synthetic performance fixture',
    latitude: i < 30 ? 34.05 + i / 100000 : 33.3 + i / 1000000, longitude: i < 30 ? 35.625 : 36.5 }));
  const geometry: [number, number][] = Array.from({ length: 1000 }, (_, i) => [35.6 + i / 999 * 0.05, 34 + i / 999 * 0.1]);
  let calls = 0;
  const result = await discoverSupermarkets(journey(), shops, { route: async (_p, full) => { calls++; return full ? { ...baseline, geometry } : { ...baseline, geometry: null }; } });
  assert.equal(calls, 21); assert.equal(result.options.length, 20);
  assert.equal(result.exclusions.filter(e => e.reason === 'outside_corridor').length, 9970);
  assert.equal(result.exclusions.filter(e => e.reason === 'evaluation_limit').length, 10);
  assert.equal(result.evaluationComplete, false);
});
test('request validates numeric ranges, limits and original stop order; round trips remain explicit', () => {
  assert.equal(readJourneyRequest({ origin: routePoints[0], destination: routePoints[0] }).maxDetourMinutes, 30);
  assert.deepEqual(readJourneyRequest({ ...journey(), waypoints: routePoints }).waypoints, routePoints);
  for (const input of [{ ...journey(), origin: { latitude: 91, longitude: 35 } }, { ...journey(), destination: { latitude: '34', longitude: 35 } },
    { ...journey(), maxDetourMinutes: null }, { ...journey(), maxDetourMinutes: 31 }, { ...journey(), maxDetourMinutes: 2.5 },
    { ...journey(), userId: 1 }, { ...journey(), waypoints: Array(9).fill(routePoints[0]) },
    { ...journey(), destination: { latitude: 0, longitude: 0 } }]) assert.throws(() => readJourneyRequest(input));
});
test('complete-route detour uses raw seconds at zero, below, exactly and above threshold; mountain proximity does not determine eligibility', async () => {
  for (const seconds of [0, 479.9, 480, 520]) {
    const routing: RoutingAdapter = { route: async (_p, geometry) => geometry ? baseline
      : { distanceMeters: 20000, durationSeconds: 1500 + seconds, geometry: null } };
    const r = await discoverSupermarkets(journey(), catalog(), routing);
    assert.equal(r.options.length, seconds <= 480 ? 2 : 0);
    if (r.options[0]) assert.ok(Math.abs(r.options[0].additionalDurationSeconds - seconds) < 1e-7);
  }
  const routing: RoutingAdapter = { route: async (p, geometry) => geometry ? baseline
    : { distanceMeters: 24000, durationSeconds: p[1].latitude === 34.05 ? 1740 : 2400, geometry: null } };
  const r = await discoverSupermarkets(journey(), catalog(), routing);
  assert.deepEqual(r.options.map(o => o.branchId), [1]); assert.equal(r.options[0].additionalDistanceMeters, 6000);
  assert.ok(r.exclusions.some(e => e.branchId === 2 && e.reason === 'above_detour_limit'));
});
test('every insertion preserves original stops; shortest complete driving time wins with deterministic ties', async () => {
  const input = { ...journey(), waypoints: [{ latitude: 34.02, longitude: 35.61 }] };
  const orders: number[][] = [];
  const routing: RoutingAdapter = { route: async (p, geometry) => {
    if (geometry) return baseline;
    orders.push(p.map(v => v.latitude));
    return { distanceMeters: 20000, durationSeconds: p[1].latitude === 34.02 ? 1620 : 1740, geometry: null };
  } };
  const r = await discoverSupermarkets(input, catalog(), routing);
  assert.equal(orders.length, 4); assert.ok(orders.every(p => p[0] === 34 && p[p.length - 1] === 34.1 && p.includes(34.02)));
  assert.equal(r.options[0].insertionIndex, 1); assert.deepEqual(r.options.map(o => o.branchId), [1, 2]);
});
test('invalid/missing/outside/duplicate branches are excluded before route work; branch prices never gate geographic discovery', async () => {
  const supermarkets = catalog();
  supermarkets[0].branches.push({ ...supermarkets[0].branches[0], id: 3, name: 'Duplicate' },
    { id: 4, name: 'Missing', address: 'Fixture', latitude: null, longitude: null },
    { id: 5, name: 'Invalid', address: 'Fixture', latitude: NaN, longitude: 35 },
    { id: 6, name: 'Far', address: 'Fixture', latitude: 35, longitude: 36 });
  let calls = 0;
  const r = await discoverSupermarkets(journey(), supermarkets, { route: async (_p, geometry) => { calls++; return geometry ? baseline : { ...baseline, geometry: null }; } });
  assert.equal(calls, 3); assert.equal(r.options.length, 2);
  assert.deepEqual(new Set(r.exclusions.map(e => e.reason)), new Set(['duplicate_location', 'missing_coordinates', 'invalid_coordinates', 'outside_corridor']));
  assert.ok(r.options.every(o => !('totalUsd' in o)));
});
test('same-origin/destination routes, asymmetry, unreachable branches and safe snapping failures remain road-based', async () => {
  const input = { ...journey(), destination: journey().origin };
  const origin = routePoints[0]; const nearby = catalog(); nearby[0].branches = [{ ...nearby[0].branches[0], latitude: 34, longitude: 35.6 }];
  const zero = await discoverSupermarkets(input, nearby, { route: async (_p, geometry) => geometry
    ? { distanceMeters: 0, durationSeconds: 0, geometry: [[origin.longitude, origin.latitude], [origin.longitude, origin.latitude]] }
    : { distanceMeters: 0, durationSeconds: 0, geometry: null } });
  assert.equal(zero.options[0].additionalDurationSeconds, 0);
  for (const failure of ['no_route', 'snap_too_far', 'unavailable'] as const) {
    const r = await discoverSupermarkets(journey(), catalog(), { route: async (_p, geometry) => { if (geometry) return baseline; throw new RoutingError(failure); } });
    assert.equal(r.options.length, 0); assert.equal(r.evaluationComplete, failure !== 'unavailable');
  }
});
test('negative-time policy preserves raw rounding evidence, excludes materially inconsistent time and retains legitimate shorter/slower distances', () => {
  assert.equal(detour(baseline, { ...baseline, durationSeconds: 1499.5 })!.additionalDurationSeconds, 0);
  assert.equal(detour(baseline, { ...baseline, durationSeconds: 1499.5 })!.rawDurationDeltaSeconds, -0.5);
  assert.equal(detour(baseline, { ...baseline, durationSeconds: 1498 }), null);
  assert.equal(detour(baseline, { ...baseline, durationSeconds: NaN }), null);
  assert.equal(detour(baseline, { ...baseline, distanceMeters: 17000, durationSeconds: 1600 })!.additionalDistanceMeters, -1000);
});
test('provider-work limit and missing insertion estimates are disclosed rather than silently claiming exhaustive discovery', async () => {
  const supermarkets = catalog();
  supermarkets[0].branches = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Fixture ${i}`, address: 'Fixture', latitude: 34.05 + i / 100000, longitude: 35.625 }));
  const r = await discoverSupermarkets(journey(), supermarkets, { route: async (_p, geometry) => geometry ? baseline : { ...baseline, geometry: null } });
  assert.equal(r.options.length, 20); assert.equal(r.exclusions.filter(e => e.reason === 'evaluation_limit').length, 5); assert.equal(r.evaluationComplete, false);
  const inconsistent = await discoverSupermarkets(journey(), catalog(), { route: async (_p, geometry) => geometry ? baseline : { ...baseline, durationSeconds: 1, geometry: null } });
  assert.equal(inconsistent.options.length, 0); assert.equal(inconsistent.evaluationComplete, false);
});
const auth: AuthRepository = { register: async () => { throw new Error(); }, findAccount: async () => null, createSession: async () => '', logout: async () => {},
  authenticate: async () => ({ id: 1, displayName: 'Fixture', email: 'fixture@example.com' }) };
const token = 'a'.repeat(64), url = '/api/journeys/supermarkets';
const repository: CatalogRepository = { listProducts: async () => [], findProduct: async () => null, listPrices: async () => [], listSupermarkets: async () => catalog() };
const routing: RoutingAdapter = { route: async (_p, geometry) => geometry ? baseline : { ...baseline, geometry: null } };

test('mixed insertion failures retain all classifications regardless of order', async () => {
  const input = { ...journey(), waypoints: [routePoints[0]] };
  for (const reasons of [['unavailable', 'no_route'], ['no_route', 'unavailable'], ['timeout', 'snap_too_far'], ['no_route', 'snap_too_far']] as const) {
    let call = 0;
    const result = await discoverSupermarkets(input, [{ ...catalog()[0], branches: [catalog()[0].branches[0]] }], {
      route: async (_p, geometry) => { if (geometry) return baseline; throw new RoutingError(reasons[call++]); },
    });
    assert.equal(call, 2);
    assert.deepEqual(new Set(result.exclusions.map(e => e.reason)), new Set(reasons.map(r => r === 'timeout' || r === 'unavailable' ? 'routing_unavailable' : r)));
    assert.equal(result.evaluationComplete, reasons.every(r => r === 'no_route' || r === 'snap_too_far'));
  }
});

test('partial insertions preserve usable options and disclose provider failures and inconsistent estimates', async () => {
  const input = { ...journey(), waypoints: [routePoints[0], routePoints[1]] };
  let call = 0;
  const result = await discoverSupermarkets(input, [{ ...catalog()[0], branches: [catalog()[0].branches[0]] }], {
    route: async (_p, geometry) => {
      if (geometry) return baseline;
      if (++call === 1) return { ...baseline, durationSeconds: 1600, geometry: null };
      if (call === 2) throw new RoutingError('unavailable');
      return { ...baseline, durationSeconds: 10, geometry: null };
    },
  });
  assert.equal(result.options.length, 1); assert.equal(result.options[0].additionalDurationSeconds, 100);
  assert.deepEqual(new Set(result.exclusions.map(e => e.reason)), new Set(['routing_unavailable', 'inconsistent_route']));
  assert.equal(result.evaluationComplete, false);
});

test('server deadline returns previous successes, marks pending branches, and makes no further route calls', async () => {
  for (const completed of [0, 1, 2]) {
    const controller = new AbortController(); let calls = 0;
    const result = await discoverSupermarkets({ ...journey(), waypoints: [routePoints[0]] }, catalog(), {
      route: async (_p, geometry) => {
        if (geometry) { if (!completed) controller.abort(new RoutingError('timeout')); return baseline; }
        calls++;
        if (calls === completed) controller.abort(new RoutingError('timeout'));
        return { ...baseline, durationSeconds: 1600, geometry: null };
      },
    }, controller.signal);
    assert.equal(calls, completed); assert.equal(result.evaluationComplete, false);
    assert.equal(result.options.length, completed ? 1 : 0);
    for (const branch of catalog()[0].branches.filter(b => !result.options.some(o => o.branchId === b.id))) {
      assert.ok(result.exclusions.some(e => e.branchId === branch.id && e.reason === 'routing_unavailable'));
    }
  }
  const controller = new AbortController();
  const partial = await discoverSupermarkets(journey(), catalog(), { route: async (_p, geometry) => {
    if (geometry) return baseline;
    controller.abort(new RoutingError('timeout')); throw new RoutingError('cancelled');
  } }, controller.signal);
  assert.equal(partial.evaluationComplete, false); assert.equal(partial.options.length, 0);
});

test('client cancellation and baseline failure do not masquerade as usable partial results', async () => {
  const controller = new AbortController();
  await assert.rejects(discoverSupermarkets(journey(), catalog(), { route: async (_p, geometry) => {
    if (geometry) { controller.abort(); return baseline; }
    throw new Error('must not call');
  } }, controller.signal), error => error instanceof RoutingError && error.reason === 'cancelled');
  await assert.rejects(discoverSupermarkets(journey(), catalog(), { route: async () => { throw new RoutingError('timeout'); } }),
    error => error instanceof RoutingError && error.reason === 'timeout');
});
test('HTTP discovery requires existing auth, validates before SQL/routing and preserves no-store/private contracts', async () => {
  const app = createApp(async () => {}, [], repository, auth, undefined, undefined, undefined, routing);
  await request(app).post(url).send(journey()).expect(401);
  for (const input of [{}, { ...journey(), total: 0 }, { ...journey(), maxDetourMinutes: -1 }]) await request(app).post(url).set('Authorization', `Bearer ${token}`).send(input).expect(400);
  await request(app).post(url + '?x=1').set('Authorization', `Bearer ${token}`).send(journey()).expect(400);
  const r = await request(app).post(url).set('Authorization', `Bearer ${token}`).send(journey()).expect(200);
  assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(r.body.estimated, true); assert.equal(r.body.liveTraffic, false);
  assert.equal(r.body.options.length, 2); assert.equal(r.body.journey.maxDetourMinutes, 8);
});
test('HTTP unavailable/no-route/errors are explicit and sanitized; no routing runs before catalog retrieval finishes', async () => {
  let retrieved = false;
  for (const failure of ['no_route', 'unavailable'] as const) {
    const app = createApp(async () => {}, [], { ...repository, listSupermarkets: async () => { retrieved = true; return catalog(); } }, auth, undefined, undefined, undefined,
      { route: async () => { assert.equal(retrieved, true); throw new RoutingError(failure); } });
    await request(app).post(url).set('Authorization', `Bearer ${token}`).send(journey()).expect(failure === 'no_route' ? 422 : 503);
  }
  const app = createApp(async () => {}, [], { ...repository, listSupermarkets: async () => { throw new Error('private DB detail'); } }, auth, undefined, undefined, undefined, routing);
  const r = await request(app).post(url).set('Authorization', `Bearer ${token}`).send(journey()).expect(500);
  assert.equal(r.body.message, 'Internal server error');
});
