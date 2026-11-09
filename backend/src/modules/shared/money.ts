// Exact common unit: one hundredth of one LBP = 1 / 9,000,000 USD.
// DECIMAL(12,2) observations in either supported currency map to integer units.
export const LBP_PER_USD = 90_000n;
export const USD_UNIT_DENOMINATOR = LBP_PER_USD * 100n;
const UNITS_PER_USD_CENT = LBP_PER_USD;

export const exchangeRate = {
  type: 'fixed', baseCurrency: 'USD', quoteCurrency: 'LBP', quotePerBase: LBP_PER_USD.toString(),
  policy: 'owner_approved_fixed_rate', live: false,
} as const;
export const monetaryPolicy = {
  usdUnitDenominator: USD_UNIT_DENOMINATOR.toString(),
  displayDecimals: 2, rounding: 'half_up', ranking: 'exact_units',
} as const;

export function toUsdUnits(amount: unknown, currency: unknown): bigint {
  if (currency !== 'USD' && currency !== 'LBP') throw new Error('Unsupported currency');
  // Do not accept JS numbers: precision may already have been lost by the caller.
  if (typeof amount !== 'string' || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(amount)) {
    throw new Error('Invalid monetary value');
  }
  const [whole, fractional = ''] = amount.split('.');
  const hundredths = BigInt(whole) * 100n + BigInt(fractional.padEnd(2, '0'));
  if (hundredths <= 0n) throw new Error('Price must be positive');
  return currency === 'USD' ? hundredths * LBP_PER_USD : hundredths;
}

export function packageCost(unitPrice: bigint, quantity: number): bigint {
  if (unitPrice <= 0n || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Invalid package cost input');
  return unitPrice * BigInt(quantity);
}

// Display only. Ranking, summation and ties must use the original integer units.
export function formatUsd(units: bigint): string {
  if (units < 0n) throw new Error('Invalid USD amount');
  const cents = (units + UNITS_PER_USD_CENT / 2n) / UNITS_PER_USD_CENT;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}
