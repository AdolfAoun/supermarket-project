import { readComparison, readHealth, readProductDetails, readProducts, readSupermarkets } from './contracts';

export type ErrorKind = 'configuration' | 'http' | 'network' | 'timeout' | 'cancelled' | 'invalid_response';
export class ApiError extends Error {
  constructor(public readonly kind: ErrorKind, message: string, public readonly status?: number) { super(message); }
}
export function getApiUrl(): string {
  // Expo inlines this public URL into the bundle. Never place credentials here.
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  try {
    const url = new URL(value ?? '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    return value!.replace(/\/+$/, '');
  } catch { throw new ApiError('configuration', 'The API URL is not configured correctly. Check the mobile API configuration.'); }
}
export type Schedule = (callback: () => void, milliseconds: number) => () => void;
export const schedule: Schedule = (callback, milliseconds) => {
  const timer = setTimeout(callback, milliseconds);
  return () => clearTimeout(timer);
};
export interface ClientOptions {
  baseUrl?: () => string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  schedule?: Schedule;
}
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: object; token?: string;
  signal?: AbortSignal; errorMessage?: (status: number) => string; timeoutMs?: number;
}
function httpError(status: number): ApiError {
  const message = status === 404 ? 'This item was not found or is no longer active.'
    : status === 400 ? 'The request is invalid. Check the search or product link.'
      : status === 503 ? 'The backend responded, but the database is unavailable. Check WAMP/MySQL and retry.'
        : 'The server could not complete the request. Please retry.';
  return new ApiError('http', message, status);
}

export function createApiClient(clientOptions: ClientOptions = {}) {
  const transport = clientOptions.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const later = clientOptions.schedule ?? schedule;
  async function request<T>(path: string, read: (value: unknown) => T, options: RequestOptions = {}): Promise<T> {
    const signal = options.signal;
    if (signal?.aborted) throw new ApiError('cancelled', 'Request cancelled.');
    const base = (clientOptions.baseUrl ?? getApiUrl)();
    const controller = new AbortController();
    let rejectAbort: (error: ApiError) => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const cancel = () => {
      rejectAbort(new ApiError('cancelled', 'Request cancelled.'));
      controller.abort();
    };
    signal?.addEventListener('abort', cancel, { once: true });
    const clearDeadline = later(() => {
      rejectAbort(new ApiError('timeout', 'The request timed out. Check your connection and retry.'));
      controller.abort();
    }, options.timeoutMs ?? clientOptions.timeoutMs ?? 10_000);
    const work = async () => {
      const response = await transport(`${base}${path}`, { method: options.method ?? 'GET', signal: controller.signal,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
      if (!response.ok) throw options.errorMessage
        ? new ApiError('http', options.errorMessage(response.status), response.status) : httpError(response.status);
      let value: unknown;
      try { value = response.status === 204 ? undefined : await response.json(); }
      catch { throw new ApiError('invalid_response', 'The server returned invalid data. Please retry.'); }
      try { return read(value); }
      catch { throw new ApiError('invalid_response', 'The server returned invalid data. Please retry.'); }
    };
    try { return await Promise.race([aborted, work()]); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      // Raw fetch, SQL, HTML and server error strings never reach presentation.
      throw new ApiError('network', 'Could not reach the backend. Check your network and Express server, then retry.');
    } finally {
      clearDeadline();
      signal?.removeEventListener('abort', cancel);
    }
  }
  return { request, get: <T>(path: string, read: (value: unknown) => T, signal?: AbortSignal) => request(path, read, { signal }) };
}

export const CATALOG_LIMIT = 100;
export const SEARCH_LIMIT = 255;
export function parseProductId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id <= 4294967295 ? id : null;
}
export function createCatalogApi(client = createApiClient()) {
  function requireId(id: number) {
    if (parseProductId(String(id)) !== id) throw new ApiError('http', 'Invalid product link.', 400);
  }
  return {
    products(search: string, signal?: AbortSignal) {
      const trimmed = search.trim();
      if (trimmed.length > SEARCH_LIMIT) throw new ApiError('http', 'Search must be at most 255 characters.', 400);
      return client.get(`/products?limit=${CATALOG_LIMIT}&search=${encodeURIComponent(trimmed)}`, readProducts, signal);
    },
    product(id: number, signal?: AbortSignal) {
      requireId(id);
      return client.get(`/products/${id}`, value => readProductDetails(value, id), signal);
    },
    prices(id: number, signal?: AbortSignal) {
      requireId(id);
      return client.get(`/products/${id}/prices`, value => readComparison(value, id), signal);
    },
    supermarkets: (signal?: AbortSignal) => client.get('/supermarkets', readSupermarkets, signal),
    health: (signal?: AbortSignal) => client.get('/health/db', readHealth, signal),
  };
}
export const catalogApi = createCatalogApi();
