import { ApiError } from './api';
import { usableLocation, type JourneyLocation } from './journey';

// Inject the native functions so permission/error paths are deterministic in tests.
export interface ForegroundLocation {
  requestForegroundPermissionsAsync(): Promise<{ status: string }>;
  hasServicesEnabledAsync(): Promise<boolean>;
  getCurrentPositionAsync(options: { accuracy: number }): Promise<{ coords: { latitude: number; longitude: number }; timestamp: number }>;
}
export async function currentLocation(native: ForegroundLocation, accuracy: number, signal?: AbortSignal, timeoutMs = 15000): Promise<JourneyLocation> {
  if (signal?.aborted) throw new ApiError('cancelled', 'Location request cancelled.');
  let timer: ReturnType<typeof setTimeout>;
  let cancel = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(new ApiError('cancelled', 'Location request cancelled.'));
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => reject(new ApiError('http', 'GPS timed out. Try again outdoors or import a starting location from Google Maps.')), timeoutMs);
  });
  let active = true;
  const check = () => { if (!active || signal?.aborted) throw new ApiError('cancelled', 'Location request cancelled.'); };
  const work = async () => {
    const permission = await native.requestForegroundPermissionsAsync(); check();
    if (permission.status !== 'granted') throw new ApiError('http', 'Location permission denied. Enable it for Expo Go in Settings, or import a starting location from Google Maps.');
    const enabled = await native.hasServicesEnabledAsync(); check();
    if (!enabled) throw new ApiError('http', 'Location services are disabled. Enable them in Settings or import a starting location.');
    const position = await native.getCurrentPositionAsync({ accuracy }); check();
    const p: JourneyLocation = { name: 'My current location', latitude: position.coords.latitude, longitude: position.coords.longitude,
      coordinateSource: 'device', placeId: null };
    if (!usableLocation(p) || !Number.isFinite(position.timestamp) || Math.abs(Date.now() - position.timestamp) > 120000) {
      throw new ApiError('http', 'A fresh location is unavailable. Try again or import a starting location.');
    }
    return p;
  };
  try { return await Promise.race([work(), deadline]); }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('http', 'Current location is temporarily unavailable. Try again or import a starting location.');
  } finally { active = false; clearTimeout(timer!); signal?.removeEventListener('abort', cancel); }
}
