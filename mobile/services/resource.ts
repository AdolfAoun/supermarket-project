import { ApiError, schedule, type Schedule } from './api';

export type ResourceStatus = 'idle' | 'loading' | 'loaded' | 'empty' | 'error' | 'refreshing';
export interface ResourceState<T> {
  key: string; status: ResourceStatus; data: T | null; error: string | null;
}

// One request owner per mounted hook. Identity guards also protect against
// transports that ignore AbortSignal, including late failures during debounce.
export function createResource<T>(
  publish: (state: ResourceState<T>) => void,
  isEmpty: (value: T) => boolean,
  later: Schedule = schedule,
) {
  let generation = 0;
  let controller: AbortController | undefined;
  let clearDelay: (() => void) | undefined;
  let state: ResourceState<T> = { key: '', status: 'idle', data: null, error: null };
  function cancel() {
    generation++;
    clearDelay?.(); clearDelay = undefined;
    controller?.abort(); controller = undefined;
  }
  function emit(next: ResourceState<T>) { state = next; publish(next); }
  function start(key: string, load: (signal: AbortSignal) => Promise<T>, options: { delay?: number; refresh?: boolean; retainOnError?: boolean } = {}) {
    cancel();
    const ownGeneration = generation;
    controller = new AbortController();
    const signal = controller.signal;
    const previous = options.refresh && state.key === key ? state.data : null;
    emit({ key, status: previous === null ? 'loading' : 'refreshing', data: previous, error: null });
    const run = async () => {
      if (generation !== ownGeneration) return;
      try {
        const value = await load(signal);
        if (generation === ownGeneration) emit({ key, status: isEmpty(value) ? 'empty' : 'loaded', data: value, error: null });
      } catch (error) {
        if (generation !== ownGeneration) return;
        emit({ key, status: 'error', data: options.retainOnError ? previous : null,
          error: error instanceof ApiError ? error.message : 'Unable to load this information. Please retry.' });
      }
    };
    if (options.delay) clearDelay = later(() => { void run(); }, options.delay);
    else void run();
  }
  function update(key: string, change: (current: T) => T): boolean {
    if (state.key !== key || state.data === null) return false;
    cancel(); // A read started before this confirmed change must not overwrite it.
    const data = change(state.data);
    // Invalidating an old read is enough when no visible value changed. Avoid a
    // page-wide React update merely because an item operation started.
    if (data === state.data && (state.status === 'loaded' || state.status === 'empty') && state.error === null) return true;
    emit({ key, data, status: isEmpty(data) ? 'empty' : 'loaded', error: null });
    return true;
  }
  return { start, cancel, update };
}
