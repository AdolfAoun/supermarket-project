import { ApiError } from './api';

export function createMutation(publish: (state: { pending: boolean; error: string | null }) => void, readOnly = false) {
  let controller: AbortController | null = null, generation = 0;
  function cancel() { generation++; controller?.abort(); controller = null; }
  async function run<T>(operation: (signal: AbortSignal) => Promise<T>, success?: (value: T) => void) {
    if (controller) return;
    const own = generation, request = new AbortController(); controller = request;
    publish({ pending: true, error: null });
    let message: string | null = null;
    try {
      const result = await operation(request.signal);
      if (generation === own && !request.signal.aborted) success?.(result);
    } catch (error) {
      if (generation === own && !request.signal.aborted) {
        message = error instanceof ApiError && error.kind !== 'cancelled' ? error.message
          + (!readOnly && (error.kind === 'timeout' || error.kind === 'network') ? ' Reload before repeating a change; it may have reached the server.' : '')
          : error instanceof ApiError ? null : 'Unable to complete this action. Please retry.';
      }
    } finally {
      if (generation === own) { controller = null; publish({ pending: false, error: message }); }
    }
  }
  return { run, cancel };
}
