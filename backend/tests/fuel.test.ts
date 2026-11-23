import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { combinedCost, compareFractions, displayFraction, fuelCost, readFuelSettings } from '../src/modules/basket/fuel.js';
import { optimizeTrip, readTripRequest, stopOrders } from '../src/modules/basket/trip.js';
import { RoutingError } from '../src/modules/journeys/routing.js';
import { fuelRouting, fuelSnapshot, tripInput } from './fixtures/fuel.js';
import type { AuthRepository } from '../src/modules/auth/repository.js';
import { HttpError } from '../src/middleware/errors.js';

const now = new Date('2026-11-22T12:00:00Z');
test('fuel formula: 20 km × 10 L/100 km × $1/L = $2; LBP, decimals and large prices remain exact', () => {
  const input = tripInput();
  const usd = fuelCost(30000, 10000, false, input.fuel);
  assert.equal(displayFraction(usd.liters, 6), '2.000000'); assert.equal(displayFraction(usd.cost), '2.00');
  assert.equal(displayFraction(fuelCost(30000, 10000, false, { ...input.fuel, price: '90000', currency: 'LBP' }).cost), '2.00');
  assert.equal(displayFraction(fuelCost(20000, 10000, true, input.fuel).cost), '2.00');
  assert.equal(displayFraction(fuelCost(9000, 10000, false, input.fuel).cost), '0.00');
  assert.equal(displayFraction(fuelCost(0, 0, true, input.fuel).cost), '0.00');
  assert.equal(displayFraction(fuelCost(2500.25, 0, true, { consumption: '8.25', price: '1.37', currency: 'USD' }).cost), '0.28');
  assert.equal(displayFraction(fuelCost(100000, 0, true, { consumption: '100', price: '9999999999.99', currency: 'USD' }).cost), '999999999999.00');
  assert.ok(compareFractions(fuelCost(1e-7, 0, true, input.fuel).cost, { numerator: 0n, denominator: 1n }) > 0);
  assert.equal(displayFraction(combinedCost('9000000', usd.cost)), '3.00');
});
test('fuel validation rejects missing, nonnumeric, negative, overlarge and nonfinite inputs; zero price is explicit', () => {
  for (const consumption of [undefined, 0, '0', '-1', '101', '1.234', 'NaN', Infinity, '1e1', '', ' 8']) {
    assert.throws(() => readFuelSettings({ ...tripInput().fuel, consumption }));
  }
  for (const price of [undefined, 1, '-1', '1.234', '10000000000', 'NaN', 'Infinity', '']) assert.throws(() => readFuelSettings({ ...tripInput().fuel, price }));
  for (const currency of [undefined, 'EUR', 'usd']) assert.throws(() => readFuelSettings({ ...tripInput().fuel, currency }));
  assert.equal(displayFraction(fuelCost(10000, 0, true, { ...tripInput().fuel, price: '0.00' }).cost), '0.00');
  for (const distance of [NaN, Infinity, -1, 5000001]) assert.throws(() => fuelCost(distance, 0, false, tripInput().fuel));
});

