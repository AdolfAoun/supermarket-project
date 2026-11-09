import { ApiError } from './api';
import { createAuthApi, type PrivateRequest } from './account-api';
import type { User } from './private-contracts';

export interface TokenStorage { get(): Promise<string | null>; set(token: string): Promise<void>; remove(): Promise<void> }
export interface SessionState {
  status: 'restoring' | 'restore_error' | 'authenticating' | 'guest' | 'authenticated';
  user: User | null; version: number; message: string | null;
}
const cancelled = () => new ApiError('cancelled', 'Request cancelled.');

export function createSession(storage: TokenStorage, api = createAuthApi()) {
  let epoch = 0, token: string | null = null;
  let state: SessionState = { status: 'restoring', user: null, version: 0, message: null };
  let storageQueue = Promise.resolve();
  const listeners = new Set<() => void>(), pending = new Set<AbortController>();
  function publish(status: SessionState['status'], user: User | null = null, message: string | null = null) {
    state = { status, user, version: epoch, message }; listeners.forEach(fn => fn());
  }
  function transition() { epoch++; for (const controller of pending) controller.abort(); pending.clear(); }
  function store(operation: () => Promise<void>) {
    const work = storageQueue.then(operation); storageQueue = work.catch(() => {}); return work;
  }
  async function clear(message: string | null = null) {
    transition(); token = null; const own = epoch;
    publish('guest', null, message);
    try { await store(() => storage.remove()); }
    catch { if (own === epoch) publish('guest', null, 'Secure session storage could not be cleared. Retry sign out before closing the app.'); }
  }
  async function restore() {
    transition(); const own = epoch; token = null; publish('restoring');
    const controller = new AbortController(); pending.add(controller);
    try {
      await storageQueue;
      const saved = await storage.get();
      if (own !== epoch) throw cancelled();
      if (!saved) { publish('guest'); return; }
      if (!/^[a-f0-9]{64}$/.test(saved)) { await clear(); return; }
      token = saved;
      const user = await api.me(saved, controller.signal);
      if (own !== epoch) throw cancelled();
      publish('authenticated', user);
    } catch (error) {
      if (own !== epoch) return;
      if (error instanceof ApiError && error.status === 401) await clear('Your session expired. Please log in again.');
      else publish('restore_error', null, 'Could not restore your session. Check the connection and retry, or sign out on this device.');
    } finally { pending.delete(controller); }
  }
  async function login(input: { email: string; password: string }) {
    if (state.status !== 'guest') throw cancelled();
    transition(); const own = epoch; publish('authenticating');
    const controller = new AbortController(); pending.add(controller);
    let issuedToken: string | undefined;
    try {
      const result = await api.login(input, controller.signal);
      issuedToken = result.token;
      if (own !== epoch) throw cancelled();
      await store(async () => { if (own === epoch) await storage.set(result.token); });
      if (own !== epoch) throw cancelled();
      token = result.token; publish('authenticated', result.user);
    } catch (error) {
      if (issuedToken) {
        // A failed/obsolete save must not resurrect a login on the next launch.
        if (own === epoch) await store(async () => { if (own === epoch) await storage.remove(); }).catch(() => {});
        void api.logout(issuedToken).catch(() => {});
      }
      if (own === epoch) publish('guest');
      if (!(error instanceof ApiError)) throw new ApiError('configuration', 'The session could not be saved securely. Please retry.');
      throw error;
    } finally { pending.delete(controller); }
  }
  async function logout() {
    const previous = token;
    const clearing = clear();
    const own = epoch;
    await clearing;
    if (!previous) return;
    try { await api.logout(previous); }
    catch (error) {
      if (own === epoch && !state.message && !(error instanceof ApiError && error.status === 401)) {
        publish('guest', null, 'Signed out on this device. Server logout could not be confirmed; the previous server session expires automatically.');
      }
    }
  }
  const run: PrivateRequest = async (operation, signal) => {
    if (state.status !== 'authenticated' || !token) throw new ApiError('http', 'Please log in to use shopping lists.', 401);
    if (signal?.aborted) throw cancelled();
    const own = epoch, ownToken = token, controller = new AbortController();
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); pending.add(controller);
    try {
      const value = await operation(ownToken, controller.signal);
      if (own !== epoch || controller.signal.aborted) throw cancelled();
      return value;
    } catch (error) {
      if (own !== epoch || (controller.signal.aborted && !(error instanceof ApiError && error.status === 401))) throw cancelled();
      if (error instanceof ApiError && error.status === 401) await clear('Your session expired. Please log in again.');
      throw error;
    } finally { pending.delete(controller); signal?.removeEventListener('abort', abort); }
  };
  return { getState: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    restore, login, logout, run,
    register: api.register,
  };
}
