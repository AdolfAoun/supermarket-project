import { compareBasket } from '../../backend/src/modules/basket/compare';
import type { BasketSnapshot } from '../../backend/src/modules/basket/repository';

export const stamp = '2026-01-15T12:00:00.000000Z';
export const user = { id: 1, displayName: 'Demo', email: 'demo@example.com' };
export const token = 'a'.repeat(64);
export const summary = { id: 5, name: 'Weekly', createdAt: stamp, updatedAt: stamp };
export const listItem = { id: 9, productId: 1, quantity: 2, createdAt: stamp, updatedAt: stamp,
  product: { id: 1, name: 'Coca-Cola', brand: 'Coca-Cola', variant: 'Original', size: 1.5, unit: 'L', packQuantity: 1,
    category: 'Beverages', imageUrl: null, isActive: true } };
export function basketFixture() {
  const data: BasketSnapshot = { shoppingList: { ...summary, items: [structuredClone(listItem)] },
    branches: [1, 2, 3].map(branchId => ({ branchId, branch: `Branch ${branchId}`, supermarket: 'Demo', supermarketId: 1 })),
    prices: [1, 2].map(branchId => ({ branchId, productId: 1, originalPrice: '1.00', originalCurrency: 'USD', observedAt: stamp })) };
  return compareBasket(data);
}
