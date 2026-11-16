import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { optimizeBasket } from '../../backend/src/modules/basket/optimize';
import type { BasketSnapshot } from '../../backend/src/modules/basket/repository';
import { readOptimization } from '../services/optimization-contracts';
import { createListApi } from '../services/account-api';
import { createApiClient, ApiError } from '../services/api';
import { createSession } from '../services/session';
import { createResource } from '../services/resource';
import { listItem, summary, token } from './private-fixtures';

function fixture(max = 2) {
  const snapshot: BasketSnapshot = { shoppingList: { ...summary, items: [structuredClone(listItem),
    { ...structuredClone(listItem), id: 10, productId: 2, product: { ...listItem.product, id: 2, name: 'Bread' } }] },
    branches: [1, 2, 3].map(branchId => ({ branchId, branch: `Branch ${branchId}`, supermarketId: 1, supermarket: 'Demo' })),
    prices: [1, 2].flatMap(branchId => [1, 2].map(productId => ({ branchId, productId, observedAt: listItem.createdAt,
      originalCurrency: 'USD', originalPrice: branchId === productId ? '1.00' : '2.00' }))) };
  return optimizeBasket(snapshot, max, new Date('2026-11-15T12:00:00Z'));
}
test('optimization contract preserves allocation, quantities, freshness and exact savings', () => {
  const result = readOptimization(fixture(), 5, 2);
  assert.equal(result.multiStore.solution!.totalUsd, '4.00');
  assert.equal(result.multiStore.savings!.amountUsd, '2.00');
  assert.equal(result.multiStore.savings!.percentage, '33.33');
  assert.equal(result.multiStore.solution!.allocations[0].items[0].quantity, 2);
  assert.equal(result.comparison.eligibleBranches[0].items[0].freshness, 'older');
  assert.deepEqual(result.comparison.incompleteBranches[0].missingProductIds, [1, 2]);
});
test('optimization reader fails closed on wrong list, branch limit, coverage, trust and reconciliation', () => {
  assert.throws(() => readOptimization(fixture(), 6, 2));
  assert.throws(() => readOptimization(fixture(), 5, 3));
  const mutations: ((r: ReturnType<typeof fixture>) => void)[] = [
    r => { r.multiStore.solution!.totalUsdUnits = '1'; },
    r => { r.multiStore.solution!.allocations[0].subtotalUsdUnits = '1'; },
    r => { r.multiStore.solution!.allocations[0].items[0].quantity = 5; },
    r => { r.multiStore.solution!.allocations[0].items[0].lineTotalUsdUnits = '1'; },
    r => { r.multiStore.solution!.allocations[0].items.push(r.multiStore.solution!.allocations[0].items[0]); },
    r => { r.multiStore.solution!.branchIds = [99]; },
    r => { r.multiStore.solution!.allocations[0].branch = 'Wrong branch'; },
    r => { r.multiStore.solution!.allocations[0].items[0].observedAt = 'bad'; },
    r => { r.multiStore.savings!.amountUsdUnits = '999'; },
    r => { r.multiStore.savings!.percentage = '101.00'; },
    r => { r.missingProductIds = [1]; },
    r => { r.excludedItems = [structuredClone(listItem)]; },
  ];
  for (const mutate of mutations) { const data = fixture(); mutate(data); assert.throws(() => readOptimization(data, 5, 2)); }
  const data = JSON.parse(JSON.stringify(fixture()));
  data.multiStore.solution.allocations[0].items[0].status = 'pending';
  assert.throws(() => readOptimization(data, 5, 2));
});
test('reader accepts no single-store baseline, no solution and zero savings', () => {
  const split = fixture(); split.comparison.eligibleBranches = []; split.comparison.cheapestBranchIds = [];
  split.comparison.incompleteBranches.push(
    { branchId: 1, branch: 'Branch 1', supermarketId: 1, supermarket: 'Demo', missingProductIds: [2] },
    { branchId: 2, branch: 'Branch 2', supermarketId: 1, supermarket: 'Demo', missingProductIds: [1] });
  split.comparison.incompleteBranches.sort((a, b) => a.branchId - b.branchId);
  split.comparison.outcome = 'no_complete_branches'; split.multiStore.savings = null;
  assert.equal(readOptimization(split, 5, 2).multiStore.savings, null);
  const none = fixture(); none.comparison.eligibleBranches = []; none.comparison.cheapestBranchIds = [];
  none.comparison.outcome = 'no_complete_branches'; none.multiStore = { status: 'no_solution', solution: null, savings: null };
  assert.equal(readOptimization(none, 5, 2).multiStore.status, 'no_solution');
  assert.equal(readOptimization(fixture(1), 5, 1).multiStore.savings!.amountUsd, '0.00');
});
test('private optimization API sends correct list, token, signal and maximum branch query', async () => {
  for (const max of [1, 2, 3]) {
    let called = false;
    const client = createApiClient({ baseUrl: () => 'http://localhost/api', fetch: async (input, options) => {
      assert.equal(String(input), `http://localhost/api/shopping-lists/5/optimization?maxStores=${max}`);
      assert.equal((options?.headers as Record<string, string>).Authorization, `Bearer ${token}`);
      assert.ok(options?.signal); called = true;
      return new Response(JSON.stringify(fixture(max)), { status: 200 });
    } });
    const lists = createListApi((operation, signal) => operation(token, signal ?? new AbortController().signal), client);
    assert.equal((await lists.optimize(5, max)).maximumStores, max); assert.ok(called);
    assert.throws(() => lists.optimize(5, 4));
    assert.throws(() => lists.optimize(0, max));
  }
});
test('optimization network/server/empty/limit errors offer meaningful retry guidance', async () => {
  for (const status of [400, 404, 422, 500]) {
    const client = createApiClient({ baseUrl: () => 'http://localhost/api', fetch: async () => new Response('{}', { status }) });
    const lists = createListApi(operation => operation(token, new AbortController().signal), client);
    await assert.rejects(lists.optimize(5), (e: unknown) => e instanceof ApiError && e.status === status
      && (status !== 422 || e.message.includes('fewer branches')));
  }
});
test('optimization 401 invalidates the current private session', async () => {
  const client = createApiClient({ baseUrl: () => 'http://localhost/api', fetch: async () => new Response('{}', { status: 401 }) });
  const session = createSession({ get: async () => token, set: async () => {}, remove: async () => {} }, {
    me: async () => ({ id: 1, displayName: 'Demo', email: 'demo@example.com' }),
    login: async () => { throw new Error(); }, register: async () => { throw new Error(); }, logout: async () => {},
  });
  await session.restore();
  await assert.rejects(createListApi(session.run, client).optimize(5));
  assert.equal(session.getState().status, 'guest');
});
test('resource refreshes optimization after focus/quantity changes and rejects a late prior-list result', async () => {
  let release!: (v: string) => void;
  const states: { key: string; data: string | null }[] = [];
  const resource = createResource<string>(s => states.push(s), () => false);
  resource.start('list:5:2', async () => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  resource.start('list:6:2', async () => 'new list');
  await new Promise(resolve => setImmediate(resolve));
  release('old list'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1)!.data, 'new list');
  resource.cancel(); resource.start('list:6:2', async () => 'updated quantity');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1)!.data, 'updated quantity');
  resource.start('list:6:2', async () => 'manual refresh'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1)!.data, 'manual refresh'); resource.cancel();
});
test('native optimization navigation uses established safe-area/header and focus refresh conventions', () => {
  const screen = readFileSync('app/lists/[id]/optimization.tsx', 'utf8');
  const details = readFileSync('app/lists/[id].tsx', 'utf8');
  assert.match(details, /title="Find Cheapest Basket"/); assert.match(details, /pathname: '\/lists\/\[id\]\/optimization'/);
  assert.match(screen, /<PageHeader/); assert.match(screen, /<AuthGate>/); assert.match(screen, /<AccountPage>/);
  assert.match(screen, /useState\(2\)/); assert.match(screen, /useRemote/); assert.match(screen, /state.version.*id.*maximum/);
  assert.match(screen, /Refresh optimization/);
});
