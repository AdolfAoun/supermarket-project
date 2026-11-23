import { validFuel, type FuelSettings } from './fuel';

export interface PreferenceStorage { get(): Promise<string | null>; set(value: string): Promise<void> }
export function createFuelPreferences(storage: PreferenceStorage) {
  let queue = Promise.resolve();
  return {
    async load(): Promise<FuelSettings | null> {
      await queue;
      const raw = await storage.get();
      if (!raw) return null;
      try {
        const value = JSON.parse(raw);
        return value && validFuel(value) ? { consumption: value.consumption, price: value.price, currency: value.currency } : null;
      } catch { return null; }
    },
    save(value: FuelSettings) {
      if (!validFuel(value)) return Promise.reject(new Error('Invalid fuel preferences'));
      const serialized = JSON.stringify(value);
      const work = queue.then(() => storage.set(serialized));
      queue = work.catch(() => {});
      return work;
    },
  };
}
