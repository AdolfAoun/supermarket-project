import { HttpError } from '../../middleware/errors.js';
import type { Supermarket } from '../catalog/repository.js';
import { body } from '../shared/validation.js';
import { distanceMeters, distanceToRouteMeters, routeEnvelope, validCoordinates, type Coordinate } from '../shared/geo.js';
import { osrmAttribution, RoutingError, type RoutingAdapter, type RoadRoute } from './routing.js';

export interface JourneyRequest { origin: Coordinate; destination: Coordinate; waypoints: Coordinate[]; maxDetourMinutes: number }
export function readJourneyRequest(value: unknown): JourneyRequest {
  const input = body(value, ['origin', 'destination', 'waypoints', 'maxDetourMinutes']);
  function point(value: unknown): Coordinate {
    const p = body(value, ['latitude', 'longitude']);
    if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number' || !validCoordinates(p.latitude, p.longitude)) {
      throw new HttpError(400, 'Invalid journey coordinates');
    }
    return { latitude: p.latitude, longitude: p.longitude };
  }
  const origin = point(input.origin), destination = point(input.destination);
  if (input.waypoints !== undefined && (!Array.isArray(input.waypoints) || input.waypoints.length > 8)) throw new HttpError(400, 'Use at most eight existing journey stops');
  const waypoints = (input.waypoints as unknown[] | undefined ?? []).map(point);
  const maxDetourMinutes = input.maxDetourMinutes === undefined ? 30 : input.maxDetourMinutes;
  if (typeof maxDetourMinutes !== 'number' || !Number.isInteger(maxDetourMinutes) || maxDetourMinutes < 0 || maxDetourMinutes > 30) throw new HttpError(400, 'Maximum detour must be 0–30 whole minutes');
  const points = [origin, ...waypoints, destination];
  if (points.slice(1).reduce((n, p, i) => n + distanceMeters(points[i], p), 0) > 500000) throw new HttpError(422, 'Journey exceeds the 500 km demonstration limit');
  return { origin, destination, waypoints, maxDetourMinutes };
}
export interface DiscoveryBranch extends Coordinate { branchId: number; branch: string; supermarketId: number; supermarket: string; address: string }
export interface DetourOption extends DiscoveryBranch {
  journeyDistanceMeters: number; journeyDurationSeconds: number;
  additionalDistanceMeters: number; additionalDurationSeconds: number; rawDurationDeltaSeconds: number;
  insertionIndex: number;
}
export type ExclusionReason = 'missing_coordinates' | 'invalid_coordinates' | 'outside_corridor' | 'duplicate_location' | 'evaluation_limit'
  | 'no_route' | 'snap_too_far' | 'routing_unavailable' | 'inconsistent_route' | 'above_detour_limit';
