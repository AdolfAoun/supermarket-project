import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOsrmAdapter, readRoadRoute, RoutingError, routingUrl } from '../src/modules/journeys/routing.js';
import { distanceMeters, distanceToRouteMeters, routeEnvelope, type Position } from '../src/modules/shared/geo.js';
import { osrmResponse, routePoints } from './fixtures/routing.js';

test('conservative route envelope keeps corridor points, sparse curved arcs, repeated vertices and wrapped longitudes', () => {
  const dense: Position[] = Array.from({ length: 100 }, (_, i) => [35.6, 34 + i / 1000]);
  const contains = routeEnvelope(dense, 3000);
  assert.equal(contains({ latitude: 34.05, longitude: 35.61 }), true);
  assert.equal(contains({ latitude: 33.2, longitude: 35.6 }), false);
  assert.equal(contains({ latitude: 34.05, longitude: 36.5 }), false);
  assert.equal(routeEnvelope([[179.999, 34], [179.999, 34]], 3000)({ latitude: 34, longitude: -179.999 }), true);
  const sparse: Position[] = [[-30, 70], [30, 70]];
  assert.equal(routeEnvelope(sparse, 3000)({ latitude: 72.5, longitude: 0 }), true);
});

test('OSRM response preserves meter/second units, full geometry and waypoint order', () => {
  const r = readRoadRoute(osrmResponse(), routePoints, true);
  assert.equal(r.distanceMeters, 18000); assert.equal(r.durationSeconds, 1500); assert.equal(r.geometry!.length, 2);
  const zero = readRoadRoute(osrmResponse([routePoints[0], routePoints[0]], 0, 0), [routePoints[0], routePoints[0]], true);
  assert.equal(zero.durationSeconds, 0);
});
test('invalid responses, metrics, geometry, leg reconciliation, unexpected or reversed coordinates fail closed', () => {
  for (const change of [
    (r: any) => { r.code = 'Unknown'; }, (r: any) => { r.routes = []; }, (r: any) => { r.routes[0].duration = NaN; },
    (r: any) => { r.routes[0].distance = -1; }, (r: any) => { r.routes[0].legs = []; },
    (r: any) => { r.routes[0].legs[0].duration = 1; }, (r: any) => { r.routes[0].geometry.type = 'Polygon'; },
    (r: any) => { r.routes[0].geometry.coordinates = [[35, 34]]; }, (r: any) => { r.waypoints[0].location = [34, 35.6]; },
    (r: any) => { r.routes[0].geometry.coordinates[0] = [100, 70]; }, (r: any) => { r.waypoints.pop(); },
    (r: any) => { r.waypoints[0].location = [181, 34]; }, (r: any) => { r.waypoints[0].distance = 251; },
  ]) { const r = structuredClone(osrmResponse()); change(r); assert.throws(() => readRoadRoute(r, routePoints, true), RoutingError); }
  for (const code of ['NoRoute', 'NoSegment']) assert.throws(() => readRoadRoute({ code }, routePoints, false), e => e instanceof RoutingError && e.reason === 'no_route');
});
test('configured provider URL accepts HTTPS or loopback self-hosting, rejects unsafe configuration', () => {
  assert.equal(routingUrl('https://routing.openstreetmap.de/routed-car/'), 'https://routing.openstreetmap.de/routed-car');
  assert.equal(routingUrl('http://127.0.0.1:5000/'), 'http://127.0.0.1:5000');
  for (const url of ['http://example.com', 'https://user:password@example.com', 'https://example.com/?key=x', 'file:///x', 'https://example.com/#x']) assert.throws(() => routingUrl(url));
});
test('adapter sends driving routes in lon/lat order with geometry only when needed, identifying UA and bounded snapping', async () => {
  const adapter = createOsrmAdapter({ baseUrl: 'https://routing.example/osrm', intervalMs: 0, fetch: async (value, init) => {
    const u = new URL(String(value)); assert.equal(u.pathname, '/osrm/route/v1/driving/35.6,34;35.65,34.1');
    assert.equal(u.searchParams.get('overview'), 'full'); assert.equal(u.searchParams.get('geometries'), 'geojson');
    assert.equal(u.searchParams.get('continue_straight'), 'false'); assert.equal(u.searchParams.get('radiuses'), '250;250');
    assert.equal((init!.headers as Record<string, string>)['User-Agent'], 'LebanonSupermarketCapstone/1.0'); assert.equal(init!.redirect, 'error');
    return Response.json(osrmResponse());
  } });
  assert.equal((await adapter.route(routePoints, true)).durationSeconds, 1500);
});
test('throttling, serialization, bounded cache and in-flight coalescing avoid duplicate provider work', async () => {
  let clock = 0, calls = 0;
  const starts: number[] = [];
  const adapter = createOsrmAdapter({ baseUrl: 'https://routing.example', intervalMs: 1100, now: () => clock,
    wait: async ms => { clock += ms; }, fetch: async value => {
      calls++; starts.push(clock);
      const path = new URL(String(value)).pathname.split('/').pop()!;
      const points = path.split(';').map(p => { const [longitude, latitude] = p.split(',').map(Number); return { latitude, longitude }; });
      return Response.json(osrmResponse(points));
    } });
  const [a, b] = await Promise.all([adapter.route(routePoints, true), adapter.route(routePoints, true)]);
  assert.equal(calls, 1); a.durationSeconds = 0; assert.equal(b.durationSeconds, 1500);
  await adapter.route([...routePoints].reverse(), true); await adapter.route(routePoints, false);
  assert.deepEqual(starts, [0, 1100, 2200]);
  await adapter.route(routePoints, true); assert.equal(calls, 3);
  await adapter.route(routePoints.map(p => ({ ...p, branchId: 999, address: 'Unrelated catalog metadata' })), true);
  assert.equal(calls, 3, 'Only coordinates and routing options identify cached road work');
  clock += 300001; await adapter.route(routePoints, true); assert.equal(calls, 4);
});
test('timeouts, rate limiting/cooldown, service errors, malformed and oversized bodies are safe failures', async () => {
  for (const status of [429, 500, 503]) {
    let count = 0;
    const adapter = createOsrmAdapter({ baseUrl: 'https://routing.example', intervalMs: 0, fetch: async () => { count++; return new Response('{}', { status }); } });
    await assert.rejects(adapter.route(routePoints, true), e => e instanceof RoutingError && e.reason === (status === 429 ? 'rate_limited' : 'unavailable'));
    if (status === 429) { await assert.rejects(adapter.route(routePoints, true), /rate_limited/); assert.equal(count, 1); }
  }
  for (const value of ['<html>not json</html>', 'x'.repeat(1000001)]) {
    await assert.rejects(createOsrmAdapter({ baseUrl: 'https://routing.example', intervalMs: 0, fetch: async () => new Response(value) }).route(routePoints, true), /invalid_response/);
  }
  await assert.rejects(createOsrmAdapter({ baseUrl: 'https://routing.example', intervalMs: 0, fetch: async () => Response.json({ code: 'NoRoute' }, { status: 400 }) }).route(routePoints, false), /no_route/);
  const adapter = createOsrmAdapter({ baseUrl: 'https://routing.example', intervalMs: 0, timeoutMs: 10,
    fetch: async (_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))) });
  await assert.rejects(adapter.route(routePoints, true), /timeout/);
});
test('route cache eviction and queue limits bound provider work independently of caller volume', async () => {
  let calls = 0;
  const adapter = createOsrmAdapter({ baseUrl: 'https://routing.example', intervalMs: 0, wait: async () => {}, fetch: async value => {
    calls++;
    const points = new URL(String(value)).pathname.split('/').pop()!.split(';').map(pair => {
      const [longitude, latitude] = pair.split(',').map(Number); return { latitude, longitude };
    });
    return Response.json(osrmResponse(points));
  } });
  const points = Array.from({ length: 129 }, (_, i) => [routePoints[0], { ...routePoints[1], latitude: 34.1 + i / 100000 }]);
  for (const p of points) await adapter.route(p, true);
  assert.equal(calls, 129); await adapter.route(points[0], true); assert.equal(calls, 130, 'Oldest cache entry must be evicted');
  await adapter.route(points[128], true); assert.equal(calls, 130);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const limited = createOsrmAdapter({ baseUrl: 'https://routing.example', intervalMs: 0, wait: async () => {}, fetch: async value => {
    await pending;
    const p = new URL(String(value)).pathname.split('/').pop()!.split(';').map(pair => { const [longitude, latitude] = pair.split(',').map(Number); return { latitude, longitude }; });
    return Response.json(osrmResponse(p));
  } });
  const active = points.slice(0, 32).map(p => limited.route(p, true));
  try { await assert.rejects(limited.route(points[32], true), /busy/); } finally { release(); await Promise.all(active); }
});
test('aborting one coalesced caller cannot replace another caller result or cancel shared routing', async () => {
  let finish!: (response: Response) => void;
  const adapter = createOsrmAdapter({ baseUrl: 'https://routing.example', intervalMs: 0,
    fetch: () => new Promise(resolve => { finish = resolve; }) });
  const controller = new AbortController();
  const first = adapter.route(routePoints, true, controller.signal), second = adapter.route(routePoints, true);
  const failure = assert.rejects(first, /cancelled/);
  while (!finish) await new Promise(resolve => setTimeout(resolve, 0));
  controller.abort(); finish(Response.json(osrmResponse()));
  await failure; assert.equal((await second).durationSeconds, 1500);
  await assert.rejects(adapter.route(routePoints, true, controller.signal), /cancelled/);
});
test('spherical corridor follows every polyline segment, including endpoints and repeated points', () => {
  const line: Position[] = [[35.6, 34], [35.6, 34.1], [35.7, 34.1]];
  assert.ok(distanceToRouteMeters({ latitude: 34.05, longitude: 35.6 }, line) < 0.001);
  assert.ok(distanceToRouteMeters({ latitude: 34.1, longitude: 35.65 }, line) < 2);
  assert.ok(distanceToRouteMeters({ latitude: 34.05, longitude: 35.61 }, line) < 1000);
  assert.ok(distanceToRouteMeters({ latitude: 34.05, longitude: 35.65 }, line) > 3000);
  assert.ok(distanceToRouteMeters({ latitude: 34.2, longitude: 35.6 }, line) > 10000);
  assert.ok(distanceToRouteMeters({ latitude: 34, longitude: 35.6 }, [[35.6, 34], [35.6, 34]]) < 0.001);
  assert.ok(distanceMeters({ latitude: 34, longitude: 35 }, { latitude: 34, longitude: 36 }) > 90000);
});
test('corridor handles long/short and antimeridian routes in geographic units; malformed geometry is rejected', () => {
  assert.ok(distanceToRouteMeters({ latitude: 0.01, longitude: 180 }, [[179, 0], [-179, 0]]) < 1200);
  assert.ok(distanceToRouteMeters({ latitude: 34, longitude: 35.600001 }, [[35.6, 34], [35.600002, 34]]) < 0.01);
  assert.ok(distanceToRouteMeters({ latitude: 0, longitude: 0 }, [[-30, 0], [30, 0]]) < 0.01);
  for (const line of [[], [[35, 34]], [[35, 91], [35, 34]], [[NaN, 34], [35, 34]]]) assert.throws(() => distanceToRouteMeters(routePoints[0], line as Position[]));
});
