import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { createProductActions, type ProductActions } from '../services/product-actions';

export function useProductActions(onIdle?: () => void) {
  const [state, setState] = useState<ProductActions>({}), latest = useRef(onIdle);
  latest.current = onIdle;
  const [actions] = useState(() => createProductActions(setState, () => latest.current?.()));
  useFocusEffect(useCallback(() => { setState({}); return actions.cancel; }, [actions]));
  return { run: actions.run, state, pending: Object.values(state).some(state => state.pending) };
}
