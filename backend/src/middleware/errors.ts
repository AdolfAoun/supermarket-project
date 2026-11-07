import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const malformedJson = error instanceof SyntaxError &&
    'type' in error && error.type === 'entity.parse.failed';
  const invalidUrl = error instanceof URIError && 'status' in error && error.status === 400;
  res.status(malformedJson || invalidUrl ? 400 : 500).json({
    status: 'error',
    message: malformedJson ? 'Invalid JSON body' : invalidUrl ? 'Invalid URL parameter' : 'Internal server error',
  });
};
