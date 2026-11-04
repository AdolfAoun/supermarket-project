import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const malformedJson = error instanceof SyntaxError &&
    'type' in error && error.type === 'entity.parse.failed';
  res.status(malformedJson ? 400 : 500).json({
    status: 'error',
    message: malformedJson ? 'Invalid JSON body' : 'Internal server error',
  });
};
