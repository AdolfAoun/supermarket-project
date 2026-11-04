import { Router } from 'express';

export function healthRoutes(checkDatabase: () => Promise<void>): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ status: 'ok', message: 'Backend is running' });
  });
  router.get('/db', async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', database: 'unavailable' });
    }
  });
  return router;
}
