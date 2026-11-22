import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, createApiClient, createCatalogApi } from '../services/api';
import { createAuthApi, createListApi, validQuantity } from '../services/account-api';
import { readBasket, readList, readLogin } from '../services/private-contracts';
import { basketPresentation } from '../services/basket-presentation';
import { createMutation } from '../services/mutation';
import { basketFixture, listItem, summary, token, user, stamp } from './private-fixtures';
import { deferred } from './fixtures';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
test('registration/login clients send exact documented bodies and preserve password whitespace', async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const api = createAuthApi(createApiClient({ baseUrl: () => 'http://example.test/api', fetch: async (url, options) => {
    calls.push([String(url), options]);
    return json(String(url).endsWith('login') ? { token, user, expiresAt: stamp, tokenType: 'Bearer' } : { user });
  } }));
  await api.register({ displayName: 'Demo', email: user.email, password: ' pass123 ' });
  await api.login({ email: user.email, password: ' pass123 ' });
  assert.equal(calls[0][0], 'http://example.test/api/auth/register'); assert.equal(calls[0][1]?.method, 'POST');
  assert.equal(JSON.parse(calls[1][1]!.body as string).password, ' pass123 ');
  assert.equal((calls[0][1]?.headers as Record<string, string>).Authorization, undefined);
});
test('invalid credentials, duplicate email and backend failures use safe status-specific messages', async () => {
  for (const status of [401, 409, 500]) {
    const api = createAuthApi(createApiClient({ baseUrl: () => 'http://example.test/api', fetch: async () => new Response('SQL private', { status }) }));
    await assert.rejects(api.login({ email: user.email, password: 'password123' }), error => {
      assert.ok(error instanceof ApiError); assert.equal(error.status, status); assert.equal(error.message.includes('SQL'), false); return true;
    });
  }
});
test('list clients use canonical IDs, POST increments and PATCH replacements with authentication', async () => {
  const calls: { path: string; method: string; body?: object }[] = [];
  const client = createApiClient({ baseUrl: () => 'http://example.test/api', fetch: async (url, options) => {
    const path = String(url).replace('http://example.test/api', ''), method = options!.method!;
    assert.equal((options!.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    calls.push({ path, method, body: options?.body ? JSON.parse(options.body as string) : undefined });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (path.includes('/items')) return json({ item: { ...listItem, quantity: method === 'POST' ? 5 : 2 } });
    if (path.endsWith('/compare')) return json(basketFixture());
    if (path === '/shopping-lists' && method === 'GET') return json({ shoppingLists: [summary] });
    return json({ shoppingList: { ...summary, items: [listItem] } });
  } });
  const api = createListApi(operation => operation(token, new AbortController().signal), client);
  await api.lists(); await api.create('Weekly'); await api.detail(5); await api.rename(5, 'New name');
  await api.add(5, 1, 3); await api.setQuantity(5, 9, 2); await api.removeItem(5, 9); await api.compare(5); await api.remove(5);
  assert.deepEqual(calls[4], { path: '/shopping-lists/5/items', method: 'POST', body: { productId: 1, quantity: 3 } });
  assert.deepEqual(calls[5], { path: '/shopping-lists/5/items/9', method: 'PATCH', body: { quantity: 2 } });
  assert.equal(calls[6].method, 'DELETE'); assert.equal(calls[8].method, 'DELETE');
});
test('quantity and ID validation prevents invalid requests', () => {
  for (const value of ['0', '-1', '1.5', '1e2', '1000', '', '01']) assert.equal(validQuantity(value), null);
  assert.equal(validQuantity('999'), 999);
  const api = createListApi(async () => { throw new Error('Must not run'); });
  for (const quantity of [0, -1, 1.5, 1000]) assert.throws(() => api.add(5, 1, quantity), ApiError);
  assert.throws(() => api.add(5, 0, 1), ApiError); assert.throws(() => api.detail(0), ApiError);
});
test('guest catalog requests remain public and carry no authentication', async () => {
  const api = createCatalogApi(createApiClient({ baseUrl: () => 'http://example.test/api', fetch: async (_url, options) => {
    assert.equal((options!.headers as Record<string, string>).Authorization, undefined); return json({ products: [] });
  } }));
  assert.deepEqual(await api.products(''), []);
});
test('private contract readers preserve empty lists and inactive item identity', () => {
  assert.deepEqual(readList({ shoppingList: { ...summary, items: [] } }, 5).items, []);
  const inactive = structuredClone(listItem); inactive.product.isActive = false;
  assert.equal(readList({ shoppingList: { ...summary, items: [inactive] } }, 5).items[0].product.isActive, false);
  assert.throws(() => readList({ shoppingList: { ...summary, items: [listItem] } }, 6));
  assert.throws(() => readLogin({ token: 'bad', user, expiresAt: stamp, tokenType: 'Bearer' }));
});
test('basket validation accepts real backend contract, tied ranks and missing-price diagnostics', () => {
  const comparison = readBasket(basketFixture(), 5), view = basketPresentation(comparison);
  assert.deepEqual(view.branches.map(b => [b.rank, b.cheapest, b.totalUsd]), [[1, true, '2.00'], [1, true, '2.00']]);
  assert.match(view.incomplete[0].explanation, /Missing price information for: Coca-Cola/);
  assert.equal(view.incomplete[0].explanation.includes('out of stock'), false);
  assert.equal(view.availabilityNotice, comparison.availabilityNotice);
  assert.equal(comparison.demonstrationData, true);
});
test('basket validation rejects broken ranking, ties, identities, currencies and unexpected structures', () => {
  const changes: ((payload: ReturnType<typeof basketFixture>) => void)[] = [
    p => { p.eligibleBranches.reverse(); }, p => { p.eligibleBranches[0].rank = 2; }, p => { p.cheapestBranchIds = [1]; },
    p => { p.eligibleBranches[0].items[0].productId = 77; }, p => { p.eligibleBranches[0].items[0].quantity = 999; },
    p => { p.eligibleBranches[0].totalUsd = 'NaN'; }, p => { p.eligibleBranches[0].totalUsdUnits = '1.2'; },
    p => { p.incompleteBranches[0].missingProductIds = [77]; }, p => { p.eligibleBranches[0].items[0].originalCurrency = 'EUR'; },
    p => { p.shoppingList.items = []; }, p => { p.shoppingList.items[0].product.id = 77; },
  ];
  for (const change of changes) { const payload = basketFixture(); change(payload); assert.throws(() => readBasket(payload, 5)); }
  assert.throws(() => readBasket(null, 5)); assert.throws(() => readBasket(basketFixture(), 7));
});
test('empty/inactive comparisons preserve explanatory outcomes without fabricating winners', () => {
  const missing = basketFixture(); missing.eligibleBranches = []; missing.cheapestBranchIds = []; missing.outcome = 'no_complete_branches';
  assert.match(basketPresentation(readBasket(missing, 5)).message!, /No branch/);
  const inactive = basketFixture(); inactive.shoppingList.items[0].product.isActive = false;
  inactive.inactiveProductIds = [1]; inactive.eligibleBranches = []; inactive.incompleteBranches = []; inactive.cheapestBranchIds = []; inactive.outcome = 'inactive_products';
  assert.match(basketPresentation(readBasket(inactive, 5)).message!, /inactive products/);
});
test('identical displayed cents do not create a client-side tie when exact backend ranks differ', () => {
  const payload = basketFixture(), second = payload.eligibleBranches[1];
  second.rank = 2; second.totalUsdUnits = '18000002'; payload.cheapestBranchIds = [1];
  second.items[0] = { ...second.items[0], originalPrice: '90000.01', originalCurrency: 'LBP',
    unitPriceUsdUnits: '9000001', lineTotalUsdUnits: '18000002' };
  const view = basketPresentation(readBasket(payload, 5));
  assert.equal(view.branches[0].totalUsd, view.branches[1].totalUsd);
  assert.deepEqual(view.branches.map(b => b.cheapest), [true, false]);
});
test('mutation responses must match the requested product, item and list IDs', async () => {
  const client = createApiClient({ baseUrl: () => 'http://example.test/api', fetch: async () => json({ item: { ...listItem, id: 77 } }) });
  const api = createListApi(operation => operation(token, new AbortController().signal), client);
  await assert.rejects(api.setQuantity(5, 9, 2), error => error instanceof ApiError && error.kind === 'invalid_response');
  await assert.rejects(api.add(5, 13, 1), error => error instanceof ApiError && error.kind === 'invalid_response');
});
test('mutation owner prevents duplicate taps and stale success navigation', async () => {
  const states: { pending: boolean; error: string | null }[] = [], response = deferred<number>(); let calls = 0, successes = 0;
  const mutation = createMutation(state => states.push(state));
  const operation = async () => { calls++; return response.promise; };
  const first = mutation.run(operation, () => successes++);
  await mutation.run(operation); assert.equal(calls, 1); mutation.cancel(); response.resolve(1); await first;
  assert.equal(successes, 0); assert.equal(states.length, 1);
});
test('read-only import failures do not imply a shopping-list write may have happened', async () => {
  let message = '';
  const mutation = createMutation(state => { message = state.error ?? ''; }, true);
  await mutation.run(async () => { throw new ApiError('timeout', 'Timed out. Try again.'); });
  assert.equal(message, 'Timed out. Try again.');
});

test('mutation timeout failures prompt reload and never retry increments automatically', async () => {
  let calls = 0, message = '';
  const mutation = createMutation(state => { message = state.error ?? ''; });
  await mutation.run(async () => { calls++; throw new ApiError('timeout', 'Timed out.'); });
  assert.equal(calls, 1); assert.match(message, /Reload before repeating/);
});
