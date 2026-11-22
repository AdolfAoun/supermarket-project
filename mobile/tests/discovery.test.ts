import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../../backend/src/app';
import { discoverSupermarkets, readJourneyRequest } from '../../backend/src/modules/journeys/discover';
import type { AuthRepository } from '../../backend/src/modules/auth/repository';
import type { CatalogRepository } from '../../backend/src/modules/catalog/repository';
import type { RoutingAdapter } from '../../backend/src/modules/journeys/routing';
import { optimizeBasket } from '../../backend/src/modules/basket/optimize';
import { ApiError, createApiClient } from '../services/api';
import { createListApi } from '../services/account-api';
import { createResource, type ResourceState } from '../services/resource';
import { readOptimization } from '../services/optimization-contracts';
import { applyJourneyImport, emptyJourney, readJourneyImport } from '../services/journey';
import { parseGoogleMaps, mapsUrl } from '../../backend/src/modules/locations/google-maps';
import { branchBasket, DEFAULT_DETOUR_MINUTES, discoveryRequest, driveTime, filterDetours, navigationUrl, readDiscovery } from '../services/discovery';
import { listItem, stamp, summary, token } from './private-fixtures';
const input = { origin: { latitude: 34, longitude: 35.6 }, destination: { latitude: 34.1, longitude: 35.65 }, waypoints: [], maxDetourMinutes: 30 };
const repository: CatalogRepository = { listProducts: async () => [], findProduct: async () => null, listPrices: async () => [],
  listSupermarkets: async () => [{ id: 1, name: 'Demo', branches: [1, 2, 3].map(id => ({ id, name: `Branch ${id}`, address: 'Synthetic test location', latitude: 34.05 + id / 100000, longitude: 35.625 })) }] };
const routing: RoutingAdapter = { route: async (points, geometry) => geometry
  ? { distanceMeters: 18000, durationSeconds: 1500, geometry: [[35.6, 34], [35.65, 34.1]] }
  : { distanceMeters: 20000, durationSeconds: 1500 + (points[1].latitude < 34.050015 ? 240 : points[1].latitude < 34.050025 ? 480 : 520), geometry: null } };
async function fixture() { return discoverSupermarkets(readJourneyRequest(input), await repository.listSupermarkets(), routing); }
test('discovery contract reconciles complete journeys and rejects wrong identity, estimates, ordering, thresholds and navigation data', async () => {
  const r = await fixture(); assert.equal(readDiscovery(r, input).options.length, 3);
  for (const change of [
    (r: any) => { r.journey.origin.latitude = 1; }, (r: any) => { r.baseline.durationSeconds = 0; },
    (r: any) => { r.options[0].additionalDurationSeconds = -1; }, (r: any) => { r.options[0].additionalDistanceMeters = 1; },
    (r: any) => { r.options[0].latitude = 91; }, (r: any) => { r.options[0].insertionIndex = 1; },
    (r: any) => { r.options.reverse(); }, (r: any) => { r.options.push(r.options[0]); },
    (r: any) => { r.liveTraffic = true; }, (r: any) => { r.estimated = false; },
    (r: any) => { r.attribution.url = 'https://evil.example'; }, (r: any) => { r.exclusions = [{ branchId: 1, reason: 'invented' }]; },
  ]) { const bad = structuredClone(r); change(bad); assert.throws(() => readDiscovery(bad, input)); }
});
test('mixed failures can accompany successful options; incomplete work cannot claim completeness and coordinate key order is irrelevant', async () => {
  const r = await fixture();
  r.exclusions.push({ branchId: 1, reason: 'routing_unavailable' }, { branchId: 1, reason: 'no_route' });
  r.evaluationComplete = false;
  assert.equal(readDiscovery(r, input).options.length, r.options.length);
  assert.equal(readDiscovery(r, { ...input, origin: { longitude: input.origin.longitude, latitude: input.origin.latitude } }).evaluationComplete, false);
  r.evaluationComplete = true;
  assert.throws(() => readDiscovery(r, input));
});

