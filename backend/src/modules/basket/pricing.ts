import { toUsdUnits, packageCost, formatUsd } from '../shared/money.js';
import type { BasketPrice } from './repository.js';

// Shared by the accepted comparison and both optimization modes. Input prices
// have already been selected by the repository's verified/seed SQL policy.
export function costLine(price: BasketPrice, quantity: number) {
  const unit = toUsdUnits(price.originalPrice, price.originalCurrency);
  const cost = packageCost(unit, quantity);
  return { productId: price.productId, quantity,
    originalPrice: price.originalPrice, originalCurrency: price.originalCurrency,
    unitPriceUsd: formatUsd(unit), unitPriceUsdUnits: unit.toString(),
    lineTotalUsd: formatUsd(cost), lineTotalUsdUnits: cost.toString(),
    observedAt: price.observedAt, status: 'verified' as const,
    sourceType: 'seed' as const, demonstrationData: true as const };
}
