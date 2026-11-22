import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { HttpError } from '../src/middleware/errors.js';
import type { AuthRepository } from '../src/modules/auth/repository.js';
import { mapsUrl, parseGoogleMaps } from '../src/modules/locations/google-maps.js';
import { createGoogleMapsImporter, publicAddress, type ResolverIO } from '../src/modules/locations/resolver.js';
import { expandedUrl, shortUrl, legacyUrl, simpleUrl } from './fixtures/google-maps.js';

const parse = (value: string) => parseGoogleMaps(mapsUrl(value));
test('owner expanded URL identifies exact endpoints, destination name, identifier and driving; ignores viewport', () => {
  const r = parse(expandedUrl);
  assert.equal(r.status, 'complete'); assert.equal('requiresConfirmation' in r, false);
  assert.deepEqual([r.origin!.latitude, r.origin!.longitude], [34.015658, 35.673936]);
  assert.deepEqual([r.destination!.latitude, r.destination!.longitude], [34.0007638, 35.6479666]);
  assert.equal(r.destination!.name, 'Spinneys - Sahel Alma');
  assert.equal(r.destination!.placeId, '0x151f41e862d2bba3:0x45618567b7e7db8d');
  assert.equal(r.travelMode, 'driving'); assert.deepEqual(r.waypoints, []);
});
test('documented directions preserve explicit coordinates, zero coordinates and supported modes', () => {
  for (const travelmode of ['driving', 'walking', 'bicycling', 'transit', 'two-wheeler', 'unknown']) {
    const r = parse(`https://www.google.com/maps/dir/?api=1&origin=0,0&destination=-90,-180&travelmode=${travelmode}`);
    assert.equal(r.status, 'complete'); assert.equal(r.origin!.latitude, 0); assert.equal(r.travelMode, travelmode);
  }
});
test('waypoints retain supplied order and IDs, without silently discarding unresolved stops', () => {
  const r = parse(simpleUrl + '&waypoints=34.2,35.1|Named+Stop&waypoint_place_ids=ChIJfirst|ChIJsecond');
  assert.equal(r.status, 'partial'); assert.equal(r.waypoints.length, 2);
  assert.equal(r.waypoints[0].latitude, 34.2); assert.equal(r.waypoints[1].name, 'Named Stop');
  assert.equal(r.waypoints[1].placeId, 'ChIJsecond');
  assert.equal(parse('https://www.google.com/maps/dir/34,35/34.2,35.1/34.1,35.2/').status, 'complete');
});
test('missing origin/destination, name-only and place-ID-only endpoints remain partial', () => {
  for (const suffix of ['destination=34,35', 'origin=34,35', 'origin=My+Location&destination=34,35',
    'origin=34,35&destination=Spinneys&destination_place_id=ChIJplace']) {
    assert.equal(parse(`https://www.google.com/maps/dir/?api=1&${suffix}`).status, 'partial');
  }
  assert.equal(parse(simpleUrl.replace('&travelmode=driving', '')).travelMode, 'unknown');
});
test('location-only search, legacy q and place pins never become complete journeys', () => {
  for (const value of ['https://www.google.com/maps/search/?api=1&query=34,35&query_place_id=ChIJplace',
    'https://maps.google.com/?q=34,35',
    'https://www.google.com/maps/place/A+Shop/@1,2,13z/data=!3d34!4d35']) {
    const r = parse(value); assert.equal(r.kind, 'location'); assert.equal(r.status, 'partial');
    assert.equal(r.origin, null); assert.equal(r.destination, null); assert.equal(r.location!.latitude, 34);
  }
  assert.equal(parse('https://www.google.com/maps/search/?api=1&query=A+Shop').location!.latitude, null);
});
test('viewport coordinates, unknown data formats, and ambiguous multi-stop pins never supply endpoints', () => {
  const r = parse('https://www.google.com/maps/dir/Start/End/@34,35,12z/data=!2m2!1d35!2d34!3e0');
  assert.equal(r.status, 'partial'); assert.equal(r.destination!.latitude, null); assert.equal(r.origin!.latitude, null);
  assert.equal(parse('https://www.google.com/maps/place/Shop/@34,35,12z/').location!.latitude, null);
  assert.throws(() => parse('https://www.google.com/maps/@34,35,12z/'), HttpError);
  assert.throws(() => parse('https://www.google.com/maps/unknown'), HttpError);
  assert.equal(parse('https://www.google.com/maps/dir/34%2C35%2F34.2%2C35.2/End/').origin!.latitude, null);
  assert.equal(parse('https://www.google.com/maps/place/Shop%213d34%214d35/@34,35,12z/').location!.latitude, null);
  assert.equal(parse('https://www.google.com/maps/dir/34,35/34.1,35.2/%40Shop/').status, 'partial');
  assert.throws(() => parse('https://www.google.com/maps/dir/34,35/34.1,35.2/@34,35,12z/HiddenStop/'), HttpError);
});
test('invalid inputs, coordinates, duplicated parameters, malformed encodings and ambiguous stops fail closed', () => {
  for (const value of ['not a url', 'http://www.google.com/maps', 'https://example.com/maps', 'https://www.google.com.evil.test/maps',
    'https://user:pass@www.google.com/maps', 'https://www.google.com:8443/maps', 'https://www.google.com/maps#fragment',
    'https://www.google.com/maps\\evil', 'https://google.com.evil/maps', 'https://www.google.com/search?q=maps',
    simpleUrl.replace('34,35', '91,35'), simpleUrl.replace('34,35', '34,181'), simpleUrl + '&origin=1,2',
    simpleUrl + '&waypoints=1,2||3,4', simpleUrl + '&waypoints=1,2&waypoint_place_ids=A|B',
    'https://www.google.com/maps/dir/%E0%A4%A/End', 'https://www.google.com/maps/dir/34,35//34.1,35.2/',
    'https://www.google.com/maps/dir/?origin=34,35&destination=34.1,35.2']) assert.throws(() => parse(value), HttpError, value);
});
test('observed legacy geocode structure matches supplied endpoints with disclosed six-decimal precision', () => {
  const r = parse(legacyUrl);
  assert.equal(r.status, 'complete'); assert.equal(r.destination!.latitude, 34.000764);
  assert.equal(r.destination!.longitude, 35.647967); assert.equal(r.destination!.coordinateSource, 'google_geocode');
  assert.equal(r.origin!.latitude, 34.0156577); assert.equal(r.travelMode, 'driving');
  assert.equal(parse(legacyUrl.replace('saddr=34.0156577,35.6739358', 'saddr=1,2')).status, 'partial');
  assert.equal(parse(legacyUrl.replace('FXzPBgId3_EfAimju9Ji6EEfFTGN2-e3Z4VhRQ%3D%3D', 'unknown')).destination!.latitude, null);
});
test('additional synthetic fixed32 URL records verify signs, zero, limits and strict tags, without claiming live Google samples', () => {
  function record(lat: number, lon: number) {
    const b = Buffer.alloc(10); b[0] = 0x15; b[5] = 0x1d;
    b.writeInt32LE(lat * 1e6, 1); b.writeInt32LE(lon * 1e6, 6); return b.toString('base64url');
  }
  for (const [lat, lon] of [[0, 0], [-33, -70], [90, 180]]) {
    const url = new URL('https://maps.google.com/');
    url.search = new URLSearchParams({ saddr: '34,35', daddr: 'Test place', geocode: `${record(34, 35)};${record(lat, lon)}` }).toString();
    assert.equal(parse(url.href).destination!.latitude, lat);
  }
});
const io: ResolverIO = {
  lookup: async () => [{ address: '8.8.8.8', family: 4 }],
  headers: async () => ({ status: 302, location: expandedUrl }),
};
test('supplied short URL follows a controlled mocked redirect; expanded links perform no network', async () => {
  let calls = 0;
  const importer = createGoogleMapsImporter({ ...io, headers: async (url, address, signal) => {
    calls++; assert.equal(url.href, shortUrl); assert.equal(address, '8.8.8.8'); assert.equal(signal.aborted, false);
    return { status: 302, location: legacyUrl };
  } });
  assert.equal((await importer(shortUrl)).destination!.latitude, 34.000764);
  assert.equal((await importer(expandedUrl)).destination!.latitude, 34.0007638); assert.equal(calls, 1);
});
test('short resolver rejects unsafe hosts/schemes/credentials before DNS and pins validated public addresses', async () => {
  let lookups = 0;
  for (const destination of ['http://www.google.com/maps', 'https://127.0.0.1/', 'https://169.254.169.254/', 'https://evil.test/',
    'https://www.google.com.evil.test/maps', 'https://u:p@www.google.com/maps', 'https://www.google.com:8443/maps', 'https://www.google.com/search']) {
    const importer = createGoogleMapsImporter({ lookup: async host => { lookups++; assert.equal(host, 'maps.app.goo.gl'); return io.lookup(host); },
      headers: async () => ({ status: 302, location: destination }) });
    await assert.rejects(importer(shortUrl), HttpError);
  }
  assert.equal(lookups, 8);
});
test('private, loopback, reserved, link-local, multicast, IPv6 and mixed DNS answers never reach transport', async () => {
  for (const address of ['0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1',
    '192.0.0.1', '198.18.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::1', '::ffff:127.0.0.1']) {
    assert.equal(publicAddress(address), false);
    await assert.rejects(createGoogleMapsImporter({ lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address, family: address.includes(':') ? 6 : 4 }],
      headers: async () => { throw new Error('MUST NOT CONNECT'); } })(shortUrl), /Unsafe/);
  }
  assert.equal(publicAddress('8.8.8.8'), true);
});
test('redirect loops, count, oversized location, missing redirect, DNS errors and timeouts are bounded', async () => {
  await assert.rejects(createGoogleMapsImporter({ ...io, headers: async () => ({ status: 302, location: shortUrl }) })(shortUrl), /loop/);
  let n = 0;
  await assert.rejects(createGoogleMapsImporter({ ...io, headers: async () => ({ status: 302, location: `https://maps.app.goo.gl/hop${n++}` }) })(shortUrl), /Too many/);
  assert.equal(n, 5);
  for (const response of [{ status: 200 }, { status: 302 }, { status: 302, location: 'https://www.google.com/maps?' + 'x'.repeat(8192) }]) {
    await assert.rejects(createGoogleMapsImporter({ ...io, headers: async () => response })(shortUrl), HttpError);
  }
  await assert.rejects(createGoogleMapsImporter({ ...io, lookup: async () => { throw new Error('private DNS details'); } })(shortUrl), /could not be resolved/);
  const never = () => new Promise<never>(() => {});
  await assert.rejects(createGoogleMapsImporter({ ...io, lookup: never }, 10)(shortUrl), /timed out/);
  await assert.rejects(createGoogleMapsImporter({ ...io, headers: never }, 10)(shortUrl), /timed out/);
});
test('each redirect target gets a fresh public DNS check; a rebound private address is rejected', async () => {
  let reads = 0;
  await assert.rejects(createGoogleMapsImporter({ lookup: async () => [{ address: ++reads === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }],
    headers: async () => ({ status: 302, location: 'https://maps.app.goo.gl/next' }) })(shortUrl), /Unsafe/);
  assert.equal(reads, 2);
});
const token = 'a'.repeat(64);
const auth: AuthRepository = { register: async () => { throw new Error(); }, findAccount: async () => null,
  createSession: async () => '', logout: async () => {}, authenticate: async () => ({ id: 7, displayName: 'Demo', email: 'demo@example.com' }) };
