import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createFuelPreferences } from './fuel-preferences';

const key = 'supermarket.fuel.v1';
let browserValue: string | null = null;
// Fuel preferences are device settings, not account data. Never persist journeys.
export const fuelPreferences = createFuelPreferences(Platform.OS === 'web' ? {
  get: async () => browserValue, set: async value => { browserValue = value; },
} : { get: () => SecureStore.getItemAsync(key), set: value => SecureStore.setItemAsync(key, value) });
