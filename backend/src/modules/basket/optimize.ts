import { HttpError } from '../../middleware/errors.js';
import { compareBasket } from './compare.js';
import { costLine } from './pricing.js';
import type { BasketBranch, BasketSnapshot } from './repository.js';
import { formatUsd } from '../shared/money.js';

export interface OptimizationPolicy { freshnessDays: number; maxWork: number }
export const defaultOptimizationPolicy: OptimizationPolicy = { freshnessDays: 30, maxWork: 10_000_000 };
export type OptimizationLine = ReturnType<typeof costLine> & {
  freshness: 'recent' | 'older' | 'future'; availability: 'unknown';
};
export interface BasketSolution {
  branchIds: number[];
  totalUsd: string; totalUsdUnits: string;
  allocations: (BasketBranch & { items: OptimizationLine[]; subtotalUsd: string; subtotalUsdUnits: string })[];
}
export interface PreparedBranch extends BasketBranch { lines: Map<number, OptimizationLine> }

// Enumerate bounded branch sets, not product assignments. Yield every feasible
// candidate, including more expensive sets that a future travel evaluator needs.
export function* generateBasketCandidates(branches: PreparedBranch[], productIds: number[], maxStores: number): Generator<BasketSolution> {
  const costs = new Map(branches.flatMap(b => [...b.lines.values()].map(line => [line, BigInt(line.lineTotalUsdUnits)] as const)));
  function* combinations(start: number, chosen: PreparedBranch[]): Generator<BasketSolution> {
    if (chosen.length) {
      const allocated = new Map<number, OptimizationLine[]>();
      let total = 0n;
      for (const productId of productIds) {
        let winner: PreparedBranch | undefined;
        let line: OptimizationLine | undefined;
        let minimum = 0n;
        for (const branch of chosen) {
          const candidate = branch.lines.get(productId);
          if (candidate && (!line || costs.get(candidate)! < minimum)) {
            winner = branch; line = candidate; minimum = costs.get(candidate)!;
          }
        }
        if (!line || !winner) break;
        const items = allocated.get(winner.branchId) ?? [];
        items.push(line); allocated.set(winner.branchId, items);
        total += minimum;
      }
      if ([...allocated.values()].reduce((n, items) => n + items.length, 0) === productIds.length) {
        const allocations = chosen.filter(b => allocated.has(b.branchId)).map(({ lines: _lines, ...branch }) => {
          const items = allocated.get(branch.branchId)!;
          const subtotal = items.reduce((n, item) => n + costs.get(item)!, 0n);
          return { ...branch, items, subtotalUsd: formatUsd(subtotal), subtotalUsdUnits: subtotal.toString() };
        });
        yield { branchIds: allocations.map(b => b.branchId), allocations, totalUsd: formatUsd(total), totalUsdUnits: total.toString() };
      }
    }
    if (chosen.length === maxStores) return;
    for (let i = start; i < branches.length; i++) yield* combinations(i + 1, [...chosen, branches[i]]);
  }
  yield* combinations(0, []);
}

function compareSolutions(a: BasketSolution, b: BasketSolution): number {
  const left = BigInt(a.totalUsdUnits), right = BigInt(b.totalUsdUnits);
  if (left !== right) return left < right ? -1 : 1;
  if (a.branchIds.length !== b.branchIds.length) return a.branchIds.length - b.branchIds.length;
  for (let i = 0; i < a.branchIds.length; i++) if (a.branchIds[i] !== b.branchIds[i]) return a.branchIds[i] - b.branchIds[i];
  return 0;
}