const scenarios: { name: string; matrix: (string | null)[][]; distances: Record<string, number>; winner: number[]; total: string }[] = [
  { name: 'A: cheapest groceries also win overall', matrix: [['1.00', '1.00'], ['2.00', '2.00']], distances: { '1': 20000, '2': 20000 }, winner: [1], total: '3.00' },
  { name: 'B: nearby $44 basket plus $3 fuel beats $40 basket plus $10 fuel', matrix: [['40.00'], ['44.00']], distances: { '1': 110000, '2': 40000 }, winner: [2], total: '47.00' },
  { name: 'C: fuel erases split savings', matrix: [['1.00', '5.00'], ['5.00', '1.00']], distances: { '1': 10000, '2': 10000, '1,2': 110000, '2,1': 110000 }, winner: [1], total: '6.00' },
  { name: 'D: two stores remain cheaper after fuel', matrix: [['1.00', '5.00'], ['5.00', '1.00']], distances: { '1': 20000, '2': 20000, '1,2': 30000, '2,1': 40000 }, winner: [1, 2], total: '4.00' },
  { name: 'E: three stores win, including all quantities and fuel once', matrix: [['1.00', '9.00', '9.00'], ['9.00', '1.00', '9.00'], ['9.00', '9.00', '1.00']], distances: {}, winner: [1, 2, 3], total: '4.00' },
  { name: 'F: partial stores combine but never qualify as complete singles', matrix: [['1.00', null], [null, '2.00']], distances: {}, winner: [1, 2], total: '4.00' },
  { name: 'G: exact ties use fewer stores then lower branch ID', matrix: [['1.00'], ['1.00']], distances: {}, winner: [1], total: '2.00' },
];
for (const scenario of scenarios) test(scenario.name, async () => {
  const snapshot = fuelSnapshot(scenario.matrix);
  const result = await optimizeTrip(snapshot, tripInput(), fuelRouting(snapshot, ids => scenario.distances[ids.join(',')] ?? 20000), undefined, now);
  assert.deepEqual(result.plans[0].grocery.branchIds, scenario.winner); assert.equal(result.plans[0].totalUsd, scenario.total);
  assert.ok(result.plans.every(p => p.grocery.allocations.flatMap(b => b.items).length === scenario.matrix[0].length));
  if (scenario.name.startsWith('F')) assert.ok(result.plans.every(p => p.grocery.branchIds.length === 2));
});
test('H/K/L: explicit free fuel, quantity 999 and mixed USD/LBP preserve exact ranks below display cents', async () => {
  const snapshot = fuelSnapshot([['1.00'], ['89999.99']], [999]); snapshot.prices[1].originalCurrency = 'LBP';
  const input = tripInput(); input.fuel.price = '0';
  const result = await optimizeTrip(snapshot, input, fuelRouting(snapshot), undefined, now);
  assert.deepEqual(result.plans[0].grocery.branchIds, [2]); assert.equal(result.plans[0].fuelUsd, '0.00');
  assert.equal(result.plans[0].totalUsd, '999.00');
  assert.equal(result.plans[0].grocery.totalUsdUnits, (8999999n * 999n).toString());
});
test('I/J: missing routes and invalid/missing coordinates never become free fuel', async () => {
  const snapshot = fuelSnapshot([['1.00'], ['2.00'], ['3.00']]);
  snapshot.locations![0].latitude = null; snapshot.locations![1].latitude = 91;
  const routing = fuelRouting(snapshot);
  const result = await optimizeTrip(snapshot, tripInput(), { route: async (p, geometry) => {
    if (!geometry) throw new RoutingError('unavailable'); return routing.route(p, geometry);
  } }, undefined, now);
  assert.equal(result.status, 'unavailable'); assert.deepEqual(result.plans, []); assert.equal(result.evaluationComplete, false);
  assert.deepEqual(result.excludedBranches.map(b => b.reason), ['missing_coordinates', 'invalid_coordinates']);
  await assert.rejects(optimizeTrip(snapshot, tripInput(), { route: async () => { throw new RoutingError('timeout'); } }));
});
test('dedicated journeys charge full distance even with original stops; ordinary shorter routes clamp incremental fuel to zero', async () => {
  const snapshot = fuelSnapshot([['1.00']]), input = tripInput(); input.journey.destination = input.journey.origin;
  input.journey.waypoints = [{ latitude: 34.01, longitude: 35.6 }];
  const result = await optimizeTrip(snapshot, input, fuelRouting(snapshot), undefined, now);
  assert.equal(result.distancePolicy, 'full_shopping_route'); assert.equal(result.plans[0].fuelUsd, '2.00');
  assert.equal(result.plans[0].routePoints.at(-1)!.latitude, input.journey.origin.latitude);
  const shorter = await optimizeTrip(snapshot, tripInput(), fuelRouting(snapshot, () => 9000), undefined, now);
  assert.equal(shorter.plans[0].chargedDistanceMeters, 0); assert.equal(shorter.plans[0].fuelUsd, '0.00');
});
test('route order is evaluated in both directions and original stops retain relative order', async () => {
  const snapshot = fuelSnapshot([['1.00', null], [null, '1.00']]);
  const result = await optimizeTrip(snapshot, tripInput(), fuelRouting(snapshot, order => order[0] === 2 ? 11000 : 31000), undefined, now);
  assert.deepEqual(result.plans[0].visitOrder, [2, 1]); assert.equal(result.plans[0].totalUsd, '2.10');
  const a = { latitude: 1, longitude: 1 }, b = { latitude: 2, longitude: 2 };
  const orders = [...stopOrders([a, b], [{ branchId: 1, latitude: 3, longitude: 3 }, { branchId: 2, latitude: 4, longitude: 4 }])];
  assert.equal(orders.length, 12); assert.ok(orders.every(o => o.indexOf(a) < o.indexOf(b)));
});
test('bounded selection and 24-call budget disclose incomplete results without dropping an original stop', async () => {
  const snapshot = fuelSnapshot([['1.00'], ['2.00'], ['3.00'], ['4.00']]), input = tripInput();
  input.journey.waypoints = [{ latitude: 34.01, longitude: 35.6 }, { latitude: 34.012, longitude: 35.6 }];
  const result = await optimizeTrip(snapshot, input, fuelRouting(snapshot), undefined, now);
  assert.ok(result.routeEvaluations <= 24); assert.equal(result.evaluationComplete, false);
  assert.ok(result.excludedBranches.some(b => b.reason === 'candidate_limit'));
  assert.ok(result.plans.every(p => p.routePoints.some(point => point.latitude === 34.01)));
});
test('maximum stores, detour threshold, malformed routes, canceled callers and deadlines are enforced', async () => {
  const snapshot = fuelSnapshot([['1.00', null], [null, '1.00']]), input = tripInput();
  input.maxStores = 1; assert.equal((await optimizeTrip(snapshot, input, fuelRouting(snapshot), undefined, now)).status, 'unavailable');
  input.maxStores = 2; input.journey.maxDetourMinutes = 0;
  assert.equal((await optimizeTrip(snapshot, input, fuelRouting(snapshot), undefined, now)).plans.length, 0);
  const routing = fuelRouting(snapshot);
  const bad = await optimizeTrip(snapshot, tripInput(), { route: async (p, g) => g ? routing.route(p, g) : { distanceMeters: NaN, durationSeconds: 200, geometry: null } }, undefined, now);
  assert.equal(bad.plans.length, 0); assert.equal(bad.evaluationComplete, false);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(optimizeTrip(snapshot, tripInput(), { route: async (p, g) => { if (abort.signal.aborted) throw new RoutingError('cancelled'); return routing.route(p, g); } }, abort.signal));
  for (const maxStores of [0, 4, '2']) assert.throws(() => readTripRequest({ ...tripInput(), maxStores }));
});

