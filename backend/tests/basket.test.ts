import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { HttpError } from '../src/middleware/errors.js';
import { compareBasket, availabilityNotice } from '../src/modules/basket/compare.js';
import type { BasketSnapshot, BasketPrice, BasketRepository } from '../src/modules/basket/repository.js';
import type { ListItem } from '../src/modules/shopping-lists/repository.js';
import type { AuthRepository } from '../src/modules/auth/repository.js';

function item(productId: number, quantity = 1, isActive = true): ListItem {
  return { id: productId, productId, quantity, createdAt: '2026-01-01T00:00:00.000000Z', updatedAt: '2026-01-01T00:00:00.000000Z',
    product: { id: productId, name: 'Coca-Cola', brand: 'Coca-Cola', variant: 'Original', size: productId === 1 ? 1.5 : 330,
      unit: productId === 1 ? 'L' : 'ml', packQuantity: 1, category: 'Beverages', imageUrl: null, isActive } };
}
const price = (branchId: number, productId: number, originalPrice: string, originalCurrency = 'USD'): BasketPrice =>
  ({ branchId, productId, originalPrice, originalCurrency, observedAt: '2026-01-15T12:00:00.000000Z' });
function snapshot(prices: BasketPrice[], items = [item(1, 2), item(2, 3)]): BasketSnapshot {
  return { shoppingList: { id: 5, name: 'Weekly', createdAt: '2026-01-01T00:00:00.000000Z', updatedAt: '2026-01-01T00:00:00.000000Z', items },
    branches: [3, 1, 2].map(branchId => ({ branchId, branch: `Branch ${branchId}`, supermarketId: 1, supermarket: 'Demo chain' })), prices };
}
test('only complete branches rank; cheaper incomplete subtotals can never win', () => {
  const result = compareBasket(snapshot([price(1, 1, '2.00'), price(1, 2, '1.00'),
    price(2, 1, '1.00'), price(2, 2, '1.00'), price(3, 1, '0.01')]));
  assert.equal(result.outcome, 'complete');
  assert.deepEqual(result.eligibleBranches.map(b => [b.branchId, b.totalUsd, b.rank]), [[2, '5.00', 1], [1, '7.00', 2]]);
  assert.deepEqual(result.cheapestBranchIds, [2]);
  assert.deepEqual(result.incompleteBranches.map(b => [b.branchId, b.missingProductIds]), [[3, [2]]]);
  assert.equal('totalUsd' in result.incompleteBranches[0], false);
  assert.equal(result.eligibleBranches[0].items[0].quantity, 2);
  assert.equal(result.eligibleBranches[0].items[1].lineTotalUsd, '3.00');
});
test('all missing prices return empty ranking and explicit diagnostics for every branch', () => {
  const result = compareBasket(snapshot([]));
  assert.equal(result.outcome, 'no_complete_branches');
  assert.deepEqual(result.eligibleBranches, []); assert.deepEqual(result.cheapestBranchIds, []);
  assert.deepEqual(result.incompleteBranches.map(b => [b.branchId, b.missingProductIds]), [[1, [1, 2]], [2, [1, 2]], [3, [1, 2]]]);
});
test('branches with disjoint coverage are not combined even within the same chain', () => {
  const result = compareBasket(snapshot([price(1, 1, '1.00'), price(2, 2, '1.00')]));
  assert.deepEqual(result.eligibleBranches, []);
  assert.equal(result.incompleteBranches.length, 3);
});
test('canonical sizes stay distinct and unrelated product prices cannot cover missing items', () => {
  const result = compareBasket(snapshot([price(1, 1, '1.00'), price(1, 77, '0.01')]));
  assert.deepEqual(result.shoppingList.items.map(i => [i.productId, i.product.size]), [[1, 1.5], [2, 330]]);
  assert.deepEqual(result.incompleteBranches[0].missingProductIds, [2]);
});
test('exact mixed-currency ties use branch ID ordering and dense ranks', () => {
  const result = compareBasket(snapshot([price(3, 1, '180000.00', 'LBP'), price(2, 1, '1.00'), price(1, 1, '90000.00', 'LBP')], [item(1)]));
  assert.deepEqual(result.eligibleBranches.map(b => [b.branchId, b.totalUsd, b.rank]), [[1, '1.00', 1], [2, '1.00', 1], [3, '2.00', 2]]);
  assert.deepEqual(result.cheapestBranchIds, [1, 2]);
  assert.equal(result.eligibleBranches[0].items[0].originalPrice, '90000.00');
  assert.equal(result.eligibleBranches[0].items[0].originalCurrency, 'LBP');
});
test('premature unit rounding would choose the wrong branch; exact totals choose correctly', () => {
  // A: .0049 + .0049 = .0098 USD; rounded units would sum to .00.
  // B: .0001 + .0096 = .0097 USD; rounded units would sum to .01.
  // Exact B must win even though prematurely rounded prices would choose A.
  const result = compareBasket(snapshot([price(1, 1, '441.00', 'LBP'), price(1, 2, '441.00', 'LBP'),
    price(2, 1, '9.00', 'LBP'), price(2, 2, '864.00', 'LBP')], [item(1), item(2)]));
  assert.deepEqual(result.cheapestBranchIds, [2]);
  assert.deepEqual(result.eligibleBranches.map(b => [b.totalUsd, b.totalUsdUnits, b.rank]), [['0.01', '87300', 1], ['0.01', '88200', 2]]);
});
test('quantity multiplication happens before rounding, and tied display totals are not exact ties', () => {
  const result = compareBasket(snapshot([price(1, 1, '300.00', 'LBP'), price(2, 1, '360.00', 'LBP')], [item(1, 3)]));
  assert.deepEqual(result.eligibleBranches.map(b => [b.totalUsd, b.totalUsdUnits]), [['0.01', '90000'], ['0.01', '108000']]);
  assert.deepEqual(result.cheapestBranchIds, [1]);
});
test('inactive products block the entire basket without losing required identities or quantities', () => {
  const data = snapshot([price(1, 1, '1.00')], [item(1), item(2, 3, false)]);
  const result = compareBasket(data);
  assert.equal(result.outcome, 'inactive_products'); assert.deepEqual(result.inactiveProductIds, [2]);
  assert.deepEqual(result.eligibleBranches, []); assert.deepEqual(result.cheapestBranchIds, []);
  assert.equal(result.shoppingList.items[1].quantity, 3);
});
test('empty list returns 400; no catalog branches returns no recommendation', () => {
  assert.throws(() => compareBasket(snapshot([], [])), (error: unknown) => error instanceof HttpError && error.status === 400);
  const data = snapshot([]); data.branches = [];
  assert.deepEqual(compareBasket(data).cheapestBranchIds, []);
});
test('metadata contains one availability notice, fixed conversion, demonstration and freshness indicators', () => {
  const result = compareBasket(snapshot([price(1, 1, '1.00')], [item(1)]));
  assert.equal(result.availabilityNotice, availabilityNotice);
  assert.equal(JSON.stringify(result).split(availabilityNotice).length, 2);
  assert.equal(result.demonstrationData, true); assert.equal(result.freshness, 'not_evaluated');
  assert.equal(result.exchangeRate.quotePerBase, '90000');
  assert.equal(result.monetaryPolicy.usdUnitDenominator, '9000000');
  assert.equal(result.eligibleBranches[0].items[0].observedAt, '2026-01-15T12:00:00.000000Z');
});
test('deterministic sorting does not mutate snapshot input; duplicate selected prices fail closed', () => {
  const data = snapshot([price(3, 1, '1.00'), price(1, 1, '1.00'), price(2, 1, '1.00')], [item(1)]);
  const before = structuredClone(data);
  assert.deepEqual(compareBasket(data), compareBasket({ ...data, prices: [...data.prices].reverse(), branches: [...data.branches].reverse() }));
  assert.deepEqual(data, before);
  assert.throws(() => compareBasket(snapshot([price(1, 1, '1.00'), price(1, 1, '2.00')])));
});

