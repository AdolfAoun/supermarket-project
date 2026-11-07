import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiClient, createCatalogApi, ApiError } from '../services/api';
import { readProducts } from '../services/contracts';

// Explicit command only: reads the owner's running API without starting/stopping
// services or changing any records. Override only this public URL in the process.
const client = createApiClient({ baseUrl: () => process.env.LIVE_CATALOG_API_URL ?? 'http://127.0.0.1:3000/api' });
const api = createCatalogApi(client);
test('live mobile client → running Express → imported MySQL catalog', async t => {
  await t.test('existing database health contract', async () => { assert.equal(await api.health(), true); });
  await t.test('catalog and alias search preserve canonical package identities', async () => {
    const products = await api.products(''); assert.equal(products.length, 36);
    const coca = await api.products('coca'); assert.deepEqual(coca.map(p => p.id), [1, 2]);
    const alias = await api.products('  Coke 1.5L  '); assert.deepEqual(alias.map(p => p.id), [1]);
    assert.deepEqual(await api.products('no-matching-product-zyx'), []);
    assert.equal((await api.product(1)).size, 1.5); assert.equal((await api.product(2)).size, 330);
  });
  await t.test('comparison parses decimal strings, dates, demo flags and branch ordering', async () => {
    const result = await api.prices(1);
    assert.deepEqual(result.prices.map(p => [p.branchId, p.price]), [[3, '1.60'], [1, '1.70'], [4, '1.75'], [2, '1.80']]);
    assert.equal(result.demonstrationData, true); assert.equal(result.freshness, 'not_evaluated');
    assert.equal(result.prices[0].observedAt, '2026-01-15T12:00:00.000000Z');
    assert.equal((await api.prices(13)).prices.length, 3);
  });
  await t.test('supermarket/branch and nullable-coordinate contracts', async () => {
    const chains = await api.supermarkets(); assert.equal(chains.length, 3);
    assert.equal(chains.reduce((count, chain) => count + chain.branches.length, 0), 4);
    assert.ok(chains.every(chain => chain.branches.every(branch => branch.latitude === null && branch.longitude === null)));
  });
  await t.test('backend invalid-ID and missing-product statuses are safely handled', async () => {
    await assert.rejects(client.get('/products/0', readProducts), error => error instanceof ApiError && error.status === 400);
    await assert.rejects(api.product(4294967295), error => error instanceof ApiError && error.status === 404);
    await assert.rejects(api.prices(4294967295), error => error instanceof ApiError && error.status === 404);
  });
});
