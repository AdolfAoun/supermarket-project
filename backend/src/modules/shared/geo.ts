export interface Coordinate { latitude: number; longitude: number }
export type Position = [number, number]; // GeoJSON: longitude, latitude
export function validCoordinates(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}
export const validPosition = (p: unknown): p is Position => Array.isArray(p) && p.length === 2
  && typeof p[0] === 'number' && typeof p[1] === 'number' && validCoordinates(p[1], p[0]);
const radians = (n: number) => n * Math.PI / 180;
const radius = 6371008.8;
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const lat = radians(b.latitude - a.latitude), lon = radians(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
export const coordinate = ([longitude, latitude]: Position): Coordinate => ({ latitude, longitude });
// Conservative envelope only: the half-longest-arc allowance covers curvature
// between sparse geometry vertices. Exact spherical corridor testing still follows.
export function routeEnvelope(geometry: Position[], corridorMeters: number): (point: Coordinate) => boolean {
  if (!validGeometry(geometry) || corridorMeters < 0 || !Number.isFinite(corridorMeters)) throw new Error('Invalid route envelope');
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180, longest = 0;
  for (let i = 0; i < geometry.length; i++) {
    const [lon, lat] = geometry[i]; minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    if (i) longest = Math.max(longest, distanceMeters(coordinate(geometry[i - 1]), coordinate(geometry[i])));
  }
  const padding = (corridorMeters + longest / 2) / radius * 180 / Math.PI;
  const latitude = Math.max(Math.abs(minLat), Math.abs(maxLat)) + padding;
  const longitudePadding = latitude >= 85 ? 180 : padding / Math.cos(radians(latitude));
  const wraps = maxLon - minLon > 180 || minLon - longitudePadding < -180 || maxLon + longitudePadding > 180;
  return p => p.latitude >= minLat - padding && p.latitude <= maxLat + padding
    && (wraps || latitude >= 85 || (p.longitude >= minLon - longitudePadding && p.longitude <= maxLon + longitudePadding));
}
function bearing(a: Coordinate, b: Coordinate): number {
  const lon = radians(b.longitude - a.longitude), x = radians(a.latitude), y = radians(b.latitude);
  return Math.atan2(Math.sin(lon) * Math.cos(y), Math.cos(x) * Math.sin(y) - Math.sin(x) * Math.cos(y) * Math.cos(lon));
}
export function validGeometry(value: unknown): value is Position[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 20000 && value.every(validPosition);
}
// Spherical point-to-shortest-arc distance, in meters, including segment ends.
// Geography only prefilters candidates; it never supplies a driving distance.
export function distanceToRouteMeters(point: Coordinate, geometry: Position[]): number {
  if (!validCoordinates(point.latitude, point.longitude) || !validGeometry(geometry)) throw new Error('Invalid route geometry');
  let minimum = Infinity;
  for (let i = 1; i < geometry.length; i++) {
    const a = coordinate(geometry[i - 1]), b = coordinate(geometry[i]);
    const length = distanceMeters(a, b) / radius, fromStart = distanceMeters(a, point) / radius;
    if (length < 1e-12) { minimum = Math.min(minimum, fromStart * radius); continue; }
    const angle = bearing(a, point) - bearing(a, b);
    const along = Math.atan2(Math.sin(fromStart) * Math.cos(angle), Math.cos(fromStart));
    const cross = Math.asin(Math.max(-1, Math.min(1, Math.sin(fromStart) * Math.sin(angle))));
    minimum = Math.min(minimum, along >= 0 && along <= length ? Math.abs(cross) * radius
      : Math.min(fromStart * radius, distanceMeters(b, point)));
  }
  return minimum;
}
