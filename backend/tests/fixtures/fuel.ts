import type { BasketSnapshot } from '../../src/modules/basket/repository.js';
import type { TripRequest } from '../../src/modules/basket/trip.js';
import type { RoutingAdapter } from '../../src/modules/journeys/routing.js';

const date = '2026-11-22T12:00:00.000000Z';
export function fuelSnapshot(matrix: (string | null)[][], quantities = matrix[0].map(() => 1)): BasketSnapshot {
  return { shoppingList: { id: 5, name: 'Fuel test basket', createdAt: date, updatedAt: date,
    items: quantities.map((quantity, i) => ({ id: i + 1, productId: i + 1, quantity, createdAt: date, updatedAt: date,
      product: { id: i + 1, name: `Test product ${i + 1}`, brand: 'Fixture', variant: '', size: 1, unit: 'piece', packQuantity: 1, category: 'Test', imageUrl: null, isActive: true } })) },
    branches: matrix.map((_, i) => ({ branchId: i + 1, supermarketId: 1, supermarket: 'Test chain', branch: `Test branch ${i + 1}` })),
    locations: matrix.map((_, i) => ({ branchId: i + 1, latitude: 34.002 + i * 0.002, longitude: 35.6 })),
    prices: matrix.flatMap((row, b) => row.flatMap((price, p) => price === null ? [] : [{ productId: p + 1, branchId: b + 1, originalPrice: price, originalCurrency: 'USD' as const, observedAt: date }])) };
}
export const tripInput = (): TripRequest => ({ journey: { origin: { latitude: 34, longitude: 35.6 }, destination: { latitude: 34.02, longitude: 35.6 }, waypoints: [], maxDetourMinutes: 30 },
  maxStores: 3, fuel: { consumption: '10', price: '1', currency: 'USD' } });
export function fuelRouting(snapshot: BasketSnapshot, meters: (order: number[]) => number = () => 20000): RoutingAdapter {
  return { route: async (points, geometry) => geometry ? { distanceMeters: 10000, durationSeconds: 100, geometry: points.map(p => [p.longitude, p.latitude]) }
    : { distanceMeters: meters(points.slice(1, -1).flatMap(p => {
      const b = snapshot.locations!.find(b => b.latitude === p.latitude && b.longitude === p.longitude); return b ? [b.branchId] : [];
    })), durationSeconds: 200, geometry: null } };
}
