import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { TokenStorage } from './session';

const key = 'supermarket.session.v1';
// Web has no Expo SecureStore. Keep browser sessions in memory, never localStorage.
let webToken: string | null = null;
export const tokenStorage: TokenStorage = Platform.OS === 'web' ? {
  get: async () => webToken, set: async token => { webToken = token; }, remove: async () => { webToken = null; },
} : {
  get: () => SecureStore.getItemAsync(key),
  set: token => SecureStore.setItemAsync(key, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: () => SecureStore.deleteItemAsync(key),
};
