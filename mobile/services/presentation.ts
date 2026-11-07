import type { Comparison, ComparisonPrice, Product } from './contracts';

export function packageLabel(product: Product): string {
  return `${product.packQuantity > 1 ? `${product.packQuantity} × ` : ''}${product.size} ${product.unit}`;
}
export function productRoute(id: number) { return { pathname: '/products/[id]' as const, params: { id: String(id) } }; }
export function priceRoute(id: number) { return { pathname: '/products/[id]/prices' as const, params: { id: String(id) } }; }
export function isLowestDisplayed(comparison: Comparison, price: ComparisonPrice): boolean {
  return comparison.prices.length > 0 && price.price === comparison.prices[0].price;
}
export function observedLabel(timestamp: string): string { return `${timestamp.slice(0, 10)} ${timestamp.slice(11, 19)} UTC`; }
