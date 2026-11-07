import express from 'express';
import cors from 'cors';
import { errorHandler, notFound } from './middleware/errors.js';
import { healthRoutes } from './modules/health/routes.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { createCatalogRepository, type CatalogRepository } from './modules/catalog/repository.js';

export function createApp(
  checkDatabase: () => Promise<void>,
  origins: string[] = [],
  catalog: CatalogRepository = createCatalogRepository(),
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: (origin, callback) => {
    callback(null, origin === undefined || origins.includes(origin));
  } }));
  app.use(express.json({ limit: '16kb' }));
  app.use('/api/health', healthRoutes(checkDatabase));
  app.use('/api', catalogRoutes(catalog));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
