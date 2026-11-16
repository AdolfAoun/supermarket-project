import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { optimizeBasket, generateBasketCandidates } from '../src/modules/basket/optimize.js';
import type { BasketSnapshot, BasketPrice, BasketRepository } from '../src/modules/basket/repository.js';
import type { AuthRepository } from '../src/modules/auth/repository.js';
import { HttpError } from '../src/middleware/errors.js';

export const observedAt = '2026-11-01T12:00:00.000000Z';
const now = new Date('2026-11-15T12:00:00Z');
export function fixture(matrix: (string | null)[][] = [['2.00', '1.50', '3.00'], ['1.80', '1.40', '3.50']], quantities = [2, 1, 1]): BasketSnapshot {
  return { shoppingList: { id: 5, name: 'Weekly', createdAt: observedAt, updatedAt: observedAt,
    items: quantities.map((quantity, i) => ({ id: i + 1, productId: i + 1, quantity, createdAt: observedAt, updatedAt: observedAt,
      product: { id: i + 1, name: ['Milk', 'Bread', 'Eggs'][i] ?? `Product ${i + 1}`, brand: 'Demo', variant: '',
        size: i + 1, unit: 'piece', packQuantity: 1, category: 'Test', imageUrl: null, isActive: true } })) },
    branches: matrix.map((_, i) => ({ branchId: i + 1, branch: `Branch ${i + 1}`, supermarketId: 1, supermarket: 'Demo chain' })),
    prices: matrix.flatMap((row, i) => row.flatMap((price, j): BasketPrice[] => price === null ? [] : [{ branchId: i + 1, productId: j + 1,
      originalPrice: price, originalCurrency: 'USD', observedAt }])) };
}
const optimize = (data = fixture(), max = 2) => optimizeBasket(data, max, now);

