import { toUsdUnits, USD_UNIT_DENOMINATOR } from '../shared/money.js';
import { HttpError } from '../../middleware/errors.js';

export interface Fraction { numerator: bigint; denominator: bigint }
export interface FuelSettings { consumption: string; price: string; currency: 'USD' | 'LBP' }
export function readFuelSettings(value: unknown): FuelSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Enter fuel settings');
  const r = value as Record<string, unknown>;
  const decimal = (v: unknown) => typeof v === 'string' && /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(v);
  if (Object.keys(r).some(k => !['consumption', 'price', 'currency'].includes(k))
    || !decimal(r.consumption) || Number(r.consumption) <= 0 || Number(r.consumption) > 100
    || !decimal(r.price) || typeof r.currency !== 'string' || (r.currency !== 'USD' && r.currency !== 'LBP')) {
    throw new HttpError(400, 'Use consumption above 0 through 100 L/100 km and a nonnegative USD/LBP price per liter (up to two decimals)');
  }
  return { consumption: r.consumption as string, price: r.price as string, currency: r.currency as FuelSettings['currency'] };
}
// Use the decimal representation of provider numbers, including scientific
// notation, as an exact fraction. No rounding to cents or whole meters.
export function fraction(value: number | string): Fraction {
  const [digits, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, part = ''] = digits.split('.');
  const scale = part.length - Number(exponent);
  const n = BigInt(whole + part);
  return scale >= 0 ? { numerator: n, denominator: 10n ** BigInt(scale) }
    : { numerator: n * 10n ** BigInt(-scale), denominator: 1n };
}
export const compareFractions = (a: Fraction, b: Fraction) => {
  const delta = a.numerator * b.denominator - b.numerator * a.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
};
export function displayFraction(value: Fraction, decimals = 2): string {
  const scale = 10n ** BigInt(decimals);
  const rounded = (value.numerator * scale * 2n + value.denominator) / (value.denominator * 2n);
  return `${rounded / scale}.${String(rounded % scale).padStart(decimals, '0')}`;
}
export const serializeFraction = (value: Fraction) => ({ numerator: value.numerator.toString(), denominator: value.denominator.toString() });
export function fuelCost(shoppingMeters: number, baselineMeters: number, dedicated: boolean, settings: FuelSettings) {
  settings = readFuelSettings(settings);
  if (![shoppingMeters, baselineMeters].every(n => Number.isFinite(n) && n >= 0 && n <= 5000000)) throw new Error('Invalid route distance');
  const shopping = fraction(shoppingMeters), baseline = fraction(baselineMeters);
  const distance = dedicated ? shopping : {
    numerator: shopping.numerator * baseline.denominator - baseline.numerator * shopping.denominator,
    denominator: shopping.denominator * baseline.denominator,
  };
  if (distance.numerator < 0n) distance.numerator = 0n;
  const consumption = fraction(settings.consumption);
  const liters = { numerator: distance.numerator * consumption.numerator,
    denominator: distance.denominator * consumption.denominator * 100000n }; // meters -> km -> L/100 km
  const price = Number(settings.price) === 0 ? 0n : toUsdUnits(settings.price, settings.currency);
  const cost = { numerator: liters.numerator * price, denominator: liters.denominator * USD_UNIT_DENOMINATOR };
  return { distance, liters, cost };
}
export function combinedCost(groceryUnits: string, fuel: Fraction): Fraction {
  return { numerator: BigInt(groceryUnits) * fuel.denominator + fuel.numerator * USD_UNIT_DENOMINATOR,
    denominator: USD_UNIT_DENOMINATOR * fuel.denominator };
}
