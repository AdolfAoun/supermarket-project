import { createMutation } from './mutation';

export interface ProductActionState { pending: boolean; error: string | null }
export type ProductActions = Record<string, ProductActionState>;

// Different rows may proceed together. Same-row writes serialize, and list-level
// operations exclude all item writes so deletion/rename cannot race the editor.
export function createProductActions(publish: (state: ProductActions) => void, idle: () => void = () => {}) {
  let states: ProductActions = {};
  const owners = new Map<string, ReturnType<typeof createMutation>>();
  const anyPending = () => Object.values(states).some(state => state.pending);
  function run<T>(key: string, operation: (signal: AbortSignal) => Promise<T>, success?: (value: T) => void) {
    if (key === 'list' ? anyPending() : states.list?.pending) return Promise.resolve();
    let owner = owners.get(key);
    if (!owner) {
      owner = createMutation(state => {
        const wasPending = anyPending(); states = { ...states, [key]: state }; publish(states);
        if (wasPending && !anyPending() && key !== 'list') idle();
      });
      owners.set(key, owner);
    }
    return owner.run(operation, success);
  }
  return { run, cancel() { owners.forEach(owner => owner.cancel()); owners.clear(); states = {}; } };
}
