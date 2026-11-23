import { Router } from 'express';
import { HttpError } from '../../middleware/errors.js';
import { currentUser, requireAuth } from '../auth/routes.js';
import type { AuthRepository } from '../auth/repository.js';
import { id } from '../shared/validation.js';
import { compareBasket } from './compare.js';
import type { BasketRepository } from './repository.js';
import { optimizeBasket, defaultOptimizationPolicy } from './optimize.js';
import { env } from '../../config/env.js';
import { optimizeTrip, readTripRequest } from './trip.js';
import { RoutingError, type RoutingAdapter } from '../journeys/routing.js';

export function basketRoutes(repository: BasketRepository, auth: AuthRepository, routing?: RoutingAdapter): Router {
  const router = Router();
  let activeTrips = 0;
  router.post('/:id/fuel-optimization', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); },
    requireAuth(auth), async (req, res) => {
      if (Object.keys(req.query).length) throw new HttpError(400, 'Fuel optimization accepts no query parameters');
      const listId = id(req.params.id), input = readTripRequest(req.body);
      if (!routing || activeTrips >= 2) throw new HttpError(503, 'Fuel comparison is busy. Retry or use grocery-only comparison');
      activeTrips++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new RoutingError('timeout')), 60000);
      const close = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', close);
      try {
        const snapshot = await repository.snapshot(currentUser(res.locals).id, listId);
        res.json(await optimizeTrip(snapshot, input, routing, controller.signal, new Date(), env.priceFreshnessDays));
      } catch (error) {
        if (error instanceof RoutingError) throw new HttpError(['no_route', 'snap_too_far'].includes(error.reason) ? 422 : 503,
          'Fuel comparison needs usable road estimates. Retry or use grocery-only comparison');
        throw error;
      } finally { clearTimeout(timer); res.off('close', close); activeTrips--; }
    });
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
