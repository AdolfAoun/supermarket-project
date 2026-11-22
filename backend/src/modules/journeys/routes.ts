import { Router } from 'express';
import { HttpError } from '../../middleware/errors.js';
import { requireAuth } from '../auth/routes.js';
import type { AuthRepository } from '../auth/repository.js';
import type { CatalogRepository } from '../catalog/repository.js';
import { discoverSupermarkets, readJourneyRequest } from './discover.js';
import { RoutingError, type RoutingAdapter } from './routing.js';

export function journeyRoutes(auth: AuthRepository, catalog: CatalogRepository, routing: RoutingAdapter): Router {
  const router = Router(); let active = 0;
  router.post('/supermarkets', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, requireAuth(auth), async (req, res) => {
    if (Object.keys(req.query).length) throw new HttpError(400, 'Journey discovery accepts no query parameters');
    const journey = readJourneyRequest(req.body);
    if (active >= 2) throw new HttpError(503, 'Road-route discovery is busy. Please retry shortly.');
    active++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new RoutingError('timeout')), 60000);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    try {
      // Finish SQL retrieval before any external network operation. No open tx.
      const supermarkets = await catalog.listSupermarkets();
      res.json(await discoverSupermarkets(journey, supermarkets, routing, controller.signal));
    } catch (error) {
      if (error instanceof RoutingError) throw new HttpError(error.reason === 'no_route' || error.reason === 'snap_too_far' ? 422 : 503,
        error.reason === 'no_route' || error.reason === 'snap_too_far' ? 'No usable driving route was found for these locations. Check the journey in Google Maps.'
          : 'Road routing is temporarily unavailable. Please retry. Grocery-only optimization is still available.');
      throw error;
    } finally { clearTimeout(timeout); res.off('close', close); active--; }
  });
  return router;
}