const token = 'a'.repeat(64);
const auth: AuthRepository = {
  register: async () => { throw new Error(); }, findAccount: async () => null,
  createSession: async () => '', logout: async () => {},
  authenticate: async () => ({ id: 7, displayName: 'Demo', email: 'demo@example.com' }),
};
const app = (repository: BasketRepository) => createApp(async () => {}, [], undefined, auth, undefined, repository);
test('basket HTTP route authenticates, validates IDs and rejects client overrides before lookup', async () => {
  const application = app({ snapshot: async () => { throw new Error('Must not query'); } });
  await request(application).get('/api/shopping-lists/1/compare').expect(401);
  await request(application).get('/api/shopping-lists/1/compare').set('Authorization', 'Bearer invalid').expect(401);
  for (const id of ['0', '01', '-1', '1e2', '1.5', '4294967296', '%E0%A4%A']) {
    await request(application).get(`/api/shopping-lists/${id}/compare`).set('Authorization', `Bearer ${token}`).expect(400);
  }
  for (const query of ['userId=9', 'price=1', 'total=0', 'currency=EUR']) {
    await request(application).get(`/api/shopping-lists/1/compare?${query}`).set('Authorization', `Bearer ${token}`).expect(400);
  }
  await request(application).get('/api/shopping-lists/1/compare').set('Authorization', `Bearer ${token}`).send({ total: 0 }).expect(400);
});
test('HTTP uses session owner, returns serializable exact totals and no-store', async () => {
  const response = await request(app({ snapshot: async (owner, id) => {
    assert.equal(owner, 7); assert.equal(id, 5);
    return snapshot([price(1, 1, '90000.00', 'LBP')], [item(1)]);
  } })).get('/api/shopping-lists/5/compare').set('Authorization', `Bearer ${token}`).expect(200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.eligibleBranches[0].totalUsd, '1.00');
  assert.equal(response.body.eligibleBranches[0].totalUsdUnits, '9000000');
});
test('HTTP maps empty/missing/foreign lists and unexpected monetary/SQL errors safely', async () => {
  for (const status of [400, 404] as const) {
    await request(app({ snapshot: async () => { throw new HttpError(status, 'Safe message'); } }))
      .get('/api/shopping-lists/1/compare').set('Authorization', `Bearer ${token}`).expect(status);
  }
  for (const value of ['1.001', 'NaN']) {
    const response = await request(app({ snapshot: async () => snapshot([price(1, 1, value)], [item(1)]) }))
      .get('/api/shopping-lists/1/compare').set('Authorization', `Bearer ${token}`).expect(500);
    assert.deepEqual(response.body, { status: 'error', message: 'Internal server error' });
  }
  const response = await request(app({ snapshot: async () => { throw new Error('private SQL password'); } }))
    .get('/api/shopping-lists/1/compare').set('Authorization', `Bearer ${token}`).expect(500);
  assert.deepEqual(response.body, { status: 'error', message: 'Internal server error' });
});
