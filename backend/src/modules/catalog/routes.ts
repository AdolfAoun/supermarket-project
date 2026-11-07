import { Router } from 'express';
import type { CatalogRepository } from './repository.js';

const demoLabel = 'DEMONSTRATION DATA: invented USD prices and simulated verification; not current or accurate store prices.';

function productId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id <= 4294967295 ? id : null;
}

export function catalogRoutes(repository: CatalogRepository): Router {
  const router = Router();
  router.get('/products', async (req, res) => {
    const search = req.query.search ?? '';
    const rawLimit = req.query.limit ?? '50';
    if (typeof search !== 'string' || search.length > 255) {
      res.status(400).json({ status: 'error', message: 'search must be a single string of at most 255 characters' });
      return;
    }
    if (typeof rawLimit !== 'string' || !/^[1-9]\d*$/.test(rawLimit) || Number(rawLimit) > 100) {
      res.status(400).json({ status: 'error', message: 'limit must be an integer from 1 to 100' });
      return;
    }
    res.json({ products: await repository.listProducts(search, Number(rawLimit)) });
  });

  router.get('/products/:id', async (req, res) => {
    const id = productId(req.params.id);
    if (id === null) {
      res.status(400).json({ status: 'error', message: 'Invalid product ID' });
      return;
    }
    const product = await repository.findProduct(id);
    if (!product) {
      res.status(404).json({ status: 'error', message: 'Product not found' });
      return;
    }
    res.json({ product });
  });

  router.get('/products/:id/prices', async (req, res) => {
    const id = productId(req.params.id);
    if (id === null) {
      res.status(400).json({ status: 'error', message: 'Invalid product ID' });
      return;
    }
    if (!await repository.findProduct(id)) {
      res.status(404).json({ status: 'error', message: 'Product not found' });
      return;
    }
    res.json({
      productId: id, displayCurrency: 'USD', demonstrationData: true, dataLabel: demoLabel,
      freshness: 'not_evaluated', availability: 'check_with_store',
      prices: await repository.listPrices(id),
    });
  });

  router.get('/supermarkets', async (_req, res) => {
    res.json({ supermarkets: await repository.listSupermarkets() });
  });
  return router;
}
