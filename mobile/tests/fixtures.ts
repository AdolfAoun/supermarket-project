import type { Schedule } from '../services/api';

export const product = { id: 1, name: 'Coca-Cola', brand: 'Coca-Cola', variant: 'Original', size: 1.5,
  unit: 'L', packQuantity: 1, category: 'Beverages', imageUrl: null };
export const smallProduct = { ...product, id: 2, size: 330, unit: 'ml' };
export const price = { supermarketId: 1, supermarket: 'Demo chain', branchId: 1, branch: 'Demo branch',
  price: '1.60', currency: 'USD', observedAt: '2026-01-15T12:00:00.000000Z',
  status: 'verified', demonstrationData: true, availability: 'check_with_store' };
export const comparison = { productId: 1, displayCurrency: 'USD', demonstrationData: true,
  dataLabel: 'DEMONSTRATION DATA: illustrative amounts', freshness: 'not_evaluated',
  availability: 'check_with_store', prices: [price, { ...price, branchId: 2, branch: 'Second branch' },
    { ...price, branchId: 3, price: '2.00' }] };
export const supermarkets = { supermarkets: [{ id: 1, name: 'Demo chain', branches: [
  { id: 1, name: 'Branch', address: null, latitude: null, longitude: null },
  { id: 2, name: 'Branch', address: 'Address', latitude: 33.8, longitude: 35.5 },
] }, { id: 2, name: 'Empty chain', branches: [] }] };
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export function manualClock() {
  const tasks = new Set<() => void>();
  const schedule: Schedule = (callback, _ms) => { tasks.add(callback); return () => { tasks.delete(callback); }; };
  return { schedule, get size() { return tasks.size; }, fire() {
    const active = [...tasks]; tasks.clear(); active.forEach(callback => callback());
  } };
}
