import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toUsdUnits, formatUsd, packageCost, USD_UNIT_DENOMINATOR, exchangeRate } from '../src/modules/shared/money.js';

test('USD and LBP map to exact common units without changing original inputs', () => {
  assert.equal(toUsdUnits('1.23', 'USD'), 11_070_000n);
  assert.equal(toUsdUnits('110700.00', 'LBP'), 11_070_000n);
  assert.equal(toUsdUnits('0.01', 'LBP'), 1n);
  assert.equal(formatUsd(toUsdUnits('12.34', 'USD')), '12.34');
  assert.equal(exchangeRate.quotePerBase, '90000');
  assert.equal(USD_UNIT_DENOMINATOR, 9_000_000n);
});
test('fractional LBP conversions sum and multiply before display rounding', () => {
  const price = toUsdUnits('300.00', 'LBP'); // exactly 1/300 USD
  assert.equal(formatUsd(price), '0.00');
  assert.equal(packageCost(price, 3), 90_000n);
  assert.equal(formatUsd(packageCost(price, 3)), '0.01');
  assert.equal(formatUsd(toUsdUnits('1350.00', 'LBP')), '0.02');
});
test('half-up rounding boundaries, zero display and carry are exact', () => {
  assert.equal(formatUsd(0n), '0.00');
  assert.equal(formatUsd(44_999n), '0.00');
  assert.equal(formatUsd(45_000n), '0.01');
  assert.equal(formatUsd(45_001n), '0.01');
  assert.equal(formatUsd(8_954_999n), '0.99');
  assert.equal(formatUsd(8_955_000n), '1.00');
  assert.throws(() => formatUsd(-1n));
});
test('large totals stay exact beyond JavaScript safe integers', () => {
  const units = packageCost(toUsdUnits('9999999999.99', 'USD'), 999);
  assert.ok(units > BigInt(Number.MAX_SAFE_INTEGER));
  assert.equal(formatUsd(units), '9989999999990.01');
  assert.equal(units.toString(), '89909999999910090000');
});
test('monetary utility rejects invalid values, numeric inputs and unsupported currencies', () => {
  for (const amount of ['', ' ', '1e2', 'NaN', 'Infinity', '-1.00', '+1.00', '0', '0.00', '1.001', '.50', '01.00',
    '10000000000.00', '1,000.00', ' 1.00', '1.00 ', null, undefined, true, {}, 1.23, NaN, Infinity]) {
    assert.throws(() => toUsdUnits(amount, 'USD'));
  }
  for (const currency of ['EUR', 'usd', '', null, undefined, 1]) assert.throws(() => toUsdUnits('1.00', currency));
  for (const quantity of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => packageCost(1n, quantity));
  assert.throws(() => packageCost(0n, 1));
});
