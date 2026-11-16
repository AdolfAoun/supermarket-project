import type { ErrorRequestHandler, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(public readonly status: 400 | 401 | 404 | 409 | 422, message: string) { super(message); }
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ status: 'error', message: error.message });
    return;
  }
  const malformedJson = error instanceof SyntaxError &&
    'type' in error && error.type === 'entity.parse.failed';
  const invalidUrl = error instanceof URIError && 'status' in error && error.status === 400;
  const oversizedBody = typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large';
  res.status(malformedJson || invalidUrl || oversizedBody ? 400 : 500).json({
    status: 'error',
    message: malformedJson ? 'Invalid JSON body' : invalidUrl ? 'Invalid URL parameter'
      : oversizedBody ? 'Request body too large' : 'Internal server error',
  });
};
