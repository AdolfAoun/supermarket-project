import { Router } from 'express';
import { HttpError } from '../../middleware/errors.js';
import { requireAuth } from '../auth/routes.js';
import type { AuthRepository } from '../auth/repository.js';
import { body } from '../shared/validation.js';
import { createGoogleMapsImporter } from './resolver.js';

export type GoogleMapsImporter = ReturnType<typeof createGoogleMapsImporter>;
export function locationRoutes(auth: AuthRepository, importer: GoogleMapsImporter): Router {
  const router = Router();
  // Bound concurrent external work across accounts without persistent location data.
  let resolving = 0;
  router.post('/import-google-maps', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); },
    requireAuth(auth), async (req, res) => {
      if (Object.keys(req.query).length) throw new HttpError(400, 'Location import accepts no query parameters');
      const input = body(req.body, ['url']);
      if (resolving >= 4) throw new HttpError(422, 'Location import is busy. Please retry shortly.');
      resolving++;
      try { res.json(await importer(input.url)); } finally { resolving--; }
    });
  return router;
}
