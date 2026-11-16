import { HttpError } from '../../middleware/errors.js';
import { exchangeRate, monetaryPolicy, formatUsd } from '../shared/money.js';
import { costLine } from './pricing.js';
import type { BasketSnapshot, BasketBranch, BasketPrice } from './repository.js';

export const availabilityNotice = 'Product availability is not verified in real time. Please check with the supermarket before visiting.';
interface CostLine {
  productId: number; quantity: number; originalPrice: string; originalCurrency: string;
  unitPriceUsd: string; unitPriceUsdUnits: string; lineTotalUsd: string; lineTotalUsdUnits: string;
  observedAt: string; status: 'verified'; sourceType: 'seed'; demonstrationData: true;
}
interface CompleteBranch extends BasketBranch {
  rank: number; totalUsd: string; totalUsdUnits: string; items: CostLine[];
}
interface IncompleteBranch extends BasketBranch { missingProductIds: number[] }

// Pure calculation, independent of HTTP/SQL. Lookup and money primitives are
// reusable by later optimization without implementing any multi-stop search.
export function compareBasket(snapshot: BasketSnapshot) {
  const { shoppingList } = snapshot;
  if (!shoppingList.items.length) throw new HttpError(400, 'Shopping list is empty');
  const requiredItems = [...shoppingList.items].sort((a, b) => a.productId - b.productId);
  const inactiveProductIds = requiredItems.filter(item => !item.product.isActive).map(item => item.productId);
  const eligibleBranches: CompleteBranch[] = [];
  const incompleteBranches: IncompleteBranch[] = [];
  const result = {
    shoppingList: { id: shoppingList.id, name: shoppingList.name, updatedAt: shoppingList.updatedAt, items: requiredItems },
    displayCurrency: 'USD', exchangeRate, monetaryPolicy, demonstrationData: true,
    dataLabel: 'DEMONSTRATION DATA: invented prices and simulated verification; not current or accurate store prices.',
    freshness: 'not_evaluated', availabilityNotice, inactiveProductIds,
    outcome: inactiveProductIds.length ? 'inactive_products' : 'no_complete_branches',
    eligibleBranches, incompleteBranches, cheapestBranchIds: [] as number[],
  };
  // Block the ENTIRE basket. Do not rank an active-only subset.
  if (inactiveProductIds.length) return result;

  const byBranch = new Map<number, Map<number, BasketPrice>>();
  for (const price of snapshot.prices) {
    let products = byBranch.get(price.branchId);
    if (!products) { products = new Map(); byBranch.set(price.branchId, products); }
    if (products.has(price.productId)) throw new Error('Duplicate selected basket price');
    products.set(price.productId, price);
  }
  for (const branch of [...snapshot.branches].sort((a, b) => a.branchId - b.branchId)) {
    const products = byBranch.get(branch.branchId);
    const missingProductIds = requiredItems.filter(item => !products?.has(item.productId)).map(item => item.productId);
    if (missingProductIds.length) { incompleteBranches.push({ ...branch, missingProductIds }); continue; }
    let total = 0n;
    const items: CostLine[] = requiredItems.map(item => {
      const price = products!.get(item.productId)!;
      const line = costLine(price, item.quantity);
      total += BigInt(line.lineTotalUsdUnits);
      return line;
    });
    eligibleBranches.push({ ...branch, rank: 0, totalUsd: formatUsd(total), totalUsdUnits: total.toString(), items });
  }
  eligibleBranches.sort((a, b) => {
    const left = BigInt(a.totalUsdUnits), right = BigInt(b.totalUsdUnits);
    return left < right ? -1 : left > right ? 1 : a.branchId - b.branchId;
  });
  let rank = 0;
  let previous: string | undefined;
  for (const branch of eligibleBranches) {
    if (branch.totalUsdUnits !== previous) rank++;
    branch.rank = rank;
    previous = branch.totalUsdUnits;
    if (rank === 1) result.cheapestBranchIds.push(branch.branchId);
  }
  if (eligibleBranches.length) result.outcome = 'complete';
  return result;
}