export function prepareBasket(snapshot: BasketSnapshot, now = new Date(), freshnessDays = 30) {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(freshnessDays) || freshnessDays < 1) throw new Error('Invalid freshness policy');
  const items = [...snapshot.shoppingList.items].sort((a, b) => a.productId - b.productId);
  const identities = new Set<number>();
  for (const item of items) {
    if (identities.has(item.productId) || item.productId !== item.product.id || !Number.isInteger(item.quantity)
      || item.quantity < 1 || item.quantity > 999) throw new Error('Invalid persisted shopping list');
    identities.add(item.productId);
  }
  const active = items.filter(i => i.product.isActive);
  const excludedItems = items.filter(i => !i.product.isActive);
  if (!active.length) throw new HttpError(400, 'Shopping list has no active products. Add active products before optimization');
  const required = new Map(active.map(i => [i.productId, i]));
  const branches = [...snapshot.branches].sort((a, b) => a.branchId - b.branchId);
  if (new Set(branches.map(b => b.branchId)).size !== branches.length) throw new Error('Duplicate branch');
  const byBranch = new Map(branches.map(b => [b.branchId, { ...b, lines: new Map<number, OptimizationLine>() }]));
  const prices = snapshot.prices.filter(p => required.has(p.productId) && byBranch.has(p.branchId));
  for (const price of prices) {
    const branch = byBranch.get(price.branchId)!;
    if (branch.lines.has(price.productId)) throw new Error('Duplicate selected price');
    const age = now.getTime() - Date.parse(price.observedAt);
    if (!Number.isFinite(age)) throw new Error('Invalid observation timestamp');
    const line = costLine(price, required.get(price.productId)!.quantity);
    branch.lines.set(price.productId, { ...line, availability: 'unknown',
      freshness: age < 0 ? 'future' : age > freshnessDays * 86400000 ? 'older' : 'recent' });
  }
  return { active, excludedItems, branches, byBranch, prices };
}

export function optimizeBasket(snapshot: BasketSnapshot, maxStores = 2, now = new Date(), policy = defaultOptimizationPolicy) {
  if (![1, 2, 3].includes(maxStores)) throw new HttpError(400, 'maxStores must be 1, 2 or 3');
  if (!Number.isSafeInteger(policy.maxWork) || policy.maxWork < 1) throw new Error('Invalid optimization policy');
  const { active, excludedItems, byBranch, prices } = prepareBasket(snapshot, now, policy.freshnessDays);
  const comparison = compareBasket({ ...snapshot, shoppingList: { ...snapshot.shoppingList, items: active }, prices });
  const useful = [...byBranch.values()].filter(b => b.lines.size);
  // Bound work before enumeration, without dropping any potentially useful branch.
  let combinations = 0, count = 1;
  for (let k = 1; k <= Math.min(maxStores, useful.length); k++) {
    count = count * (useful.length - k + 1) / k;
    combinations += count;
  }
  if (combinations * active.length * maxStores > policy.maxWork) {
    throw new HttpError(422, 'Exact optimization exceeds the computation limit. Try a lower maximum branch count');
  }
  let best: BasketSolution | null = null;
  for (const candidate of generateBasketCandidates(useful, active.map(i => i.productId), maxStores)) {
    if (!best || compareSolutions(candidate, best) < 0) best = candidate;
  }
  const baseline = comparison.eligibleBranches[0];
  let savings: { amountUsd: string; amountUsdUnits: string; percentage: string } | null = null;
  if (best && baseline) {
    const single = BigInt(baseline.totalUsdUnits), difference = single - BigInt(best.totalUsdUnits);
    if (difference < 0n) throw new Error('Invalid optimization savings');
    const percentHundredths = (difference * 10000n + single / 2n) / single;
    savings = { amountUsd: formatUsd(difference), amountUsdUnits: difference.toString(),
      percentage: `${percentHundredths / 100n}.${(percentHundredths % 100n).toString().padStart(2, '0')}` };
  }
  return {
    comparison: { ...comparison, eligibleBranches: comparison.eligibleBranches.map(b => ({ ...b,
      items: b.items.map(line => byBranch.get(b.branchId)!.lines.get(line.productId)!) })) },
    excludedItems, evaluatedAt: now.toISOString().replace(/(\.\d{3})Z$/, '$1000Z'), maximumStores: maxStores,
    freshnessDays: policy.freshnessDays, fuelCostsIncluded: false as const, availabilityGuaranteed: false as const,
    multiStore: { status: best ? 'complete' as const : 'no_solution' as const, solution: best, savings },
    missingProductIds: active.filter(i => !useful.some(b => b.lines.has(i.productId))).map(i => i.productId),
  };
}
