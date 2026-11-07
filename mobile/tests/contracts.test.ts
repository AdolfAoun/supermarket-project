import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvalidPayload, readComparison, readProductDetails, readProducts, readSupermarkets } from '../services/contracts';
import { isLowestDisplayed, observedLabel, packageLabel } from '../services/presentation';
import { comparison, price, product, smallProduct, supermarkets } from './fixtures';

test('catalog retains duplicate names with distinct canonical packages and absent images', () => {
  const products = readProducts({ products: [product, smallProduct] });
  assert.deepEqual(products.map(p => [p.id, p.size, p.unit]), [[1, 1.5, 'L'], [2, 330, 'ml']]);
  assert.equal(products[0].imageUrl, null);
  assert.equal(readProductDetails({ product }, 1).variant, 'Original');
  assert.deepEqual(readProducts({ products: [] }), []);
  assert.equal(packageLabel({ ...product, packQuantity: 6 }), '6 × 1.5 L');
});
test('catalog rejects malformed required values, duplicate IDs and identity mismatches', () => {
  for (const change of [{ id: '1' }, { id: 0 }, { name: '' }, { brand: null }, { variant: null },
    { size: '1.5' }, { size: 0 }, { size: Infinity }, { unit: undefined },
    { packQuantity: 1.5 }, { packQuantity: 0 }, { category: null }]) {
    assert.throws(() => readProducts({ products: [{ ...product, ...change }] }), InvalidPayload);
  }
  assert.throws(() => readProducts({ products: [product, product] }), InvalidPayload);
  assert.throws(() => readProducts({}), InvalidPayload);
  assert.throws(() => readProductDetails({ product }, 2), InvalidPayload);
});
test('optional images accept safe URLs and degrade absent, broken or unsafe URLs to placeholders', () => {
  for (const imageUrl of [null, undefined, '', '   ', 'not a URL', 'file:///private', 'javascript:alert(1)', 'http://user:pass@example.test/image']) {
    assert.equal(readProducts({ products: [{ ...product, imageUrl }] })[0].imageUrl, null);
  }
  assert.equal(readProducts({ products: [{ ...product, imageUrl: 'https://example.test/image.png' }] })[0].imageUrl, 'https://example.test/image.png');
});
test('comparison preserves server order and highlights every exact minimum tie', () => {
  const value = readComparison(comparison, 1);
  assert.deepEqual(value.prices.map(p => p.branchId), [1, 2, 3]);
  assert.deepEqual(value.prices.map(p => isLowestDisplayed(value, p)), [true, true, false]);
  const single = readComparison({ ...comparison, prices: [price] }, 1);
  assert.equal(isLowestDisplayed(single, single.prices[0]), true);
  const empty = readComparison({ ...comparison, prices: [] }, 1);
  assert.deepEqual(empty.prices, []); assert.equal(isLowestDisplayed(empty, price as typeof value.prices[number]), false);
});
test('invalid monetary strings and numeric values are rejected without conversion', () => {
  for (const amount of [1.6, '1.6', '01.60', '-1.60', '0.00', 'NaN', '1e2', '1.600', null, '10000000000.00']) {
    assert.throws(() => readComparison({ ...comparison, prices: [{ ...price, price: amount }] }, 1), InvalidPayload);
  }
  assert.equal(readComparison({ ...comparison, prices: [{ ...price, price: '9999999999.99' }] }, 1).prices[0].price, '9999999999.99');
});
test('comparison rejects malformed timestamps, branches, eligibility fields and inconsistent metadata', () => {
  for (const change of [{ observedAt: undefined }, { observedAt: 'now' }, { observedAt: '2026-02-31T12:00:00.000000Z' },
    { branchId: 0 }, { supermarketId: '1' }, { branch: null }, { supermarket: '' },
    { status: 'pending' }, { status: 'flagged' }, { currency: 'LBP' }, { demonstrationData: false }, { availability: 'in_stock' }]) {
    assert.throws(() => readComparison({ ...comparison, prices: [{ ...price, ...change }] }, 1), InvalidPayload);
  }
  for (const change of [{ productId: 2 }, { demonstrationData: undefined }, { dataLabel: 'current prices' },
    { freshness: 'fresh' }, { availability: 'in_stock' }, { prices: [price, price] }]) {
    assert.throws(() => readComparison({ ...comparison, ...change }, 1), InvalidPayload);
  }
});
test('old verified observations remain visible without introducing a freshness cutoff', () => {
  const value = readComparison(comparison, 1);
  assert.equal(value.freshness, 'not_evaluated');
  assert.equal(value.demonstrationData, true);
  assert.equal(value.availability, 'check_with_store');
  assert.equal(observedLabel(value.prices[0].observedAt), '2026-01-15 12:00:00 UTC');
});

test('API microseconds survive validation on an engine accepting only ISO milliseconds', () => {
  const RealDate = Date;
  try {
    globalThis.Date = class extends RealDate {
      constructor(value: string | number) {
        if (typeof value === 'string' && /\.\d{6}Z$/.test(value)) throw new Error('Unsupported fractional precision');
        super(value);
      }
    } as typeof Date;
    const observedAt = '2026-01-15T12:00:00.123456Z';
    const value = readComparison({ ...comparison, prices: [{ ...price, observedAt }] }, 1);
    assert.equal(value.prices[0].observedAt, observedAt);
  } finally { globalThis.Date = RealDate; }
});
test('demo rendering is driven by response indicators rather than a permanent client assumption', () => {
  const value = readComparison({ ...comparison, demonstrationData: false, dataLabel: 'Price information',
    prices: [{ ...price, demonstrationData: false }] }, 1);
  assert.equal(value.demonstrationData, false); assert.equal(value.prices[0].demonstrationData, false);
});
test('unexpected server ordering fails validation rather than falsely labeling a first-row winner', () => {
  assert.throws(() => readComparison({ ...comparison, prices: [comparison.prices[2], price] }, 1), InvalidPayload);
  const value = readComparison({ ...comparison, prices: [{ ...price, price: '9.99' }, { ...price, branchId: 2, price: '10.00' }] }, 1);
  assert.deepEqual(value.prices.map(p => p.price), ['9.99', '10.00']);
});
test('supermarkets preserve chains, same-name branches, nullable locations and empty chains', () => {
  const chains = readSupermarkets(supermarkets);
  assert.equal(chains.length, 2); assert.equal(chains[0].branches.length, 2);
  assert.equal(chains[0].branches[0].address, null);
  assert.equal(chains[0].branches[0].latitude, null);
  assert.equal(chains[0].branches[1].latitude, 33.8);
  assert.deepEqual(chains[1].branches, []);
  assert.deepEqual(readSupermarkets({ supermarkets: [] }), []);
});
test('supermarket payloads reject duplicate identities, missing coordinates and malformed records', () => {
  const chain = supermarkets.supermarkets[0]; const branch = chain.branches[0];
  for (const branches of [[{ ...branch, id: -1 }], [branch, branch], [{ ...branch, latitude: 91, longitude: 35 }],
    [{ ...branch, latitude: 33, longitude: null }], [{ ...branch, longitude: undefined }], [{ ...branch, name: '' }]]) {
    assert.throws(() => readSupermarkets({ supermarkets: [{ ...chain, branches }] }), InvalidPayload);
  }
  assert.throws(() => readSupermarkets({ supermarkets: [chain, chain] }), InvalidPayload);
  assert.throws(() => readSupermarkets({}), InvalidPayload);
});