test('independently calculated example: tied $8.50 singles, $8 split and 5.88% savings', () => {
  const result = optimize();
  assert.deepEqual(result.comparison.eligibleBranches.map(b => [b.branchId, b.totalUsd, b.rank]), [[1, '8.50', 1], [2, '8.50', 1]]);
  assert.deepEqual(result.comparison.cheapestBranchIds, [1, 2]);
  assert.equal(result.multiStore.solution!.totalUsd, '8.00');
  assert.deepEqual(result.multiStore.solution!.allocations.map(b => [b.branchId, b.subtotalUsd, b.items.map(i => [i.productId, i.quantity])]),
    [[1, '3.00', [[3, 1]]], [2, '5.00', [[1, 2], [2, 1]]]]);
  assert.deepEqual(result.multiStore.savings, { amountUsd: '0.50', amountUsdUnits: '4500000', percentage: '5.88' });
});
test('cheap partial branches can form optimum, never a single-store recommendation', () => {
  const result = optimize(fixture([['5.00', '5.00'], ['0.01', null], [null, '0.01']], [1, 1]));
  assert.equal(result.comparison.eligibleBranches[0].totalUsd, '10.00');
  assert.deepEqual(result.multiStore.solution!.branchIds, [2, 3]);
  assert.equal(result.multiStore.solution!.totalUsd, '0.02');
});
test('disjoint branches give complete split without single baseline; quantities stay intact', () => {
  const result = optimize(fixture([['2.00', null], [null, '3.00']], [5, 2]));
  assert.equal(result.comparison.eligibleBranches.length, 0);
  assert.equal(result.multiStore.solution!.totalUsd, '16.00'); assert.equal(result.multiStore.savings, null);
  assert.deepEqual(result.multiStore.solution!.allocations.flatMap(b => b.items.map(i => i.quantity)), [5, 2]);
});
test('one/two/three branch limits distinguish coverage and exact cost', () => {
  const data = fixture([['1.00', null, null], [null, '1.00', null], [null, null, '1.00']]);
  assert.equal(optimize(data, 1).multiStore.status, 'no_solution');
  assert.equal(optimize(data, 2).multiStore.status, 'no_solution');
  assert.deepEqual(optimize(data, 2).missingProductIds, []);
  assert.equal(optimize(data, 3).multiStore.solution!.totalUsd, '4.00');
  assert.equal(optimize(data, 3).multiStore.savings, null);
});
test('one product, one branch, identical prices and zero savings prefer one lowest-ID branch', () => {
  for (const matrix of [[['2.00']], [['2.00'], ['2.00'], ['2.00']]]) {
    const result = optimize(fixture(matrix, [3]), 3);
    assert.deepEqual(result.multiStore.solution!.branchIds, [1]);
    assert.equal(result.multiStore.solution!.totalUsd, '6.00');
    assert.equal(result.multiStore.savings!.amountUsd, '0.00'); assert.equal(result.multiStore.savings!.percentage, '0.00');
  }
});
test('no prices or catalog branches yields no solution and named coverage gaps', () => {
  for (const matrix of [[[null, null]], []]) {
    const result = optimize(fixture(matrix, [1, 1]));
    assert.equal(result.multiStore.status, 'no_solution'); assert.equal(result.multiStore.solution, null);
    assert.deepEqual(result.missingProductIds, [1, 2]); assert.equal(result.multiStore.savings, null);
  }
});
test('fixed mixed currency precision and sub-cent savings are never prematurely rounded', () => {
  const data = fixture([['441.00', '441.00'], ['9.00', '864.00']], [1, 1]);
  data.prices.forEach(p => { p.originalCurrency = 'LBP'; });
  const result = optimize(data);
  assert.equal(result.comparison.eligibleBranches[0].branchId, 2);
  assert.equal(result.multiStore.solution!.totalUsdUnits, '45000'); // .005 USD, not .00 + .00
  assert.equal(result.multiStore.solution!.totalUsd, '0.01');
  assert.equal(result.multiStore.savings!.amountUsdUnits, '42300');
  assert.equal(result.multiStore.savings!.amountUsd, '0.00');
  assert.equal(result.multiStore.savings!.percentage, '48.45');
});
test('one cent savings are reported as merchandise only; quantity multiplication is exact', () => {
  const result = optimize(fixture([['1.00', '1.00'], ['0.99', '2.00']], [1, 1]));
  assert.equal(result.multiStore.savings!.amountUsd, '0.01');
  assert.equal(result.fuelCostsIncluded, false); assert.equal(result.availabilityGuaranteed, false);
});
test('freshness is derived with an injectable clock and threshold; old observations stay eligible', () => {
  const data = fixture([['1.00', '1.00', '1.00']]);
  data.prices[0].observedAt = '2026-01-01T12:00:00.000000Z';
  data.prices[1].observedAt = '2027-01-01T12:00:00.000000Z';
  const result = optimize(data);
  assert.deepEqual(result.multiStore.solution!.allocations[0].items.map(l => l.freshness), ['older', 'future', 'recent']);
  assert.ok(result.multiStore.solution!.allocations[0].items.every(l => l.availability === 'unknown' && l.demonstrationData));
  assert.equal(optimizeBasket(data, 2, now, { freshnessDays: 1, maxWork: 1000 }).comparison.eligibleBranches[0].items[2].freshness, 'older');
});
test('inactive items are explicitly excluded without mutating persisted items', () => {
  const data = fixture(); data.shoppingList.items[0].product.isActive = false;
  const before = structuredClone(data), result = optimize(data);
  assert.deepEqual(result.excludedItems.map(i => i.productId), [1]);
  assert.equal(result.multiStore.solution!.totalUsd, '4.40');
  assert.deepEqual(data, before);
  data.shoppingList.items.forEach(i => { i.product.isActive = false; });
  assert.throws(() => optimize(data), (e: unknown) => e instanceof HttpError && e.status === 400);
});
test('empty, duplicate, invalid quantities, mismatched identities and duplicate selected prices fail safely', () => {
  assert.throws(() => optimize(fixture([], [])));
  for (const quantity of [0, -1, 1.5, 1000, NaN]) assert.throws(() => optimize(fixture([['1.00']], [quantity])));
  const duplicate = fixture(); duplicate.shoppingList.items.push(duplicate.shoppingList.items[0]); assert.throws(() => optimize(duplicate));
  const wrong = fixture(); wrong.shoppingList.items[0].product.id = 7; assert.throws(() => optimize(wrong));
  const prices = fixture(); prices.prices.push(prices.prices[0]); assert.throws(() => optimize(prices));
  const branches = fixture(); branches.branches.push(branches.branches[0]); assert.throws(() => optimize(branches));
});
test('unrelated package and wrong-branch prices cannot cover a required product', () => {
  const data = fixture([[null]], [1]);
  data.prices.push({ branchId: 1, productId: 2, originalPrice: '0.01', originalCurrency: 'USD', observedAt },
    { branchId: 99, productId: 1, originalPrice: '0.01', originalCurrency: 'USD', observedAt });
  assert.equal(optimize(data).multiStore.status, 'no_solution');
});
test('computation safety limit rejects explicitly without silently dropping candidates', () => {
  assert.throws(() => optimizeBasket(fixture(), 2, now, { freshnessDays: 30, maxWork: 1 }),
    (e: unknown) => e instanceof HttpError && e.status === 422);
});
test('all candidate solutions remain available for future travel evaluation', () => {
  const line = optimize(fixture([['1.00']], [1])).comparison.eligibleBranches[0].items[0];
  const moreExpensiveLine = optimize(fixture([['2.00']], [1])).comparison.eligibleBranches[0].items[0];
  const candidates = [...generateBasketCandidates([1, 2].map(branchId => ({ branchId, branch: String(branchId), supermarketId: 1,
    supermarket: 'Demo', lines: new Map([[1, branchId === 1 ? line : moreExpensiveLine]]) })), [1], 2)];
  assert.ok(candidates.some(c => c.branchIds[0] === 1 && c.totalUsd === '1.00'));
  // A future travel evaluator must still see this costlier grocery option:
  // its lower travel/fuel cost could make it cheapest overall.
  assert.ok(candidates.some(c => c.branchIds[0] === 2 && c.totalUsd === '2.00'));
});
test('deterministic generated cases reconcile, preserve quantities, obey limits and improve monotonically', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const matrix = Array.from({ length: 5 }, (_, b) => Array.from({ length: 4 }, (_, p) =>
      (seed + b * 3 + p) % 5 === 0 ? null : `${1 + ((seed * (b + 1) + p * 3) % 9)}.00`));
    const data = fixture(matrix, [1, 2, 3, 4]);
    let previous: bigint | null = null;
    for (const max of [1, 2, 3]) {
      const result = optimize(data, max), solution = result.multiStore.solution;
      // Independent small exhaustive oracle enumerates product assignments,
      // rather than copying the engine's branch-combination algorithm.
      let oracle = Infinity;
      function assign(product: number, stores: Set<number>, dollars: number) {
        if (product === 4) { oracle = Math.min(oracle, dollars); return; }
        for (let b = 0; b < matrix.length; b++) {
          const amount = matrix[b][product];
          const next = new Set([...stores, b]);
          if (amount !== null && next.size <= max) assign(product + 1, next, dollars + Number(amount) * (product + 1));
        }
      }
      assign(0, new Set(), 0);
      assert.equal(solution?.totalUsd ?? null, Number.isFinite(oracle) ? oracle.toFixed(2) : null);
      if (!solution) continue;
      const total = BigInt(solution.totalUsdUnits);
      if (previous !== null) assert.ok(total <= previous); previous = total;
      assert.ok(solution.branchIds.length <= max);
      assert.deepEqual(solution.allocations.flatMap(b => b.items.map(i => i.productId)).sort(), [1, 2, 3, 4]);
      assert.equal(solution.allocations.reduce((sum, b) => sum + BigInt(b.subtotalUsdUnits), 0n), total);
      for (const b of solution.allocations) for (const l of b.items) {
        assert.equal(BigInt(l.lineTotalUsdUnits), BigInt(l.unitPriceUsdUnits) * BigInt(l.quantity));
        assert.equal(l.originalPrice, matrix[b.branchId - 1][l.productId - 1]);
      }
      const reverse = structuredClone(data); reverse.branches.reverse(); reverse.prices.reverse(); reverse.shoppingList.items.reverse();
      assert.deepEqual(optimize(reverse, max), result);
    }
  }
});
test('bounded synthetic workloads: 10/5, 30/10, 50/20 and 100/50 at two and three stores', t => {
  for (const [products, branches] of [[10, 5], [30, 10], [50, 20], [100, 50]]) {
    const data = fixture(Array.from({ length: branches }, (_, b) => Array.from({ length: products }, (_, p) => `${1 + (b + p) % 9}.00`)), Array(products).fill(2));
    for (const max of [2, 3]) {
      const started = performance.now(), result = optimize(data, max);
      assert.equal(result.multiStore.status, 'complete');
      t.diagnostic(`${products} products/${branches} branches, max=${max}: ${(performance.now() - started).toFixed(1)} ms`);
    }
  }
});