test('exact sub-cent fuel ranks, partial deadlines, duplicate locations and provider stop limits remain honest', async () => {
  const snapshot = fuelSnapshot([['1.00'], ['1.00']]);
  const exact = await optimizeTrip(snapshot, tripInput(), fuelRouting(snapshot, ids => ids[0] === 1 ? 10000.02 : 10000.01), undefined, now);
  assert.equal(exact.plans[0].totalUsd, '1.00'); assert.deepEqual(exact.plans[0].grocery.branchIds, [2]);
  const deadline = new AbortController(), routing = fuelRouting(snapshot); let calls = 0;
  const partial = await optimizeTrip(snapshot, tripInput(), { route: async (p, g) => {
    if (!g && ++calls === 2) { deadline.abort(new RoutingError('timeout')); throw new RoutingError('cancelled'); }
    return routing.route(p, g);
  } }, deadline.signal, now);
  assert.equal(partial.plans.length, 1); assert.equal(partial.evaluationComplete, false);
  snapshot.locations![1] = { ...snapshot.locations![0], branchId: 2 };
  const duplicate = await optimizeTrip(snapshot, tripInput(), routing, undefined, now);
  assert.ok(duplicate.excludedBranches.some(b => b.reason === 'duplicate_location')); assert.equal(duplicate.evaluationComplete, false);
  const requiredThree = fuelSnapshot([['1.00', null, null], [null, '1.00', null], [null, null, '1.00']]);
  const input = tripInput(); input.journey.waypoints = Array.from({ length: 8 }, (_, i) => ({ latitude: 34.001 + i * 0.001, longitude: 35.6 }));
  const limited = await optimizeTrip(requiredThree, input, fuelRouting(requiredThree), undefined, now);
  assert.equal(limited.plans.length, 0); assert.equal(limited.routeEvaluations, 0); assert.equal(limited.routeFailures[0].reason, 'stop_limit');
});

const auth: AuthRepository = { authenticate: async () => ({ id: 7, displayName: 'Fixture', email: 'fixture@example.com' }),
  register: async () => { throw new Error(); }, findAccount: async () => null, createSession: async () => '', logout: async () => {} };
