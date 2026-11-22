import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../../backend/src/app';
import { parseGoogleMaps, mapsUrl } from '../../backend/src/modules/locations/google-maps';
import { createGoogleMapsImporter } from '../../backend/src/modules/locations/resolver';
import type { AuthRepository } from '../../backend/src/modules/auth/repository';
import { expandedUrl, shortUrl, legacyUrl, simpleUrl } from '../../backend/tests/fixtures/google-maps';
import { readJourneyImport, applyJourneyImport, assignJourneyPlace, emptyJourney, readyJourney, type JourneyLocation } from '../services/journey';
import { currentLocation, type ForegroundLocation } from '../services/current-location';
import { ApiError, createApiClient } from '../services/api';
import { createListApi } from '../services/account-api';
import { createSession } from '../services/session';
import { createMutation } from '../services/mutation';
import { token } from './private-fixtures';

const parse = (url = simpleUrl) => readJourneyImport(parseGoogleMaps(mapsUrl(url)));
test('journey contract accepts exact expanded endpoints, partial named places, stops and location-only imports', () => {
  const r = parse(expandedUrl);
  assert.equal(r.destination!.name, 'Spinneys - Sahel Alma'); assert.equal(r.destination!.longitude, 35.6479666);
  assert.equal(parse(simpleUrl + '&waypoints=34.3,35.1').waypoints.length, 1);
  assert.equal(parse(simpleUrl.replace('34.1,35.2', 'Named+Place')).status, 'partial');
  assert.equal(parse('https://www.google.com/maps/search/?api=1&query=34,35').kind, 'location');
});
test('journey contract rejects inconsistent completeness, coordinates, sources, modes and shape', () => {
  for (const alter of [
    (r: any) => { r.origin.latitude = 91; }, (r: any) => { r.destination.longitude = '35'; },
    (r: any) => { r.destination.longitude = null; }, (r: any) => { r.origin.coordinateSource = null; },
    (r: any) => { r.status = 'partial'; },
    (r: any) => { r.travelMode = 'flying'; }, (r: any) => { r.location = r.origin; },
    (r: any) => { r.waypoints = [null]; }, (r: any) => { r.kind = 'location'; },
  ]) { const r = structuredClone(parse()); alter(r); assert.throws(() => readJourneyImport(r)); }
});
test('only complete driving drafts start discovery; confirmation state and response flag are retired', () => {
  const full = applyJourneyImport(emptyJourney(), parse());
  assert.equal(readyJourney(full), true); assert.equal('confirmed' in full, false); assert.equal('requiresConfirmation' in parse(), false);
  const walking = applyJourneyImport(emptyJourney(), parse(simpleUrl.replace('driving', 'walking')));
  assert.equal(readyJourney(walking), false); assert.equal(readyJourney({ ...walking, travelMode: 'driving' }), true);
  assert.equal(readyJourney(applyJourneyImport(emptyJourney(), parse(simpleUrl.replace('34.1,35.2', 'Name')))), false);
  assert.equal(readyJourney({ ...full, waypoints: Array(9).fill(full.origin) }), false);
});
test('place assignment and GPS replacement preserve the other endpoint without duplicate confirmation states', () => {
  let s = applyJourneyImport(emptyJourney(), parse('https://maps.google.com/?q=34,35'));
  assert.equal(readyJourney(s), false); s = assignJourneyPlace(s, 'origin');
  s = applyJourneyImport(s, parse('https://maps.google.com/?q=34.1,35.2')); s = assignJourneyPlace(s, 'destination');
  assert.equal(s.origin!.latitude, 34); assert.equal(s.destination!.latitude, 34.1);
  s = { ...s, travelMode: 'driving' }; assert.equal(readyJourney(s), true);
  s = { ...s, origin: { ...s.origin!, name: 'Current', latitude: 34.2, coordinateSource: 'device' } };
  assert.equal(s.origin!.latitude, 34.2); assert.equal(s.destination!.latitude, 34.1);
});
const gps: ForegroundLocation = { requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  hasServicesEnabledAsync: async () => true, getCurrentPositionAsync: async () => ({ coords: { latitude: 34, longitude: 35 }, timestamp: Date.now() }) };
test('GPS uses permission, service check and one foreground fix; no background tracking', async () => {
  const calls: string[] = [];
  const r = await currentLocation({ requestForegroundPermissionsAsync: async () => { calls.push('permission'); return { status: 'granted' }; },
    hasServicesEnabledAsync: async () => { calls.push('services'); return true; },
    getCurrentPositionAsync: async options => { calls.push('position'); assert.equal(options.accuracy, 3); return gps.getCurrentPositionAsync(options); } }, 3);
  assert.deepEqual(calls, ['permission', 'services', 'position']); assert.equal(r.coordinateSource, 'device');
});
test('GPS denial, disabled services, unavailable, stale and invalid fix produce meaningful errors', async () => {
  const mustNotGet = async (): Promise<never> => { throw new Error('MUST NOT REQUEST FIX'); };
  await assert.rejects(currentLocation({ ...gps, requestForegroundPermissionsAsync: async () => ({ status: 'denied' }), getCurrentPositionAsync: mustNotGet }, 3), /permission denied/);
  await assert.rejects(currentLocation({ ...gps, hasServicesEnabledAsync: async () => false, getCurrentPositionAsync: mustNotGet }, 3), /services are disabled/);
  await assert.rejects(currentLocation({ ...gps, getCurrentPositionAsync: async () => { throw new Error('native detail'); } }, 3), /temporarily unavailable/);
  for (const fix of [{ coords: { latitude: NaN, longitude: 35 }, timestamp: Date.now() },
    { coords: { latitude: 34, longitude: 35 }, timestamp: 0 }]) {
    await assert.rejects(currentLocation({ ...gps, getCurrentPositionAsync: async () => fix }, 3), /fresh location is unavailable/);
  }
});
test('GPS timeout and cancellation reject late fixes and never start GPS after a late permission response', async () => {
  let fix!: (value: Awaited<ReturnType<ForegroundLocation['getCurrentPositionAsync']>>) => void;
  await assert.rejects(currentLocation({ ...gps, getCurrentPositionAsync: () => new Promise(resolve => { fix = resolve; }) }, 3, undefined, 10), /timed out/);
  fix(await gps.getCurrentPositionAsync({ accuracy: 3 }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(currentLocation(gps, 3, controller.signal), error => error instanceof ApiError && error.kind === 'cancelled');
  let permission!: (value: { status: string }) => void, calls = 0;
  await assert.rejects(currentLocation({ ...gps, requestForegroundPermissionsAsync: () => new Promise(resolve => { permission = resolve; }),
    getCurrentPositionAsync: async o => { calls++; return gps.getCurrentPositionAsync(o); } }, 3, undefined, 10), /timed out/);
  permission({ status: 'granted' }); await Promise.resolve(); await Promise.resolve(); assert.equal(calls, 0);
});
test('existing mutation lifecycle blocks duplicate imports and rejects a late result after blur/account removal', async () => {
  let finish!: (p: JourneyLocation) => void, calls = 0, published = 0;
  const action = createMutation(() => {});
  const work = action.run(() => { calls++; return new Promise<JourneyLocation>(resolve => { finish = resolve; }); }, () => published++);
  await action.run(async () => { calls++; return parse().origin!; }); assert.equal(calls, 1);
  action.cancel(); finish(parse().origin!); await work; assert.equal(published, 0);
});
test('mobile import client posts URL with bearer, signal and strict contract; safe errors distinguish unsupported links', async () => {
  const client = createApiClient({ baseUrl: () => 'https://api.example/api', fetch: async (input, options) => {
    assert.equal(String(input), 'https://api.example/api/locations/import-google-maps'); assert.equal(options!.method, 'POST');
    assert.equal((options!.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    assert.deepEqual(JSON.parse(options!.body as string), { url: expandedUrl }); assert.ok(options!.signal);
    return new Response(JSON.stringify(parse(expandedUrl)), { status: 200 });
  } });
  const lists = createListApi(operation => operation(token, new AbortController().signal), client);
  assert.equal((await lists.importGoogleMaps('  ' + expandedUrl + '  ')).status, 'complete');
  for (const status of [400, 422, 500]) {
    const failing = createListApi(operation => operation(token, new AbortController().signal), createApiClient({ baseUrl: () => 'https://api.example/api',
      fetch: async () => new Response('{}', { status }) }));
    await assert.rejects(failing.importGoogleMaps(expandedUrl), error => error instanceof ApiError && error.status === status && !error.message.includes('database'));
  }
});
test('import 401 invalidates only the current session through the existing private request controller', async () => {
  const session = createSession({ get: async () => token, set: async () => {}, remove: async () => {} }, {
    register: async () => { throw new Error(); }, login: async () => { throw new Error(); }, logout: async () => {},
    me: async () => ({ id: 1, displayName: 'Demo', email: 'demo@example.com' }),
  });
  await session.restore(); assert.equal(session.getState().status, 'authenticated');
  const lists = createListApi(session.run, createApiClient({ baseUrl: () => 'https://api.example/api', fetch: async () => new Response('{}', { status: 401 }) }));
  await assert.rejects(lists.importGoogleMaps(expandedUrl)); assert.equal(session.getState().status, 'guest');
});
test('mobile → real Express HTTP import with mocked external redirect uses the same response contract', async () => {
  const auth: AuthRepository = { register: async () => { throw new Error(); }, findAccount: async () => null, createSession: async () => '',
    logout: async () => {}, authenticate: async () => ({ id: 1, displayName: 'Demo', email: 'demo@example.com' }) };
  const importer = createGoogleMapsImporter({ lookup: async () => [{ address: '8.8.8.8', family: 4 }], headers: async () => ({ status: 302, location: legacyUrl }) });
  const server = createApp(async () => {}, [], undefined, auth, undefined, undefined, importer).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const client = createApiClient({ baseUrl: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api` });
    const lists = createListApi(operation => operation(token, new AbortController().signal), client);
    assert.equal((await lists.importGoogleMaps(expandedUrl)).destination!.latitude, 34.0007638);
    assert.equal((await lists.importGoogleMaps(shortUrl)).destination!.latitude, 34.000764);
    assert.equal((await lists.importGoogleMaps('https://maps.google.com/?q=34,35')).kind, 'location');
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
