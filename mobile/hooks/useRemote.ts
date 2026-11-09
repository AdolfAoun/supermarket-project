import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { createResource, type ResourceState } from '../services/resource';

export function useRemote<T>(key: string, load: (signal: AbortSignal) => Promise<T>, isEmpty: (value: T) => boolean, delay = 0,
  options: { preserveData?: boolean } = {}) {
  const preserveData = options.preserveData ?? false;
  const [state, setState] = useState<ResourceState<T>>({ key: '', status: 'idle', data: null, error: null });
  const latest = useRef({ load, isEmpty });
  latest.current = { load, isEmpty };
  const [resource] = useState(() => createResource<T>(setState, value => latest.current.isEmpty(value)));
  useFocusEffect(useCallback(() => {
    resource.start(key, signal => latest.current.load(signal), { delay, refresh: preserveData, retainOnError: preserveData });
    return resource.cancel;
  }, [resource, key, delay, preserveData]));
  // Parameter changes hide the previous record even before focus-effect cleanup.
  const visible: ResourceState<T> = state.key === key ? state : { key, status: 'loading', data: null, error: null };
  const retry = useCallback(() => resource.start(key, signal => latest.current.load(signal),
    { refresh: preserveData, retainOnError: preserveData }), [resource, key, preserveData]);
  const refresh = useCallback(() => resource.start(key, signal => latest.current.load(signal),
    { refresh: true, retainOnError: preserveData }), [resource, key, preserveData]);
  const update = useCallback((change: (current: T) => T) => resource.update(key, change), [resource, key]);
  return {
    ...visible,
    retry, refresh, update,
  };
}
