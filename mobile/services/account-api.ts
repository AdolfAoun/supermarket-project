import { ApiError, createApiClient, parseProductId, type RequestOptions } from './api';
import { readBasket, readItem, readList, readLists, readListSummary, readLogin, readUser } from './private-contracts';
import { InvalidPayload } from './contracts';
import { readOptimization } from './optimization-contracts';
import { readJourneyImport } from './journey';
import { readDiscovery, type DiscoveryRequest } from './discovery';

export function validQuantity(value: string): number | null {
  return /^[1-9]\d{0,2}$/.test(value) && Number(value) <= 999 ? Number(value) : null;
}
function requireId(id: number) {
  if (parseProductId(String(id)) !== id) throw new ApiError('http', 'Invalid list or product link.', 400);
}
const errorMessage = (status: number) => status === 401 ? 'Your session has expired. Please log in again.'
  : status === 404 ? 'This list, item or product no longer exists. Reload and check your selection.'
    : status === 400 ? 'Check the required fields, active product and whole-package quantity (1–999). The list may have changed; reload it.'
      : status === 409 ? 'This email is already registered. Log in or use another email.'
        : 'The backend could not complete the request. Please retry.';
export function createAuthApi(client = createApiClient()) {
  const authError = (status: number) => status === 400
    ? 'Enter a valid email and a password of 8–128 characters. Registration also requires a display name (up to 80 characters).'
    : errorMessage(status);
  return {
    register: (input: { displayName: string; email: string; password: string }, signal?: AbortSignal) =>
      client.request('/auth/register', readUser, { method: 'POST', body: input, signal, errorMessage: authError }),
    login: (input: { email: string; password: string }, signal?: AbortSignal) =>
      client.request('/auth/login', readLogin, { method: 'POST', body: input, signal,
        errorMessage: status => status === 401 ? 'Invalid email or password.' : authError(status) }),
    me: (token: string, signal?: AbortSignal) => client.request('/auth/me', readUser, { token, signal, errorMessage }),
    logout: (token: string, signal?: AbortSignal) => client.request('/auth/logout', () => undefined, { method: 'POST', token, signal, errorMessage }),
  };
}
export type PrivateRequest = <T>(operation: (token: string, signal: AbortSignal) => Promise<T>, signal?: AbortSignal) => Promise<T>;
export function createListApi(run: PrivateRequest, client = createApiClient()) {
  function request<T>(path: string, read: (v: unknown) => T, options: RequestOptions = {}) {
    return run((token, signal) => client.request(path, read, { ...options, token, signal, errorMessage: options.errorMessage ?? errorMessage }), options.signal);
  }
  const listPath = (id: number) => { requireId(id); return `/shopping-lists/${id}`; };
  const q = (quantity: number) => {
    if (validQuantity(String(quantity)) !== quantity) throw new ApiError('http', 'Use a whole-package quantity from 1 to 999.', 400);
    return quantity;
  };
  return {
    lists: (signal?: AbortSignal) => request('/shopping-lists', readLists, { signal }),
    discoverSupermarkets: (journey: DiscoveryRequest, signal?: AbortSignal) => request('/journeys/supermarkets', v => readDiscovery(v, journey), {
      method: 'POST', body: journey, signal, timeoutMs: 70000,
      errorMessage: status => status === 503 ? 'Road estimates are temporarily unavailable. Retry shortly, or use Grocery prices.'
        : status === 422 ? 'No usable driving route was found, or the journey exceeds the demonstration limit. Check your journey in Google Maps.'
          : status === 400 ? 'Import a complete driving journey with valid locations and at most eight existing stops.' : errorMessage(status),
    }),
    importGoogleMaps: (url: string, signal?: AbortSignal) => request('/locations/import-google-maps', readJourneyImport, {
      method: 'POST', body: { url: url.trim() }, signal,
      errorMessage: status => status === 400 ? 'Enter a supported HTTPS Google Maps link.'
        : status === 422 ? 'This link could not be imported. Try an expanded Google Maps directions or place link containing endpoint coordinates.' : errorMessage(status),
    }),
    optimize: (id: number, maximumStores = 2, signal?: AbortSignal) => {
      if (![1, 2, 3].includes(maximumStores)) throw new ApiError('http', 'Choose one, two or three branches.', 400);
      return request(`${listPath(id)}/optimization?maxStores=${maximumStores}`, v => readOptimization(v, id, maximumStores), { signal,
        errorMessage: status => status === 422 ? 'Exact optimization exceeds the computation limit. Choose fewer branches and retry.'
          : status === 400 ? 'Add active products to this list before optimizing. Reload the list if it changed.' : errorMessage(status) });
    },
    create: (name: string, signal?: AbortSignal) => request('/shopping-lists', readListSummary, { method: 'POST', body: { name }, signal }),
    detail: (id: number, signal?: AbortSignal) => request(listPath(id), v => readList(v, id), { signal }),
    rename: (id: number, name: string, signal?: AbortSignal) => request(listPath(id), value => {
      const list = readListSummary(value); if (list.id !== id) throw new InvalidPayload(); return list;
    }, { method: 'PATCH', body: { name }, signal }),
    remove: (id: number, signal?: AbortSignal) => request(listPath(id), () => undefined, { method: 'DELETE', signal }),
    add: (id: number, productId: number, quantity: number, signal?: AbortSignal) => {
      requireId(productId);
      return request(`${listPath(id)}/items`, value => {
        const item = readItem(value); if (item.productId !== productId || item.quantity < quantity) throw new InvalidPayload(); return item;
      }, { method: 'POST', body: { productId, quantity: q(quantity) }, signal });
    },
    setQuantity: (id: number, itemId: number, quantity: number, signal?: AbortSignal) => {
      requireId(itemId);
      return request(`${listPath(id)}/items/${itemId}`, value => {
        const item = readItem(value); if (item.id !== itemId || item.quantity !== quantity) throw new InvalidPayload(); return item;
      }, { method: 'PATCH', body: { quantity: q(quantity) }, signal });
    },
    removeItem: (id: number, itemId: number, signal?: AbortSignal) => {
      requireId(itemId);
      return request(`${listPath(id)}/items/${itemId}`, () => undefined, { method: 'DELETE', signal });
    },
    compare: (id: number, signal?: AbortSignal) => request(`${listPath(id)}/compare`, v => readBasket(v, id), { signal,
      errorMessage: status => status === 400 ? 'This list may be empty or changed. Open the list, add active products and compare again.' : errorMessage(status) }),
  };
}
