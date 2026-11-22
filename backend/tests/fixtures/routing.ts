import type { Coordinate, Position } from '../../src/modules/shared/geo.js';
export const routePoints: Coordinate[] = [{ latitude: 34, longitude: 35.6 }, { latitude: 34.1, longitude: 35.65 }];
export function osrmResponse(points = routePoints, distance = 18000, duration = 1500) {
  return { code: 'Ok', waypoints: points.map(p => ({ location: [p.longitude, p.latitude], distance: 0 })),
    routes: [{ distance, duration, geometry: { type: 'LineString', coordinates: points.map(p => [p.longitude, p.latitude] as Position) },
      legs: points.slice(1).map(() => ({ distance: distance / (points.length - 1), duration: duration / (points.length - 1) })) }] };
}