const endpoint = '/api/locations/import-google-maps';
test('import HTTP uses existing auth, no-store, strict bodies and normal error envelope without database writes', async () => {
  const app = createApp(async () => {}, [], undefined, auth);
  await request(app).post(endpoint).send({ url: expandedUrl }).expect(401);
  for (const input of [{}, { url: expandedUrl, userId: 1 }, { url: 1 }, []]) {
    await request(app).post(endpoint).set('Authorization', `Bearer ${token}`).send(input).expect(400);
  }
  await request(app).post(endpoint + '?url=test').set('Authorization', `Bearer ${token}`).send({ url: expandedUrl }).expect(400);
  const response = await request(app).post(endpoint).set('Authorization', `Bearer ${token}`).send({ url: expandedUrl }).expect(200);
  assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.body.destination.name, 'Spinneys - Sahel Alma');
  const bad = await request(app).post(endpoint).set('Authorization', `Bearer ${token}`).send({ url: 'https://www.google.com/maps/@34,35,12z' }).expect(422);
  assert.equal(bad.body.status, 'error');
  const expired = createApp(async () => {}, [], undefined, { ...auth, authenticate: async () => null });
  await request(expired).post(endpoint).set('Authorization', `Bearer ${token}`).send({ url: expandedUrl }).expect(401);
});
test('HTTP importer injection bounds concurrency and sanitizes unexpected failures', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const app = createApp(async () => {}, [], undefined, auth, undefined, undefined, async () => { calls++; await pending; return parse(simpleUrl); });
  const requests = Array.from({ length: 4 }, () => request(app).post(endpoint).set('Authorization', `Bearer ${token}`).send({ url: simpleUrl }).then(r => r));
  try {
    const started = Date.now();
    while (calls < 4 && Date.now() - started < 3000) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(calls, 4);
    await request(app).post(endpoint).set('Authorization', `Bearer ${token}`).send({ url: simpleUrl }).expect(422);
  } finally { release(); await Promise.all(requests); }
  const failing = createApp(async () => {}, [], undefined, auth, undefined, undefined, async () => { throw new Error('URL or network secret'); });
  const response = await request(failing).post(endpoint).set('Authorization', `Bearer ${token}`).send({ url: simpleUrl }).expect(500);
  assert.deepEqual(response.body, { status: 'error', message: 'Internal server error' });
});
