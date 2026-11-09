import { InvalidPayload, object, readProduct, timestamp, type Product } from './contracts';

const invalid = (): never => { throw new InvalidPayload('Invalid private API response'); };
export const array = (v: unknown): unknown[] => Array.isArray(v) ? v : invalid();
export const text = (v: unknown): string => typeof v === 'string' && v.trim().length > 0 && v.length <= 2048 ? v : invalid();
export function integer(v: unknown, maximum = 4294967295): number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= maximum ? v : invalid();
}
function bool(v: unknown): boolean { return typeof v === 'boolean' ? v : invalid(); }
function literal<T extends string | number | boolean>(v: unknown, expected: T): T { return v === expected ? expected : invalid(); }
function unique<T>(rows: T[], getId: (v: T) => number): T[] {
  return new Set(rows.map(getId)).size === rows.length ? rows : invalid();
}
function money(v: unknown): string {
  return typeof v === 'string' && /^(0|[1-9]\d{0,30})\.\d{2}$/.test(v) ? v : invalid();
}
function units(v: unknown): string {
  return typeof v === 'string' && /^[1-9]\d{0,50}$/.test(v) ? v : invalid();
}
export interface User { id: number; displayName: string; email: string }
export function readUser(value: unknown): User {
  const row = object(object(value).user);
  return { id: integer(row.id), displayName: text(row.displayName), email: text(row.email) };
}
export function readLogin(value: unknown) {
  const row = object(value);
  if (typeof row.token !== 'string' || !/^[a-f0-9]{64}$/.test(row.token)) invalid();
  literal(row.tokenType, 'Bearer');
  return { token: row.token as string, user: readUser(value), expiresAt: timestamp(row.expiresAt) };
}
export interface ShoppingList { id: number; name: string; createdAt: string; updatedAt: string }
export interface ListItem {
  id: number; productId: number; quantity: number; createdAt: string; updatedAt: string;
  product: Product & { isActive: boolean };
}
export interface ListDetails extends ShoppingList { items: ListItem[] }
function summary(value: unknown): ShoppingList {
  const row = object(value);
  return { id: integer(row.id), name: text(row.name), createdAt: timestamp(row.createdAt), updatedAt: timestamp(row.updatedAt) };
}
export function readItem(value: unknown): ListItem {
  const row = object(object(value).item), p = object(row.product);
  const productId = integer(row.productId);
  const product = { ...readProduct(p), isActive: bool(p.isActive) };
  if (product.id !== productId) invalid();
  return { id: integer(row.id), productId, quantity: integer(row.quantity, 999),
    createdAt: timestamp(row.createdAt), updatedAt: timestamp(row.updatedAt), product };
}
function items(value: unknown): ListItem[] {
  return unique(unique(array(value).map(item => readItem({ item })), item => item.id), item => item.productId);
}
export function readLists(value: unknown): ShoppingList[] {
  return unique(array(object(value).shoppingLists).map(summary), list => list.id);
}
export function readListSummary(value: unknown): ShoppingList { return summary(object(value).shoppingList); }
export function readList(value: unknown, expectedId: number): ListDetails {
  const row = object(object(value).shoppingList), list = summary(row);
  if (list.id !== expectedId) invalid();
  return { ...list, items: items(row.items) };
}
export interface CostLine {
  productId: number; quantity: number; originalPrice: string; originalCurrency: 'USD' | 'LBP';
  unitPriceUsd: string; unitPriceUsdUnits: string; lineTotalUsd: string; lineTotalUsdUnits: string;
  observedAt: string; demonstrationData: true; status: 'verified'; sourceType: 'seed';
}
export interface BasketBranch { branchId: number; branch: string; supermarketId: number; supermarket: string }
export interface CompleteBranch extends BasketBranch { rank: number; totalUsd: string; totalUsdUnits: string; items: CostLine[] }
export interface IncompleteBranch extends BasketBranch { missingProductIds: number[] }
export interface BasketComparison {
  shoppingList: { id: number; name: string; updatedAt: string; items: ListItem[] };
  outcome: 'complete' | 'no_complete_branches' | 'inactive_products';
  eligibleBranches: CompleteBranch[]; incompleteBranches: IncompleteBranch[]; cheapestBranchIds: number[];
  inactiveProductIds: number[]; demonstrationData: true; dataLabel: string; freshness: 'not_evaluated';
  displayCurrency: 'USD'; availabilityNotice: string;
}
const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((id, i) => id === b[i]);
function ids(v: unknown): number[] { return unique(array(v).map(v => integer(v)), v => v); }
function branch(v: unknown): BasketBranch {
  const row = object(v);
  return { branchId: integer(row.branchId), branch: text(row.branch), supermarketId: integer(row.supermarketId), supermarket: text(row.supermarket) };
}
export function readBasket(value: unknown, expectedId: number): BasketComparison {
  const row = object(value), list = object(row.shoppingList);
  if (integer(list.id) !== expectedId) invalid();
  const required = items(list.items);
  if (!required.length) invalid();
  const requiredIds = required.map(i => i.productId);
  if (!sameIds(requiredIds, [...requiredIds].sort((a, b) => a - b))) invalid();
  const lookup = new Map(required.map(i => [i.productId, i]));
  const inactiveProductIds = ids(row.inactiveProductIds);
  if (!sameIds(inactiveProductIds, required.filter(i => !i.product.isActive).map(i => i.productId))) invalid();
  const rate = object(row.exchangeRate), policy = object(row.monetaryPolicy);
  literal(rate.type, 'fixed'); literal(rate.baseCurrency, 'USD'); literal(rate.quoteCurrency, 'LBP');
  literal(rate.quotePerBase, '90000'); literal(rate.live, false); literal(rate.policy, 'owner_approved_fixed_rate');
  literal(policy.usdUnitDenominator, '9000000'); literal(policy.displayDecimals, 2);
  literal(policy.rounding, 'half_up'); literal(policy.ranking, 'exact_units');
  const eligibleBranches = unique(array(row.eligibleBranches).map(value => {
    const b = object(value);
    const lines = unique(array(b.items).map(value => {
      const line = object(value), productId = integer(line.productId), quantity = integer(line.quantity, 999);
      if (!lookup.has(productId) || lookup.get(productId)!.quantity !== quantity) invalid();
      if (line.originalCurrency !== 'USD' && line.originalCurrency !== 'LBP') invalid();
      const originalPrice = money(line.originalPrice);
      if (/^0\.00$/.test(originalPrice)) invalid();
      return { productId, quantity, originalPrice, originalCurrency: line.originalCurrency as 'USD' | 'LBP',
        unitPriceUsd: money(line.unitPriceUsd), unitPriceUsdUnits: units(line.unitPriceUsdUnits),
        lineTotalUsd: money(line.lineTotalUsd), lineTotalUsdUnits: units(line.lineTotalUsdUnits),
        observedAt: timestamp(line.observedAt), demonstrationData: literal(line.demonstrationData, true),
        status: literal(line.status, 'verified'), sourceType: literal(line.sourceType, 'seed') };
    }), line => line.productId);
    if (!sameIds(lines.map(l => l.productId), requiredIds)) invalid();
    return { ...branch(b), rank: integer(b.rank), totalUsd: money(b.totalUsd), totalUsdUnits: units(b.totalUsdUnits), items: lines };
  }), b => b.branchId);
  let rank = 0;
  // Validate the server order and tie contract only. No local total/conversion.
  eligibleBranches.forEach((b, i) => {
    const previous = eligibleBranches[i - 1];
    if (previous && (BigInt(previous.totalUsdUnits) > BigInt(b.totalUsdUnits)
      || (previous.totalUsdUnits === b.totalUsdUnits && previous.branchId >= b.branchId))) invalid();
    if (!previous || previous.totalUsdUnits !== b.totalUsdUnits) rank++;
    if (b.rank !== rank) invalid();
  });
  const incompleteBranches = unique(array(row.incompleteBranches).map(value => {
    const b = object(value), missingProductIds = ids(b.missingProductIds);
    if (!missingProductIds.length || missingProductIds.some(id => !lookup.has(id))
      || !sameIds(missingProductIds, [...missingProductIds].sort((a, b) => a - b)) || 'totalUsd' in b || 'rank' in b) invalid();
    return { ...branch(b), missingProductIds };
  }), b => b.branchId);
  if (incompleteBranches.some((b, i) => (i > 0 && incompleteBranches[i - 1].branchId >= b.branchId)
    || eligibleBranches.some(e => e.branchId === b.branchId))) invalid();
  const cheapestBranchIds = ids(row.cheapestBranchIds);
  if (!sameIds(cheapestBranchIds, eligibleBranches.filter(b => b.rank === 1).map(b => b.branchId))) invalid();
  const outcome = inactiveProductIds.length ? 'inactive_products' : eligibleBranches.length ? 'complete' : 'no_complete_branches';
  literal(row.outcome, outcome);
  if (inactiveProductIds.length && (eligibleBranches.length || incompleteBranches.length)) invalid();
  const dataLabel = text(row.dataLabel);
  if (!dataLabel.startsWith('DEMONSTRATION DATA')) invalid();
  return { shoppingList: { id: expectedId, name: text(list.name), updatedAt: timestamp(list.updatedAt), items: required },
    outcome, eligibleBranches, incompleteBranches, cheapestBranchIds, inactiveProductIds, dataLabel,
    demonstrationData: literal(row.demonstrationData, true), displayCurrency: literal(row.displayCurrency, 'USD'),
    freshness: literal(row.freshness, 'not_evaluated'), availabilityNotice: text(row.availabilityNotice) };
}