const token = 'a'.repeat(64);
const auth: AuthRepository = { register: async () => { throw new Error(); }, findAccount: async () => null,
  createSession: async () => '', logout: async () => {}, authenticate: async () => ({ id: 7, displayName: 'Demo', email: 'demo@example.com' }) };
const app = (repository: BasketRepository, authentication = auth) => createApp(async () => {}, [], undefined, authentication, undefined, repository);
const url = '/api/shopping-lists/5/optimization';
test('optimization HTTP rejects unauthenticated, invalid, expired and revoked sessions', async () => {
  const application = app({ snapshot: async () => { throw new Error('must not read'); } });
  await request(application).get(url).expect(401);
  await request(application).get(url).set('Authorization', 'Bearer bad').expect(401);
  await request(app({ snapshot: async () => fixture() }, { ...auth, authenticate: async () => null })).get(url).set('Authorization', `Bearer ${token}`).expect(401);
});
test('optimization HTTP strictly validates query parameters, IDs and bodies before reading', async () => {
  const application = app({ snapshot: async () => { throw new Error('must not read'); } });
  for (const query of ['maxStores=0', 'maxStores=4', 'maxStores=02', 'maxStores=2.0', 'maxStores=2&maxStores=3', 'maxStores[]=2', 'userId=1', 'maxStores=', 'total=0']) {
    await request(application).get(`${url}?${query}`).set('Authorization', `Bearer ${token}`).expect(400);
  }
  for (const id of ['0', '01', '4294967296', '%E0%A4%A']) await request(application).get(`/api/shopping-lists/${id}/optimization`).set('Authorization', `Bearer ${token}`).expect(400);
  await request(application).get(url).set('Authorization', `Bearer ${token}`).send({ userId: 1 }).expect(400);
});
test('optimization HTTP derives owner, defaults to two stores and serializes exact results with no-store', async () => {
  const application = app({ snapshot: async (owner, id) => { assert.equal(owner, 7); assert.equal(id, 5); return fixture(); } });
  for (const maximum of [undefined, 1, 2, 3]) {
    const result = await request(application).get(url + (maximum ? `?maxStores=${maximum}` : '')).set('Authorization', `Bearer ${token}`).expect(200);
    assert.equal(result.headers['cache-control'], 'no-store'); assert.equal(result.body.maximumStores, maximum ?? 2);
    assert.equal(result.body.multiStore.solution.totalUsd, maximum === 1 ? '8.50' : '8.00');
  }
});
test('optimization HTTP conceals foreign/deleted lists and sanitizes database/corruption errors', async () => {
  for (const status of [404, 400, 422] as const) {
    await request(app({ snapshot: async () => { throw new HttpError(status, 'Safe message'); } })).get(url).set('Authorization', `Bearer ${token}`).expect(status);
  }
  const response = await request(app({ snapshot: async () => { throw new Error('SQL password internal'); } })).get(url).set('Authorization', `Bearer ${token}`).expect(500);
  assert.deepEqual(response.body, { status: 'error', message: 'Internal server error' });
});