test('slider defaults to eight, filters 0–30 locally with unrounded total detours, and never mutates the source result', async () => {
  const r = readDiscovery(await fixture(), input), source = structuredClone(r);
  assert.equal(DEFAULT_DETOUR_MINUTES, 8); assert.equal(filterDetours(r, 0).length, 0);
  assert.deepEqual(filterDetours(r, 8).map(o => o.branchId), [1, 2]); assert.equal(filterDetours(r, 9).length, 3);
  assert.equal(filterDetours(r, 30).length, 3); assert.equal(driveTime(520), '8 min 40 sec'); assert.equal(driveTime(0), '0 min');
  assert.throws(() => filterDetours(r, 31)); assert.throws(() => filterDetours(r, 8.5)); assert.deepEqual(r, source);
});
test('navigation preserves endpoints and original ordered stops, inserts supermarket once, and supports return-to-origin', async () => {
  const r = readDiscovery(await fixture(), input), option = r.options[0];
  const u = new URL(navigationUrl(input, option));
  assert.equal(u.origin, 'https://www.google.com'); assert.equal(u.searchParams.get('api'), '1');
  assert.equal(u.searchParams.get('origin'), '34,35.6'); assert.equal(u.searchParams.get('destination'), '34.1,35.65');
  assert.equal(u.searchParams.get('waypoints'), `${option.latitude},${option.longitude}`); assert.equal(u.searchParams.get('travelmode'), 'driving');
  const originalStop = { latitude: 34.02, longitude: 35.61 };
  const multi = new URL(navigationUrl({ ...input, waypoints: [originalStop] }, { ...option, insertionIndex: 1 }));
  assert.equal(multi.searchParams.get('waypoints'), `34.02,35.61|${option.latitude},${option.longitude}`);
  const round = new URL(navigationUrl({ ...input, destination: input.origin }, option));
  assert.equal(round.searchParams.get('destination'), round.searchParams.get('origin'));
  assert.equal(new URL(navigationUrl({ ...input, waypoints: [option] }, option)).searchParams.get('waypoints')!.split('|').length, 1);
  assert.throws(() => navigationUrl(input, { ...option, latitude: NaN }));
});
test('basket display joins existing authorized exact-price results by branch identity; missing and partial data never become prices', async () => {
  const options = (await fixture()).options;
  const snapshot = { shoppingList: { ...summary, items: [listItem, { ...listItem, id: 10, productId: 2, product: { ...listItem.product, id: 2, name: 'Bread' } }] },
    branches: options.map(o => ({ branchId: o.branchId, branch: o.branch, supermarketId: o.supermarketId, supermarket: o.supermarket })),
    prices: [{ branchId: 1, productId: 1, originalPrice: '1.00', originalCurrency: 'USD', observedAt: stamp },
      { branchId: 1, productId: 2, originalPrice: '2.00', originalCurrency: 'USD', observedAt: stamp },
      { branchId: 2, productId: 1, originalPrice: '1.00', originalCurrency: 'USD', observedAt: stamp }] };
  const pricing = readOptimization(optimizeBasket(snapshot, 2, new Date('2026-11-21T12:00:00Z')), summary.id, 2);
  assert.deepEqual(branchBasket(options[0], pricing), { status: 'complete', totalUsd: '6.00', oldestObservedAt: stamp, olderPrices: 2, futurePrices: 0 });
  assert.deepEqual(branchBasket(options[1], pricing), { status: 'partial', covered: 1, required: 2 });
  assert.deepEqual(branchBasket(options[2], pricing), { status: 'unavailable' });
  assert.deepEqual(branchBasket(options[0], null), { status: 'not_loaded' });
  assert.equal(branchBasket({ ...options[0], supermarket: 'Different identity' }, pricing).status, 'unavailable');
});
test('request preparation accepts only complete driving drafts; partial/unknown/unassigned location imports cannot route', () => {
  const imported = readJourneyImport(parseGoogleMaps(mapsUrl('https://www.google.com/maps/dir/?api=1&origin=34,35.6&destination=34.1,35.65&travelmode=driving')));
  const draft = applyJourneyImport(emptyJourney(), imported); assert.deepEqual(discoveryRequest(draft), input);
  assert.throws(() => discoveryRequest({ ...draft, origin: null })); assert.throws(() => discoveryRequest({ ...draft, travelMode: 'unknown' }));
  assert.throws(() => discoveryRequest({ ...draft, place: draft.destination }));
});
test('private client posts locations in the body, keeps bearer/abort handling and uses a routing-specific deadline', async () => {
  let scheduled = 0, calls = 0;
  const data = await fixture();
  const client = createApiClient({ baseUrl: () => 'https://api.example/api', schedule: (_fn, ms) => { scheduled = ms; return () => {}; },
    fetch: async (url, options) => { calls++; assert.equal(String(url), 'https://api.example/api/journeys/supermarkets');
      assert.equal(options!.method, 'POST'); assert.deepEqual(JSON.parse(options!.body as string), input);
      assert.equal((options!.headers as Record<string, string>).Authorization, `Bearer ${token}`); return Response.json(data); } });
  const lists = createListApi(fn => fn(token, new AbortController().signal), client);
  const result = await lists.discoverSupermarkets(input); assert.equal(scheduled, 70000);
  for (let n = 0; n <= 30; n++) filterDetours(result, n);
  assert.equal(calls, 1, 'Slider filtering must not trigger requests');
});
test('road-service failure is independent of grocery-only calls and does not masquerade as a database outage', async () => {
  const api = createListApi(fn => fn(token, new AbortController().signal), createApiClient({ baseUrl: () => 'https://api.example/api',
    fetch: async () => new Response('{}', { status: 503 }) }));
  await assert.rejects(api.discoverSupermarkets(input), e => e instanceof ApiError && e.message.includes('Road estimates') && !e.message.includes('database'));
});
test('resource cancellation suppresses stale route responses from prior journey/account/list identity', async () => {
  const states: ResourceState<string>[] = []; const resource = createResource<string>(s => states.push(s), () => false);
  let finish!: (value: string) => void;
  resource.start('journey:old', () => new Promise(resolve => { finish = resolve; }));
  resource.start('journey:new', async () => 'current journey'); await new Promise(resolve => setImmediate(resolve));
  finish('old journey'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1)!.data, 'current journey'); resource.cancel();
});
test('real local HTTP mobile-to-discovery contract with injected routing returns useful branches independently of prices', async () => {
  const auth: AuthRepository = { register: async () => { throw new Error(); }, findAccount: async () => null, createSession: async () => '', logout: async () => {},
    authenticate: async () => ({ id: 1, displayName: 'Test', email: 'test@example.com' }) };
  const server = createApp(async () => {}, [], repository, auth, undefined, undefined, undefined, routing).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const api = createListApi(fn => fn(token, new AbortController().signal), createApiClient({ baseUrl: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api` }));
    const r = await api.discoverSupermarkets(input); assert.equal(r.options.length, 3); assert.equal(filterDetours(r, 8).length, 2);
    assert.equal(r.liveTraffic, false);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
