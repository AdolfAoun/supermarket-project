import { Router } from 'express';
import type { AuthRepository } from '../auth/repository.js';
import { currentUser, requireAuth } from '../auth/routes.js';
import { body, id, productId, quantity, text } from '../shared/validation.js';
import type { ShoppingListRepository } from './repository.js';

export function shoppingListRoutes(repository: ShoppingListRepository, auth: AuthRepository): Router {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(requireAuth(auth));
  router.get('/', async (_req, res) => {
    res.json({ shoppingLists: await repository.list(currentUser(res.locals).id) });
  });
  router.post('/', async (req, res) => {
    const input = body(req.body, ['name']);
    const list = await repository.create(currentUser(res.locals).id, text(input.name, 'name', 120));
    res.status(201).json({ shoppingList: list });
  });
  router.get('/:id', async (req, res) => {
    res.json({ shoppingList: await repository.get(currentUser(res.locals).id, id(req.params.id)) });
  });
  router.patch('/:id', async (req, res) => {
    const input = body(req.body, ['name']);
    res.json({ shoppingList: await repository.rename(currentUser(res.locals).id, id(req.params.id), text(input.name, 'name', 120)) });
  });
  router.delete('/:id', async (req, res) => {
    await repository.remove(currentUser(res.locals).id, id(req.params.id));
    res.status(204).end();
  });
  router.post('/:id/items', async (req, res) => {
    const input = body(req.body, ['productId', 'quantity']);
    const item = await repository.addItem(currentUser(res.locals).id, id(req.params.id), productId(input.productId), quantity(input.quantity));
    res.status(200).json({ item }); // Same status for inserting and combining.
  });
  router.patch('/:id/items/:itemId', async (req, res) => {
    const input = body(req.body, ['quantity']);
    res.json({ item: await repository.setQuantity(currentUser(res.locals).id, id(req.params.id), id(req.params.itemId), quantity(input.quantity)) });
  });
  router.delete('/:id/items/:itemId', async (req, res) => {
    await repository.removeItem(currentUser(res.locals).id, id(req.params.id), id(req.params.itemId));
    res.status(204).end();
  });
  return router;
}