export interface DiscoveryResult {
  journey: JourneyRequest; baseline: { distanceMeters: number; durationSeconds: number };
  options: DetourOption[]; exclusions: { branchId: number; reason: ExclusionReason }[];
  evaluationComplete: boolean; evaluatedAt: string; estimated: true; liveTraffic: false;
  attribution: { label: string; url: string; fixMapUrl: string };
}
export function detour(baseline: RoadRoute, shopping: RoadRoute): { additionalDistanceMeters: number; additionalDurationSeconds: number; rawDurationDeltaSeconds: number } | null {
  if (![baseline.distanceMeters, baseline.durationSeconds, shopping.distanceMeters, shopping.durationSeconds].every(n => Number.isFinite(n) && n >= 0)) return null;
  const seconds = shopping.durationSeconds - baseline.durationSeconds;
  // A constrained fastest route cannot materially beat the baseline fastest time.
  // Up to one second accommodates provider rounding; retain the raw delta.
  if (seconds < -1) return null;
  const meters = shopping.distanceMeters - baseline.distanceMeters;
  return { additionalDistanceMeters: meters < 0 && meters >= -1 ? 0 : meters,
    additionalDurationSeconds: Math.max(0, seconds), rawDurationDeltaSeconds: seconds };
}
export async function discoverSupermarkets(journey: JourneyRequest, supermarkets: Supermarket[], routing: RoutingAdapter,
  signal?: AbortSignal, now = new Date()): Promise<DiscoveryResult> {
  const points = [journey.origin, ...journey.waypoints, journey.destination];
  const baseline = await routing.route(points, true, signal);
  if (!baseline.geometry) throw new RoutingError('invalid_response');
  const withinEnvelope = routeEnvelope(baseline.geometry, 3000);
  const exclusions: DiscoveryResult['exclusions'] = [];
  const candidates: { branch: DiscoveryBranch; proximity: number }[] = [];
  const ids = new Set<number>(), locations = new Set<string>();
  for (const s of [...supermarkets].sort((a, b) => a.id - b.id)) for (const b of [...s.branches].sort((a, b) => a.id - b.id)) {
    if (ids.has(b.id)) throw new Error('Duplicate catalog branch ID'); ids.add(b.id);
    const exclude = (reason: ExclusionReason) => exclusions.push({ branchId: b.id, reason });
    if (b.latitude === null || b.longitude === null) { exclude('missing_coordinates'); continue; }
    if (!validCoordinates(b.latitude, b.longitude)) { exclude('invalid_coordinates'); continue; }
    const locationKey = `${s.id}:${b.latitude.toFixed(6)}:${b.longitude.toFixed(6)}`;
    if (locations.has(locationKey)) { exclude('duplicate_location'); continue; } locations.add(locationKey);
    const branch = { branchId: b.id, branch: b.name, supermarketId: s.id, supermarket: s.name, address: b.address,
      latitude: b.latitude, longitude: b.longitude };
    if (!withinEnvelope(branch)) { exclude('outside_corridor'); continue; }
    const proximity = distanceToRouteMeters(branch, baseline.geometry);
    if (proximity > 3000) { exclude('outside_corridor'); continue; }
    candidates.push({ branch, proximity });
  }
  candidates.sort((a, b) => a.proximity - b.proximity || a.branch.branchId - b.branch.branchId);
  // Every insertion position is tested, preserving all imported stop order.
  // Bound public-provider work explicitly; do not hide unevaluated branches.
  const candidateLimit = Math.min(20, Math.floor(24 / (points.length - 1)));
  for (const c of candidates.slice(candidateLimit)) exclusions.push({ branchId: c.branch.branchId, reason: 'evaluation_limit' });
  const options: DetourOption[] = [];
  for (const { branch } of candidates.slice(0, candidateLimit)) {
    let best: DetourOption | null = null;
    const failures = new Set<ExclusionReason>();
    for (let insertionIndex = 0; insertionIndex < points.length - 1; insertionIndex++) {
      try {
        if (signal?.aborted) throw new RoutingError('cancelled');
        const shopping = await routing.route([...points.slice(0, insertionIndex + 1), branch, ...points.slice(insertionIndex + 1)], false, signal);
        const delta = detour(baseline, shopping);
        if (!delta) { failures.add('inconsistent_route'); continue; }
        const option = { ...branch, ...delta, journeyDistanceMeters: shopping.distanceMeters,
          journeyDurationSeconds: shopping.durationSeconds, insertionIndex };
        if (!best || option.additionalDurationSeconds < best.additionalDurationSeconds
          || (option.additionalDurationSeconds === best.additionalDurationSeconds && option.journeyDistanceMeters < best.journeyDistanceMeters)) best = option;
      } catch (error) {
        if (!(error instanceof RoutingError)) throw error;
        // Client disconnects cancel the request. A server deadline returns the
        // successful work and explicitly marks every unfinished branch.
        if (error.reason === 'cancelled' && !(signal?.reason instanceof RoutingError && signal.reason.reason === 'timeout')) throw error;
        failures.add(error.reason === 'no_route' || error.reason === 'snap_too_far' ? error.reason : 'routing_unavailable');
      }
    }
    // A successful insertion is usable even if another insertion was unreachable;
    // if provider errors prevented a full evaluation, disclose the uncertainty.
    if (best && best.additionalDurationSeconds <= journey.maxDetourMinutes * 60) options.push(best);
    else if (best) exclusions.push({ branchId: branch.branchId, reason: 'above_detour_limit' });
    for (const reason of failures) exclusions.push({ branchId: branch.branchId, reason });
  }
  options.sort((a, b) => a.additionalDurationSeconds - b.additionalDurationSeconds || a.additionalDistanceMeters - b.additionalDistanceMeters || a.branchId - b.branchId);
  return { journey, baseline: { distanceMeters: baseline.distanceMeters, durationSeconds: baseline.durationSeconds }, options, exclusions,
    evaluationComplete: !exclusions.some(e => ['evaluation_limit', 'routing_unavailable', 'inconsistent_route'].includes(e.reason)),
    evaluatedAt: now.toISOString(), estimated: true, liveTraffic: false, attribution: routing.attribution ?? osrmAttribution };
}
