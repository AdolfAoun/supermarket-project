import { packageLabel } from './presentation';
import type { BasketComparison } from './private-contracts';

// Presentation follows server ranks and monetary strings; no local totals.
export function basketPresentation(comparison: BasketComparison) {
  const products = new Map(comparison.shoppingList.items.map(i => [i.productId, i.product]));
  const name = (id: number) => { const p = products.get(id)!;
    return `${p.brand === p.name ? p.name : `${p.brand} ${p.name}`}${p.variant ? ` (${p.variant})` : ''} · ${packageLabel(p)}`;
  };
  return {
    branches: comparison.eligibleBranches.map(branch => ({ ...branch,
      cheapest: comparison.cheapestBranchIds.includes(branch.branchId),
      lines: branch.items.map(line => ({ ...line, productName: name(line.productId) })),
    })),
    incomplete: comparison.incompleteBranches.map(branch => ({ ...branch,
      explanation: `Missing price information for: ${branch.missingProductIds.map(name).join(', ')}`,
    })),
    message: comparison.outcome === 'inactive_products'
      ? `This basket cannot be fully compared because it contains inactive products: ${comparison.inactiveProductIds.map(name).join(', ')}. Your items are still saved.`
      : comparison.outcome === 'no_complete_branches' ? 'No branch has eligible price information for every product. No recommendation is available.' : null,
    availabilityNotice: comparison.availabilityNotice,
  };
}
