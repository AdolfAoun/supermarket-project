import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createCatalogRepository, type CatalogRepository, type Product } from '../src/modules/catalog/repository.js';

const product: Product = {
  id: 1, name: 'Coca-Cola', brand: 'Coca-Cola', variant: 'Original', size: 1.5,
  unit: 'L', packQuantity: 1, category: 'Beverages', imageUrl: null,
};
function app(overrides: Partial<CatalogRepository> = {}) {
  return createApp(async () => {}, [], {
    listProducts: async () => [product],
    findProduct: async id => id === 1 ? product : null,
    listPrices: async () => [],
    listSupermarkets: async () => [],
    ...overrides,
  });
}

test('catalog list applies bounded defaults and returns canonical package fields', async () => {
  const response = await request(app({ listProducts: async (search, limit) => {
    assert.equal(search, ''); assert.equal(limit, 50); return [product];
  } })).get('/api/products').expect(200);
  assert.deepEqual(response.body, { products: [product] });
});

test('search and explicit limit are passed intact to parameterized repository', async () => {
  const response = await request(app({ listProducts: async (search, limit) => {
    assert.equal(search, 'COKE 1.5-L'); assert.equal(limit, 2); return [];
  } })).get('/api/products').query({ search: 'COKE 1.5-L', limit: 2 }).expect(200);
  assert.deepEqual(response.body, { products: [] });
});

test('invalid list queries fail before database access', async () => {
  const application = app({ listProducts: async () => { throw new Error('must not query'); } });
  for (const query of ['limit=0', 'limit=101', 'limit=-1', 'limit=1.5', 'limit=1e2', 'limit=abc',
    'limit=1&limit=2', 'search=a&search=b', `search=${'a'.repeat(256)}`]) {
    await request(application).get(`/api/products?${query}`).expect(400);
  }
});

test('repository normalizes pasted whitespace before binding search without changing punctuation or sizes', async () => {
  for (const [input, expected] of [['\t\n\u00a0', ''], [' \tCOKE\n 1.5\u00a0L ', 'COKE 1.5 L'], ["%_\\';--330", "%_\\';--330"]]) {
    const repository = createCatalogRepository(async (_sql, values) => {
      assert.deepEqual(values, [expected, expected, expected, expected, 50]); return [];
    });
    await repository.listProducts(input, 50);
  }
});

test('product details return the canonical record', async () => {
  const response = await request(app()).get('/api/products/1').expect(200);
  assert.deepEqual(response.body, { product });
});

test('malformed URL-encoded product IDs return 400 without querying', async () => {
  const application = app({ findProduct: async () => { throw new Error('must not query'); } });
  for (const suffix of ['', '/prices']) {
    const response = await request(application).get(`/api/products/%E0%A4%A${suffix}`).expect(400);
    assert.deepEqual(response.body, { status: 'error', message: 'Invalid URL parameter' });
  }
});

test('invalid product IDs return 400 for both product routes without querying', async () => {
  const application = app({ findProduct: async () => { throw new Error('must not query'); } });
  for (const id of ['0', '-1', '01', '1.5', '1e2', 'abc', '4294967296', '99999999999999999999', '1%20OR%201=1']) {
    for (const suffix of ['', '/prices']) {
      const response = await request(application).get(`/api/products/${id}${suffix}`).expect(400);
      assert.equal(response.body.message, 'Invalid product ID');
    }
  }
});

test('missing or inactive products return 404 without reading prices', async () => {
  const application = app({ listPrices: async () => { throw new Error('must not query'); } });
  for (const suffix of ['', '/prices']) {
    const response = await request(application).get(`/api/products/2${suffix}`).expect(404);
    assert.deepEqual(response.body, { status: 'error', message: 'Product not found' });
  }
});

test('empty comparison still labels demonstration data, freshness and availability', async () => {
  const response = await request(app()).get('/api/products/1/prices').expect(200);
  assert.deepEqual(response.body.prices, []);
  assert.equal(response.body.productId, 1);
  assert.equal(response.body.displayCurrency, 'USD');
  assert.equal(response.body.demonstrationData, true);
  assert.match(response.body.dataLabel, /DEMONSTRATION DATA/);
  assert.equal(response.body.freshness, 'not_evaluated');
  assert.equal(response.body.availability, 'check_with_store');
});

test('supermarket list supports empty results and nested branches', async () => {
  const empty = await request(app()).get('/api/supermarkets').expect(200);
  assert.deepEqual(empty.body, { supermarkets: [] });
  const supermarkets = [{ id: 1, name: 'Demo', branches: [{ id: 1, name: 'Demo branch',
    address: 'Fictional', latitude: null, longitude: null }] }];
  const response = await request(app({ listSupermarkets: async () => supermarkets }))
    .get('/api/supermarkets').expect(200);
  assert.deepEqual(response.body, { supermarkets });
});

test('database errors from every catalog route use sanitized central errors', async () => {
  const fail = async (): Promise<never> => { throw new Error('private SQL and connection details'); };
  const application = app({ listProducts: fail, findProduct: fail, listSupermarkets: fail });
  for (const path of ['/api/products', '/api/products/1', '/api/products/1/prices', '/api/supermarkets']) {
    const response = await request(application).get(path).expect(500);
    assert.deepEqual(response.body, { status: 'error', message: 'Internal server error' });
  }
  const priceFailure = await request(app({ listPrices: fail })).get('/api/products/1/prices').expect(500);
  assert.equal(priceFailure.body.message, 'Internal server error');
});

test('catalog routes expose no write operations', async () => {
  for (const path of ['/api/products', '/api/products/1', '/api/products/1/prices', '/api/supermarkets']) {
    await request(app()).post(path).send({ price: 0.01 }).expect(404);
    await request(app()).put(path).send({ name: 'changed' }).expect(404);
    await request(app()).delete(path).expect(404);
  }
});

test('repository binds search/IDs/limit separately from SQL and issues only SELECT', async () => {
  const calls: { sql: string; values: (string | number)[] }[] = [];
  const repository = createCatalogRepository(async (sql, values) => { calls.push({ sql, values }); return []; });
  const malicious = "%' OR 1=1 --";
  await repository.listProducts(malicious, 10);
  await repository.findProduct(7);
  await repository.listPrices(7);
  await repository.listSupermarkets();
  assert.deepEqual(calls[0].values, [malicious, malicious, malicious, malicious, 10]);
  assert.deepEqual(calls[1].values, [7]);
  assert.deepEqual(calls[2].values, [7]);
  for (const call of calls) {
    assert.match(call.sql.trim(), /^SELECT\b/);
    assert.equal(call.sql.includes(malicious), false);
  }
});
