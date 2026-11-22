import express from 'express';
import cors from 'cors';
import { errorHandler, notFound } from './middleware/errors.js';
import { healthRoutes } from './modules/health/routes.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { createCatalogRepository, type CatalogRepository } from './modules/catalog/repository.js';
import { createAuthRepository, type AuthRepository } from './modules/auth/repository.js';
import { authRoutes } from './modules/auth/routes.js';
import { createShoppingListRepository, type ShoppingListRepository } from './modules/shopping-lists/repository.js';
import { shoppingListRoutes } from './modules/shopping-lists/routes.js';
import { createBasketRepository, type BasketRepository } from './modules/basket/repository.js';
import { basketRoutes } from './modules/basket/routes.js';
import { locationRoutes, type GoogleMapsImporter } from './modules/locations/routes.js';
import { createGoogleMapsImporter } from './modules/locations/resolver.js';
import { journeyRoutes } from './modules/journeys/routes.js';
import { createOsrmAdapter, type RoutingAdapter } from './modules/journeys/routing.js';
import { env } from './config/env.js';

export function createApp(
  checkDatabase: () => Promise<void>,
  origins: string[] = [],
  catalog: CatalogRepository = createCatalogRepository(),
  auth: AuthRepository = createAuthRepository(),
  shoppingLists: ShoppingListRepository = createShoppingListRepository(),
  basket: BasketRepository = createBasketRepository(),
  importGoogleMaps: GoogleMapsImporter = createGoogleMapsImporter(),
  routing: RoutingAdapter = createOsrmAdapter({ baseUrl: env.osrmBaseUrl }),
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: (origin, callback) => {
    callback(null, origin === undefined || origins.includes(origin));
  } }));
  app.use(express.json({ limit: '16kb' }));
  app.use('/api/health', healthRoutes(checkDatabase));
  app.use('/api', catalogRoutes(catalog));
  app.use('/api/auth', authRoutes(auth));
  app.use('/api/shopping-lists', basketRoutes(basket, auth));
  app.use('/api/shopping-lists', shoppingListRoutes(shoppingLists, auth));
  app.use('/api/locations', locationRoutes(auth, importGoogleMaps));
  app.use('/api/journeys', journeyRoutes(auth, catalog, routing));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
