import { ApiError, createApiClient, parseProductId, type RequestOptions } from './api';
import { readBasket, readItem, readList, readLists, readListSummary, readLogin, readUser } from './private-contracts';
import { InvalidPayload } from './contracts';

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
