import { InvalidPayload, object, timestamp } from './contracts';
import { array, branch, integer, literal, money, readBasket, readItem, text, units,
  type BasketComparison, type BasketBranch, type CostLine, type ListItem } from './private-contracts';

const invalid = (): never => { throw new InvalidPayload('Invalid optimization response'); };
export interface OptimizationLine extends CostLine { freshness: 'recent' | 'older' | 'future'; availability: 'unknown' }
export interface Solution {
  branchIds: number[]; totalUsd: string; totalUsdUnits: string;
  allocations: (BasketBranch & { items: OptimizationLine[]; subtotalUsd: string; subtotalUsdUnits: string })[];
}
export interface Optimization {
  comparison: BasketComparison & { eligibleBranches: (BasketComparison['eligibleBranches'][number] & { items: OptimizationLine[] })[] };
  excludedItems: ListItem[]; evaluatedAt: string; maximumStores: number; freshnessDays: number;
  fuelCostsIncluded: false; availabilityGuaranteed: false; missingProductIds: number[];
  multiStore: { status: 'complete' | 'no_solution'; solution: Solution | null;
    savings: { amountUsd: string; amountUsdUnits: string; percentage: string } | null };
}
function ids(v: unknown): number[] {
  const result = array(v).map(v => integer(v));
  if (result.some((id, i) => i > 0 && result[i - 1] >= id)) invalid();
  return result;
}
const same = (a: number[], b: number[]) => a.length === b.length && a.every((id, i) => id === b[i]);
function freshness(v: unknown): OptimizationLine['freshness'] {
  return v === 'recent' || v === 'older' || v === 'future' ? v : invalid();
}
export function readOptimization(value: unknown, expectedId: number, maximumStores: number): Optimization {
  const row = object(value), rawComparison = object(row.comparison);
  const comparison = readBasket(rawComparison, expectedId);
  const lookup = new Map(comparison.shoppingList.items.map(i => [i.productId, i]));
  if (comparison.inactiveProductIds.length) invalid();
  const excludedItems = array(row.excludedItems).map(item => readItem({ item }));
  const excludedProductIds = excludedItems.map(i => i.productId);
  if (excludedItems.some(i => i.product.isActive || lookup.has(i.productId))
    || !same(excludedProductIds, ids(excludedProductIds))) invalid();
  const maximum = integer(row.maximumStores, 3);
  if (maximum !== maximumStores) invalid();
  function line(v: unknown): OptimizationLine {
    const r = object(v), productId = integer(r.productId), quantity = integer(r.quantity, 999);
    if (lookup.get(productId)?.quantity !== quantity) invalid();
    const originalCurrency = r.originalCurrency;
    if (originalCurrency !== 'USD' && originalCurrency !== 'LBP') invalid();
    const unitPriceUsdUnits = units(r.unitPriceUsdUnits), lineTotalUsdUnits = units(r.lineTotalUsdUnits);
    if (BigInt(unitPriceUsdUnits) * BigInt(quantity) !== BigInt(lineTotalUsdUnits)) invalid();
    const originalPrice = money(r.originalPrice);
    if (originalPrice === '0.00') invalid();
    return { productId, quantity, originalPrice, originalCurrency: originalCurrency as 'USD' | 'LBP',
      unitPriceUsdUnits, lineTotalUsdUnits, unitPriceUsd: money(r.unitPriceUsd), lineTotalUsd: money(r.lineTotalUsd),
      observedAt: timestamp(r.observedAt), status: literal(r.status, 'verified'), sourceType: literal(r.sourceType, 'seed'),
      demonstrationData: literal(r.demonstrationData, true), freshness: freshness(r.freshness), availability: literal(r.availability, 'unknown') };
  }
  const eligibleBranches = comparison.eligibleBranches.map((b, i) => {
    const items = array(object(array(rawComparison.eligibleBranches)[i]).items).map(line);
    if (items.reduce((total, l) => total + BigInt(l.lineTotalUsdUnits), 0n) !== BigInt(b.totalUsdUnits)) invalid();
    return { ...b, items };
  });
  const multi = object(row.multiStore);
  let solution: Solution | null = null;
  let savings: Optimization['multiStore']['savings'] = null;
  if (multi.status === 'complete') {
    const r = object(multi.solution), branchIds = ids(r.branchIds);
    if (!branchIds.length || branchIds.length > maximum) invalid();
    const allocations = array(r.allocations).map(v => {
      const b = object(v), items = array(b.items).map(line);
      if (!items.length) invalid();
      const subtotalUsdUnits = units(b.subtotalUsdUnits);
      if (items.reduce((total, l) => total + BigInt(l.lineTotalUsdUnits), 0n) !== BigInt(subtotalUsdUnits)) invalid();
      return { ...branch(b), items, subtotalUsdUnits, subtotalUsd: money(b.subtotalUsd) };
    });
    if (!same(branchIds, allocations.map(b => b.branchId))) invalid();
    const knownBranches = [...comparison.eligibleBranches, ...comparison.incompleteBranches];
    for (const b of allocations) {
      const known = knownBranches.find(k => k.branchId === b.branchId);
      if (!known || known.supermarketId !== b.supermarketId || known.branch !== b.branch || known.supermarket !== b.supermarket) invalid();
      if (known && 'missingProductIds' in known && b.items.some(l => known.missingProductIds.includes(l.productId))) invalid();
    }
    const products = allocations.flatMap(b => b.items.map(i => i.productId)).sort((a, b) => a - b);
    if (!same(products, [...lookup.keys()])) invalid();
    const totalUsdUnits = units(r.totalUsdUnits);
    if (allocations.reduce((total, b) => total + BigInt(b.subtotalUsdUnits), 0n) !== BigInt(totalUsdUnits)) invalid();
    solution = { branchIds, allocations, totalUsdUnits, totalUsd: money(r.totalUsd) };
    const baseline = eligibleBranches[0];
    if (baseline) {
      const s = object(multi.savings), amountUsdUnits = text(s.amountUsdUnits);
      if (!/^(0|[1-9]\d{0,50})$/.test(amountUsdUnits)
        || BigInt(baseline.totalUsdUnits) - BigInt(totalUsdUnits) !== BigInt(amountUsdUnits)) invalid();
      const percentage = money(s.percentage);
      if (Number(percentage) > 100) invalid();
      savings = { amountUsd: money(s.amountUsd), amountUsdUnits, percentage };
    } else if (multi.savings !== null) invalid();
  } else {
    literal(multi.status, 'no_solution');
    if (multi.solution !== null || multi.savings !== null || eligibleBranches.length) invalid();
  }
  const missingProductIds = ids(row.missingProductIds);
  if (missingProductIds.some(id => !lookup.has(id)) || (solution && missingProductIds.length)) invalid();
  return { comparison: { ...comparison, eligibleBranches }, excludedItems, maximumStores: maximum,
    evaluatedAt: timestamp(row.evaluatedAt), freshnessDays: integer(row.freshnessDays, 65535),
    fuelCostsIncluded: literal(row.fuelCostsIncluded, false), availabilityGuaranteed: literal(row.availabilityGuaranteed, false),
    missingProductIds, multiStore: { status: solution ? 'complete' : 'no_solution', solution, savings } };
}
