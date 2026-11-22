import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { createMutation } from '../services/mutation';

// A synchronous busy guard catches repeated taps before React renders disabled.
// Blur/unmount aborts and invalidates continuations, including navigation.
export function useMutation(readOnly = false) {
  const [state, setState] = useState<{ pending: boolean; error: string | null }>({ pending: false, error: null });
  const [mutation] = useState(() => createMutation(setState, readOnly));
  useFocusEffect(useCallback(() => {
    setState({ pending: false, error: null });
    return mutation.cancel;
  }, [mutation]));
  return { run: mutation.run, clearError: () => setState(current => ({ ...current, error: null })), ...state };
}
