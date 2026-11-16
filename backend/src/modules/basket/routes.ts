import { Router } from 'express';
import { HttpError } from '../../middleware/errors.js';
import { currentUser, requireAuth } from '../auth/routes.js';
import type { AuthRepository } from '../auth/repository.js';
import { id } from '../shared/validation.js';
import { compareBasket } from './compare.js';
import type { BasketRepository } from './repository.js';
import { optimizeBasket, defaultOptimizationPolicy } from './optimize.js';
import { env } from '../../config/env.js';

export function basketRoutes(repository: BasketRepository, auth: AuthRepository): Router {
  const router = Router();
  router.get('/:id/optimization', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); },
    requireAuth(auth), async (req, res) => {
      if (req.body !== undefined || Object.keys(req.query).some(key => key !== 'maxStores')
        || (req.query.maxStores !== undefined && (typeof req.query.maxStores !== 'string' || !/^[123]$/.test(req.query.maxStores)))) {
        throw new HttpError(400, 'Optimization accepts only maxStores=1, 2 or 3 and no body');
      }
      const snapshot = await repository.snapshot(currentUser(res.locals).id, id(req.params.id));
      res.json(optimizeBasket(snapshot, Number(req.query.maxStores ?? 2), new Date(), {
        ...defaultOptimizationPolicy, freshnessDays: env.priceFreshnessDays,
      }));
    });
  router.get('/:id/compare', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); },
    requireAuth(auth), async (req, res) => {
      // No client-side prices/totals/owner or optional policy overrides.
      if (Object.keys(req.query).length || req.body !== undefined) {
        throw new HttpError(400, 'Basket comparison accepts no query parameters or body');
      }
      res.json(compareBasket(await repository.snapshot(currentUser(res.locals).id, id(req.params.id))));
    });
  return router;
}
