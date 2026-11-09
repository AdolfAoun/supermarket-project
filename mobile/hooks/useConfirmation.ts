import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { createConfirmation } from '../services/confirmation';

export function useConfirmation() {
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation] = useState(() => createConfirmation(setMessage));
  useFocusEffect(useCallback(() => { confirmation.clear(); return confirmation.cancel; }, [confirmation]));
  return { message, show: confirmation.show, clear: confirmation.clear };
}
