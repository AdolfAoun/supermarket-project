import { HttpError } from '../../middleware/errors.js';
import { validCoordinates } from '../shared/geo.js';

export interface ImportedLocation {
  name: string | null; latitude: number | null; longitude: number | null; placeId: string | null;
  coordinateSource: 'explicit' | 'google_url_data' | 'google_geocode' | null;
}
export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit' | 'two-wheeler' | 'unknown';
export interface JourneyImport {
  kind: 'journey' | 'location'; status: 'complete' | 'partial';
  origin: ImportedLocation | null; destination: ImportedLocation | null; location: ImportedLocation | null;
  waypoints: ImportedLocation[]; travelMode: TravelMode;
}
const unsupported = () => new HttpError(422, 'Unsupported Google Maps link. Copy an expanded directions or place link containing endpoint coordinates.');
const hosts = new Set(['maps.app.goo.gl', 'maps.google.com', 'www.google.com', 'google.com']);
export function mapsUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 8192 || /[\s\\\u0000-\u001f\u007f]/u.test(value.trim())) throw new HttpError(400, 'Invalid Google Maps URL');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new HttpError(400, 'Invalid Google Maps URL'); }
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || url.port || url.hash
    || (url.hostname === 'maps.app.goo.gl' ? !/^\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname)
      : url.hostname === 'maps.google.com' ? !/^(?:\/|\/maps(?:\/.*)?)$/.test(url.pathname) : !/^\/maps(?:\/.*)?$/.test(url.pathname))) {
    throw new HttpError(400, 'Only supported HTTPS Google Maps URLs are allowed');
  }
  return url;
}
function point(value: string | null, placeId: string | null = null): ImportedLocation | null {
  if (!value && !placeId) return null;
  if (placeId && (!/^[A-Za-z0-9_:\-]{1,256}$/.test(placeId))) throw unsupported();
  const label = value?.trim() ?? '';
  const pair = label.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (pair) {
    const latitude = Number(pair[1]), longitude = Number(pair[2]);
    if (!validCoordinates(latitude, longitude)) throw new HttpError(400, 'Invalid endpoint coordinates');
    return { name: null, latitude, longitude, placeId, coordinateSource: 'explicit' };
  }
  // Numeric-looking malformed pairs must not become apparently valid place names.
  if (label.includes(',') && /^[+\d.\-\s,]+$/.test(label)) throw new HttpError(400, 'Invalid endpoint coordinates');
  if (!label && !placeId) return null;
  if (label.length > 512 || /[\u0000-\u001f\u007f]/u.test(label)) throw unsupported();
  return { name: label || null, latitude: null, longitude: null, placeId, coordinateSource: null };
}
function usable(location: ImportedLocation | null): boolean { return location?.latitude !== null && location?.latitude !== undefined; }
function result(origin: ImportedLocation | null, destination: ImportedLocation | null, waypoints: ImportedLocation[], travelMode: TravelMode): JourneyImport {
  return { kind: 'journey', status: usable(origin) && usable(destination) && waypoints.every(usable) ? 'complete' : 'partial',
    origin, destination, waypoints, travelMode, location: null };
}
function mode(value: string | null): TravelMode {
  return value && ['driving', 'walking', 'bicycling', 'transit', 'two-wheeler'].includes(value) ? value as TravelMode : 'unknown';
}
function single(location: ImportedLocation | null): JourneyImport {
  if (!location) throw unsupported();
  return { kind: 'location', status: 'partial', origin: null, destination: null, location, waypoints: [], travelMode: 'unknown' };
}
// Recognize only the observed tagged fixed32 coordinate records. This is a URL
// encoding, not a Google API call. Unknown encodings remain unresolved.
function geocode(value: string): [number, number] | null {
  if (!/^[A-Za-z0-9_+\/-]{1,100}={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  if (![10, 28].includes(bytes.length) || bytes[0] !== 0x15 || bytes[5] !== 0x1d
    || (bytes.length === 28 && (bytes[10] !== 0x29 || bytes[19] !== 0x31))) return null;
  const latitude = bytes.readInt32LE(1) / 1e6, longitude = bytes.readInt32LE(6) / 1e6;
  return validCoordinates(latitude, longitude) ? [latitude, longitude] : null;
}
export function parseGoogleMaps(url: URL): JourneyImport {
  mapsUrl(url.href);
  const q = url.searchParams;
  for (const key of ['origin', 'destination', 'waypoints', 'origin_place_id', 'destination_place_id', 'waypoint_place_ids',
    'query', 'query_place_id', 'q', 'saddr', 'daddr', 'geocode', 'dirflg', 'travelmode', 'api', 'ftid']) {
    if (q.getAll(key).length > 1) throw new HttpError(400, 'Repeated Google Maps parameters are not supported');
  }
  if (q.has('origin') || q.has('destination') || q.has('saddr') || q.has('daddr') || /^\/maps\/dir\/?$/.test(url.pathname)) {
    const modern = q.has('origin') || q.has('destination') || q.has('api');
    if (modern && q.get('api') !== '1') throw unsupported();
    if (modern && (q.has('saddr') || q.has('daddr'))) throw unsupported();
    let origin = point(q.get(modern ? 'origin' : 'saddr'), q.get('origin_place_id'));
    let destination = point(q.get(modern ? 'destination' : 'daddr'), q.get('destination_place_id') ?? q.get('ftid'));
    const stops = q.has('waypoints') ? q.get('waypoints')!.split('|') : [];
    const stopIds = q.has('waypoint_place_ids') ? q.get('waypoint_place_ids')!.split('|') : [];
    if (stops.length > 9 || stops.some(s => !s.trim()) || (stopIds.length && stopIds.length !== stops.length)) throw unsupported();
    const waypoints = stops.map((s, i) => point(s, stopIds[i] ?? null)!);
    if (!modern && q.has('geocode')) {
      const records = q.get('geocode')!.split(';');
      // Match records by endpoint position, never by the first coordinate found.
      if (records.length === 2) {
        const locations = [origin, destination];
        const coordinates = records.map(geocode);
        const agrees = locations.every((p, i) => !usable(p) || !coordinates[i]
          || (Math.abs(p!.latitude! - coordinates[i]![0]) <= 0.000001 && Math.abs(p!.longitude! - coordinates[i]![1]) <= 0.000001));
        if (agrees && coordinates.every(Boolean)) [origin, destination] = locations.map((p, i) => p && !usable(p) && coordinates[i]
          ? { ...p, latitude: coordinates[i]![0], longitude: coordinates[i]![1], coordinateSource: 'google_geocode' as const } : p);
      }
    }
    return result(origin, destination, waypoints, modern ? mode(q.get('travelmode'))
      : ({ d: 'driving', w: 'walking', b: 'bicycling', r: 'transit' } as const)[q.get('dirflg') as 'd'] ?? 'unknown');
  }
  if (/^\/maps\/search\/?$/.test(url.pathname) && q.get('api') === '1') return single(point(q.get('query'), q.get('query_place_id')));
  if (q.has('q') && /^\/(?:maps\/?)?$/.test(url.pathname)) return single(point(q.get('q'), q.get('ftid')));
  const path = url.pathname;
  const decodePart = (part: string) => {
    try { return decodeURIComponent(part.replace(/\+/g, ' ')); } catch { throw new HttpError(400, 'Invalid Google Maps encoding'); }
  };
  const directions = path.match(/^\/maps\/dir\/(.*)$/);
  if (directions) {
    // Split URL structure before decoding names: %2F inside a name is not a stop.
    const rawParts = directions[1].split('/');
    const viewport = (p: string) => /^@-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,\d+(?:\.\d+)?z$/.test(p);
    const metadata = (p: string) => /^data=(?:!|%21)/i.test(p);
    const suffix = rawParts.findIndex(p => viewport(p) || metadata(p));
    if (suffix >= 0) {
      const tail = rawParts.slice(suffix).filter(Boolean);
      if (tail.length > 2 || tail.some((p, i) => !(i === 0 && viewport(p)) && !metadata(p))
        || tail.filter(metadata).length > 1) throw unsupported();
    }
    const parts = rawParts.map(decodePart);
    const endpoints = (suffix < 0 ? rawParts : rawParts.slice(0, suffix)).map(decodePart);
    while (endpoints.length && endpoints[endpoints.length - 1] === '') endpoints.pop();
    if (endpoints.length < 2 || endpoints.length > 11) throw unsupported();
    const points = endpoints.map(p => point(p));
    if (points.slice(1, -1).some(p => p === null)) throw unsupported();
    const data = parts.find(p => p.startsWith('data=')) ?? '';
    // Only the exact two-endpoint data shape verified by the supplied URL is
    // recognized. Do not apply its coordinate pair to ambiguous multi-stop data.
    const observed = data.match(/^data=!3m1!4b1!4m10!4m9!1m1!4e1!1m5!1m1!1s([^!]+)!2m2!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)!3e([01236])$/);
    if (points.length === 2 && usable(points[0]) && observed && points[1] && !usable(points[1])) {
      const latitude = Number(observed[3]), longitude = Number(observed[2]);
      if (!validCoordinates(latitude, longitude)) throw new HttpError(400, 'Invalid destination coordinates');
      points[1] = { ...points[1], name: points[1].name?.split(',')[0].trim() ?? null, latitude, longitude,
        placeId: point(null, observed[1])!.placeId, coordinateSource: 'google_url_data' };
    }
    const modes = [...data.matchAll(/!3e(\d+)(?=!|$)/g)];
    const travelMode = modes.length === 1 ? ({ 0: 'driving', 1: 'bicycling', 2: 'walking', 3: 'transit', 6: 'two-wheeler' } as const)[modes[0][1] as '0'] ?? 'unknown' : 'unknown';
    return result(points[0], points[points.length - 1], points.slice(1, -1).filter((p): p is ImportedLocation => p !== null), travelMode);
  }
  const place = path.match(/^\/maps\/place\/([^/]+)\//);
  if (place) {
    const p = point(decodePart(place[1]));
    // A place pin has a different encoding from a directions viewport.
    const data = decodePart(path.split('/').find(p => p.startsWith('data=')) ?? '');
    const pins = [...data.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
    if (p && pins.length === 1) {
      const latitude = Number(pins[0][1]), longitude = Number(pins[0][2]);
      if (!validCoordinates(latitude, longitude)) throw new HttpError(400, 'Invalid place coordinates');
      return single({ ...p, latitude, longitude, coordinateSource: 'google_url_data' });
    }
    return single(p);
  }
  throw unsupported();
}
