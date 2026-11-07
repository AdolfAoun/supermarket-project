import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { createResource, type ResourceState } from '../services/resource';

export function useRemote<T>(key: string, load: (signal: AbortSignal) => Promise<T>, isEmpty: (value: T) => boolean, delay = 0) {
  const [state, setState] = useState<ResourceState<T>>({ key: '', status: 'idle', data: null, error: null });
  const latest = useRef({ load, isEmpty });
  latest.current = { load, isEmpty };
  const [resource] = useState(() => createResource<T>(setState, value => latest.current.isEmpty(value)));
  useFocusEffect(useCallback(() => {
    resource.start(key, signal => latest.current.load(signal), { delay });
    return resource.cancel;
  }, [resource, key, delay]));
  // Parameter changes hide the previous record even before focus-effect cleanup.
  const visible: ResourceState<T> = state.key === key ? state : { key, status: 'loading', data: null, error: null };
  return {
    ...visible,
    retry: () => resource.start(key, signal => latest.current.load(signal)),
    refresh: () => resource.start(key, signal => latest.current.load(signal), { refresh: true }),
  };
}
