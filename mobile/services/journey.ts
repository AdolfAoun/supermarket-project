import { InvalidPayload, object } from './contracts';

export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit' | 'two-wheeler' | 'unknown';
export interface JourneyLocation {
  name: string | null; latitude: number | null; longitude: number | null; placeId: string | null;
  coordinateSource: 'explicit' | 'google_url_data' | 'google_geocode' | 'device' | null;
}
export interface JourneyImport {
  kind: 'journey' | 'location'; status: 'complete' | 'partial';
  origin: JourneyLocation | null; destination: JourneyLocation | null; location: JourneyLocation | null;
  waypoints: JourneyLocation[]; travelMode: TravelMode;
}
const invalid = (): never => { throw new InvalidPayload('Invalid journey import response'); };
export function usableLocation(p: JourneyLocation | null): boolean {
  return !!p && typeof p.latitude === 'number' && typeof p.longitude === 'number'
    && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}
function location(v: unknown): JourneyLocation | null {
  if (v === null) return null;
  const r = object(v);
  const nullableText = (v: unknown, max: number) => v === null ? null : typeof v === 'string' && v.trim() && v.length <= max ? v : invalid();
  const name = nullableText(r.name, 512), placeId = nullableText(r.placeId, 256);
  const source = r.coordinateSource;
  if (source !== null && !['explicit', 'google_url_data', 'google_geocode'].includes(String(source))) invalid();
  const p = { name, placeId, latitude: r.latitude, longitude: r.longitude, coordinateSource: source } as JourneyLocation;
  if (p.latitude === null && p.longitude === null && source === null && (name || placeId)) return p;
  if (!usableLocation(p) || source === null) invalid();
  return p;
}
export function readJourneyImport(value: unknown): JourneyImport {
  const r = object(value);
  if (!['journey', 'location'].includes(String(r.kind)) || !['complete', 'partial'].includes(String(r.status))
    || !Array.isArray(r.waypoints) || r.waypoints.length > 9
    || !['driving', 'walking', 'bicycling', 'transit', 'two-wheeler', 'unknown'].includes(String(r.travelMode))) invalid();
  const origin = location(r.origin), destination = location(r.destination), one = location(r.location);
  const waypoints = (r.waypoints as unknown[]).map(v => location(v) ?? invalid());
  if (r.kind === 'location') {
    if (!one || origin || destination || waypoints.length || r.status !== 'partial' || r.travelMode !== 'unknown') invalid();
  } else {
    if (one || (r.status === 'complete') !== (usableLocation(origin) && usableLocation(destination) && waypoints.every(usableLocation))) invalid();
  }
  return { kind: r.kind as JourneyImport['kind'], status: r.status as JourneyImport['status'], origin, destination, location: one,
    waypoints, travelMode: r.travelMode as TravelMode };
}
export interface JourneyDraft {
  origin: JourneyLocation | null; destination: JourneyLocation | null; waypoints: JourneyLocation[];
  travelMode: TravelMode; place: JourneyLocation | null;
}
export const emptyJourney = (): JourneyDraft => ({ origin: null, destination: null, waypoints: [], travelMode: 'unknown', place: null });
export const readyJourney = (s: JourneyDraft) => !s.place && usableLocation(s.origin) && usableLocation(s.destination)
  && s.waypoints.length <= 8 && s.waypoints.every(usableLocation) && s.travelMode === 'driving';
export const returnToStart = (s: JourneyDraft) => s.waypoints.length === 0 && usableLocation(s.origin) && usableLocation(s.destination)
  && s.origin!.latitude === s.destination!.latitude && s.origin!.longitude === s.destination!.longitude;
export function applyJourneyImport(s: JourneyDraft, value: JourneyImport): JourneyDraft {
  return value.kind === 'location' ? { ...s, place: value.location }
    : { origin: value.origin, destination: value.destination, waypoints: value.waypoints, travelMode: value.travelMode, place: null };
}
export function assignJourneyPlace(s: JourneyDraft, target: 'origin' | 'destination'): JourneyDraft {
  return s.place ? { ...s, [target]: s.place, place: null } : s;
}