test('fuel API strictly rejects malformed currency types with HTTP 400 before database or routing work, including free-fuel input', async () => {
  let reads = 0, routes = 0;
  const app = createApp(async () => {}, [], undefined, auth, undefined,
    { snapshot: async () => { reads++; throw new Error('Invalid currency must not reach SQL'); } }, undefined,
    { route: async () => { routes++; throw new Error('Invalid currency must not reach routing'); } });
  const malformed: unknown[] = [['USD'], ['LBP'], [], ['USD', 'LBP'], {}, { currency: 'USD' }, { toString: 'USD' },
    0, 1, 90000, null, true, false, '', 'EUR', 'usd', 'lbp', ' USD', 'LBP ', undefined];
  for (const currency of malformed) for (const price of ['1', '0']) {
    const input = { ...tripInput(), fuel: { ...tripInput().fuel, currency, price } };
    const response = await request(app).post('/api/shopping-lists/5/fuel-optimization')
      .set('Authorization', 'Bearer ' + 'a'.repeat(64)).send(input).expect(400);
    assert.equal(response.body.status, 'error');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  assert.equal(reads, 0); assert.equal(routes, 0);
  assert.throws(() => readFuelSettings({ ...tripInput().fuel, currency: new String('USD') }),
    e => e instanceof HttpError && e.status === 400, 'Boxed strings are not primitive currency strings');
});

test('fuel API accepts primitive USD and LBP currencies with equivalent exact fuel and combined costs', async () => {
  const snapshot = fuelSnapshot([['1.00']]);
  const app = createApp(async () => {}, [], undefined, auth, undefined, { snapshot: async () => snapshot }, undefined,
    fuelRouting(snapshot, () => 30000));
  const results = [];
  for (const fuel of [{ consumption: '10', price: '1', currency: 'USD' }, { consumption: '10', price: '90000', currency: 'LBP' }]) {
    const response = await request(app).post('/api/shopping-lists/5/fuel-optimization')
      .set('Authorization', 'Bearer ' + 'a'.repeat(64)).send({ ...tripInput(), fuel }).expect(200);
    assert.equal(response.body.fuel.currency, fuel.currency);
    const plan = response.body.plans[0];
    assert.equal(plan.chargedDistanceMeters, 20000); assert.equal(plan.fuelLiters, '2.000000');
    assert.equal(plan.fuelUsd, '2.00'); assert.equal(plan.grocery.totalUsd, '1.00'); assert.equal(plan.totalUsd, '3.00');
    results.push(plan);
  }
  assert.deepEqual(results[0], results[1]);
});

test('fuel API enforces auth, ownership, input boundaries and no-store, and preserves price-only behavior', async () => {
  const snapshot = fuelSnapshot([['1.00']]); let reads = 0;
  const app = createApp(async () => {}, [], undefined, auth, undefined, { snapshot: async (user, id) => {
    reads++; assert.equal(user, 7); if (id !== 5) throw new HttpError(404, 'Shopping list or item not found'); return snapshot;
  } }, undefined, fuelRouting(snapshot));
  const url = '/api/shopping-lists/5/fuel-optimization', token = 'Bearer ' + 'a'.repeat(64);
  await request(app).post(url).send(tripInput()).expect(401); assert.equal(reads, 0);
  for (const input of [{}, { ...tripInput(), totalUsd: '0' }, { ...tripInput(), fuel: { ...tripInput().fuel, consumption: '0' } }]) {
    await request(app).post(url).set('Authorization', token).send(input).expect(400);
  }
  assert.equal(reads, 0);
  await request(app).post(url + '?owner=7').set('Authorization', token).send(tripInput()).expect(400);
  await request(app).post('/api/shopping-lists/6/fuel-optimization').set('Authorization', token).send(tripInput()).expect(404);
  const result = await request(app).post(url).set('Authorization', token).send(tripInput()).expect(200);
  assert.equal(result.headers['cache-control'], 'no-store'); assert.equal(result.body.plans[0].totalUsd, '2.00');
  const grocery = await request(app).get('/api/shopping-lists/5/optimization').set('Authorization', token).expect(200);
  assert.equal(grocery.body.fuelCostsIncluded, false); assert.equal(grocery.body.multiStore.solution.totalUsd, '1.00');
});
