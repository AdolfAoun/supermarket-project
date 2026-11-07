import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, createApiClient, createCatalogApi, getApiUrl, parseProductId } from '../services/api';
import { readHealth } from '../services/contracts';
import { deferred, manualClock, product, comparison, supermarkets } from './fixtures';

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const baseUrl = () => 'http://example.test/api';
test('configured URL is public HTTP(S), without credentials, query strings or fragments', () => {
  const before = process.env.EXPO_PUBLIC_API_URL;
  try {
    process.env.EXPO_PUBLIC_API_URL = ' https://example.test/api/// ';
    assert.equal(getApiUrl(), 'https://example.test/api');
    for (const value of ['', 'bad', 'ftp://example.test', 'http://user:password@example.test/api',
      'http://example.test/api?key=value', 'http://example.test/api#fragment']) {
      process.env.EXPO_PUBLIC_API_URL = value;
      assert.throws(getApiUrl, error => error instanceof ApiError && error.kind === 'configuration');
    }
  } finally {
    if (before === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = before;
  }
});
test('GET handles success, validates payload and cleans up its deadline', async () => {
  const clock = manualClock();
  const client = createApiClient({ baseUrl, schedule: clock.schedule, fetch: async (url, options) => {
    assert.equal(url, `${baseUrl()}/health/db`); assert.equal(options?.method, 'GET');
    return json({ status: 'ok', database: 'connected' });
  } });
  assert.equal(await client.get('/health/db', readHealth), true);
  assert.equal(clock.size, 0);
});
test('HTTP errors are safe, classified and retain status without trusting server text', async () => {
  for (const status of [400, 404, 500, 503]) {
    const client = createApiClient({ baseUrl, fetch: async () => new Response('private SQL error and credentials', { status }) });
    await assert.rejects(client.get('/products/1', readHealth), error => {
      assert.ok(error instanceof ApiError); assert.equal(error.kind, 'http'); assert.equal(error.status, status);
      assert.equal(error.message.includes('private'), false); return true;
    });
  }
});
test('network failure is distinct from empty success and supports a subsequent retry', async () => {
  let calls = 0;
  const client = createApiClient({ baseUrl, fetch: async () => {
    if (++calls === 1) throw new TypeError('raw private network details');
    return json({ status: 'ok', database: 'connected' });
  } });
  await assert.rejects(client.get('/health/db', readHealth), error => error instanceof ApiError && error.kind === 'network' && !error.message.includes('private'));
  assert.equal(await client.get('/health/db', readHealth), true);
});
test('malformed JSON and missing required payload fields become safe invalid-response errors', async () => {
  for (const response of [new Response('{bad json'), json({ status: 'ok' }), json(null)]) {
    const client = createApiClient({ baseUrl, fetch: async () => response });
    await assert.rejects(client.get('/health/db', readHealth), error => error instanceof ApiError && error.kind === 'invalid_response');
  }
});
test('timeout aborts even when the transport never resolves', async () => {
  const clock = manualClock();
  let signal: AbortSignal | null | undefined;
  const client = createApiClient({ baseUrl, schedule: clock.schedule, fetch: async (_url, options) => {
    signal = options?.signal; return new Promise<Response>(() => {});
  } });
  const pending = client.get('/health/db', readHealth);
  clock.fire();
  await assert.rejects(pending, error => error instanceof ApiError && error.kind === 'timeout');
  assert.equal(signal?.aborted, true);
});
test('deadline also covers a response body that stalls after headers', async () => {
  const clock = manualClock();
  const bodyStarted = deferred<void>();
  const client = createApiClient({ baseUrl, schedule: clock.schedule, fetch: async () => ({
    ok: true, status: 200, json: () => { bodyStarted.resolve(); return new Promise(() => {}); },
  }) as Response });
  const pending = client.get('/health/db', readHealth);
  await bodyStarted.promise; clock.fire();
  await assert.rejects(pending, error => error instanceof ApiError && error.kind === 'timeout');
});
test('caller cancellation aborts in-flight work and removes the timeout', async () => {
  const clock = manualClock();
  const controller = new AbortController();
  let signal: AbortSignal | null | undefined;
  const client = createApiClient({ baseUrl, schedule: clock.schedule, fetch: async (_url, options) => {
    signal = options?.signal; return new Promise<Response>(() => {});
  } });
  const pending = client.get('/health/db', readHealth, controller.signal);
  controller.abort();
  await assert.rejects(pending, error => error instanceof ApiError && error.kind === 'cancelled');
  assert.equal(signal?.aborted, true); assert.equal(clock.size, 0);
});
test('already-cancelled requests never fetch', async () => {
  const controller = new AbortController(); controller.abort();
  const client = createApiClient({ baseUrl, fetch: async () => { throw new Error('must not fetch'); } });
  await assert.rejects(client.get('/health/db', readHealth, controller.signal), error => error instanceof ApiError && error.kind === 'cancelled');
});
test('catalog methods use ID routes, trim/encode search once and respect the API cap', async () => {
  const paths: string[] = [];
  const api = createCatalogApi(createApiClient({ baseUrl, fetch: async url => {
    const path = String(url).slice(baseUrl().length); paths.push(path);
    if (path.startsWith('/products?')) return json({ products: [product] });
    if (path.endsWith('/prices')) return json(comparison);
    if (path === '/products/1') return json({ product });
    return json(supermarkets);
  } }));
  await api.products('  COKE 1.5 L % & +  ');
  await api.products('   ');
  await api.product(1); await api.prices(1); await api.supermarkets();
  assert.deepEqual(paths, ['/products?limit=100&search=COKE%201.5%20L%20%25%20%26%20%2B',
    '/products?limit=100&search=', '/products/1', '/products/1/prices', '/supermarkets']);
  assert.throws(() => api.products('x'.repeat(256)), ApiError);
  assert.throws(() => api.product(0), ApiError);
  assert.throws(() => api.prices(NaN), ApiError);
});
test('route ID validation agrees with backend bounds and rejects repeated/invalid parameters', () => {
  assert.equal(parseProductId('1'), 1); assert.equal(parseProductId('4294967295'), 4294967295);
  for (const value of [undefined, ['1', '2'], '0', '-1', '01', '1.5', '1e2', '4294967296', 'NaN', 'abc']) {
    assert.equal(parseProductId(value), null);
  }
});
