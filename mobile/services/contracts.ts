// Network data is unknown until these small contract readers accept it.
export interface Product {
  id: number; name: string; brand: string; variant: string; size: number;
  unit: string; packQuantity: number; category: string; imageUrl: string | null;
}
export interface Branch {
  id: number; name: string; address: string | null;
  latitude: number | null; longitude: number | null;
}
export interface Supermarket { id: number; name: string; branches: Branch[] }
export interface ComparisonPrice {
  supermarketId: number; supermarket: string; branchId: number; branch: string;
  price: string; currency: 'USD'; observedAt: string; status: 'verified';
  demonstrationData: boolean; availability: 'check_with_store';
}
export interface Comparison {
  productId: number; displayCurrency: 'USD'; demonstrationData: boolean; dataLabel: string;
  freshness: 'not_evaluated'; availability: 'check_with_store'; prices: ComparisonPrice[];
}

export class InvalidPayload extends Error {}
function invalid(): never { throw new InvalidPayload('Invalid API response'); }
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : invalid();
}
function text(value: unknown, empty = false): string {
  return typeof value === 'string' && (empty || value.trim().length > 0) ? value : invalid();
}
function positive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : invalid();
}
function id(value: unknown): number {
  return Number.isInteger(value) && positive(value) <= 4294967295 ? value as number : invalid();
}
function bool(value: unknown): boolean { return typeof value === 'boolean' ? value : invalid(); }
function literal<T extends string>(value: unknown, expected: T): T { return value === expected ? expected : invalid(); }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid(); }
function unique<T>(values: T[], key: (value: T) => number): T[] {
  if (new Set(values.map(key)).size !== values.length) invalid();
  return values;
}
function image(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const url = text(value, true);
  if (!url.trim()) return null;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? url : null;
  } catch { return null; } // An unusable optional image must not hide a valid product.
}
function readProduct(value: unknown): Product {
  const row = object(value);
  const packQuantity = positive(row.packQuantity);
  if (!Number.isInteger(packQuantity) || packQuantity > 65535) invalid();
  return {
    id: id(row.id), name: text(row.name), brand: text(row.brand), variant: text(row.variant, true),
    size: positive(row.size), unit: text(row.unit), packQuantity,
    category: text(row.category), imageUrl: image(row.imageUrl),
  };
}
export function readProducts(value: unknown): Product[] {
  const rows = array(object(value).products);
  if (rows.length > 100) invalid();
  return unique(rows.map(readProduct), row => row.id);
}
export function readProductDetails(value: unknown, expectedId: number): Product {
  const product = readProduct(object(value).product);
  return product.id === expectedId ? product : invalid();
}
function amount(value: unknown): string {
  return typeof value === 'string' && /^(0|[1-9]\d{0,9})\.\d{2}$/.test(value) && value !== '0.00'
    ? value : invalid();
}
// Compare validated decimal strings exactly, without floating-point arithmetic.
function compareAmounts(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}
function timestamp(value: unknown): string {
  const s = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(s)) invalid();
  // The API preserves MySQL microseconds; ECMAScript guarantees parsing only
  // millisecond precision. Validate the calendar with a portable ISO string.
  const date = new Date(`${s.slice(0, 23)}Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== s.slice(0, 19)) invalid();
  return s;
}
export function readComparison(value: unknown, expectedId: number): Comparison {
  const row = object(value);
  const demonstrationData = bool(row.demonstrationData);
  const dataLabel = text(row.dataLabel);
  if (id(row.productId) !== expectedId || (demonstrationData && !dataLabel.startsWith('DEMONSTRATION DATA'))) invalid();
  const prices = unique(array(row.prices).map(value => {
    const price = object(value);
    if (bool(price.demonstrationData) !== demonstrationData) invalid();
    return {
      supermarketId: id(price.supermarketId), supermarket: text(price.supermarket),
      branchId: id(price.branchId), branch: text(price.branch), price: amount(price.price),
      currency: literal(price.currency, 'USD'), observedAt: timestamp(price.observedAt),
      status: literal(price.status, 'verified'), demonstrationData,
      availability: literal(price.availability, 'check_with_store'),
    };
  }), price => price.branchId);
  // Verify the ordering contract; never silently reorder or repair a bad ranking.
  if (prices.some((price, i) => i > 0 && compareAmounts(prices[i - 1].price, price.price) > 0)) invalid();
  return {
    productId: expectedId, displayCurrency: literal(row.displayCurrency, 'USD'),
    demonstrationData, dataLabel, freshness: literal(row.freshness, 'not_evaluated'),
    availability: literal(row.availability, 'check_with_store'), prices,
  };
}
function coordinate(value: unknown, bound: number): number | null {
  return value === null ? null : typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= bound ? value : invalid();
}
export function readSupermarkets(value: unknown): Supermarket[] {
  const branchIds = new Set<number>();
  return unique(array(object(value).supermarkets).map(value => {
    const row = object(value);
    const branches = array(row.branches).map(value => {
      const branch = object(value);
      const branchId = id(branch.id);
      if (branchIds.has(branchId)) invalid();
      branchIds.add(branchId);
      const latitude = coordinate(branch.latitude, 90);
      const longitude = coordinate(branch.longitude, 180);
      if ((latitude === null) !== (longitude === null)) invalid();
      return {
        id: branchId, name: text(branch.name),
        address: branch.address == null || branch.address === '' ? null : text(branch.address),
        latitude, longitude,
      };
    });
    return { id: id(row.id), name: text(row.name), branches };
  }), row => row.id);
}
export function readHealth(value: unknown): true {
  const row = object(value);
  return row.status === 'ok' && row.database === 'connected' ? true : invalid();
}
