import { HttpError } from '../../middleware/errors.js';
import { body } from '../shared/validation.js';
import { distanceToRouteMeters, routeEnvelope, validCoordinates, validGeometry, type Coordinate } from '../shared/geo.js';
import { detour, readJourneyRequest, type JourneyRequest } from '../journeys/discover.js';
import { RoutingError, osrmAttribution, type RoutingAdapter, type RoadRoute } from '../journeys/routing.js';
import { generateBasketCandidates, prepareBasket, type BasketSolution } from './optimize.js';
import type { BasketSnapshot } from './repository.js';
import { combinedCost, compareFractions, displayFraction, fuelCost, readFuelSettings, serializeFraction, type FuelSettings } from './fuel.js';

export interface TripRequest { journey: JourneyRequest; fuel: FuelSettings; maxStores: number }
export function readTripRequest(value: unknown): TripRequest {
  const r = body(value, ['journey', 'fuel', 'maxStores']);
  const maxStores = r.maxStores ?? 2;
  if (typeof maxStores !== 'number' || ![1, 2, 3].includes(maxStores)) throw new HttpError(400, 'Choose 1, 2 or 3 branches');
  return { journey: readJourneyRequest(r.journey), fuel: readFuelSettings(r.fuel), maxStores };
}

// Interleave every branch permutation with the ORIGINAL stops, preserving their
// relative order. Lazy generation lets the caller stop before expensive work.
export function* stopOrders(existing: Coordinate[], stores: (Coordinate & { branchId: number })[], chosen: (Coordinate & { branchId?: number })[] = []): Generator<(Coordinate & { branchId?: number })[]> {
  if (!existing.length && !stores.length) { yield chosen; return; }
  if (existing.length) yield* stopOrders(existing.slice(1), stores, [...chosen, existing[0]]);
  for (let i = 0; i < stores.length; i++) yield* stopOrders(existing, stores.filter((_, j) => i !== j), [...chosen, stores[i]]);
}
function checkedRoute(route: RoadRoute) {
  if (![route.distanceMeters, route.durationSeconds].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    || route.distanceMeters > 5000000 || route.durationSeconds > 604800) throw new RoutingError('invalid_response');
  return route;
}
function tripPlan(grocery: BasketSolution, route: RoadRoute, baseline: RoadRoute, dedicated: boolean, fuel: FuelSettings,
  stops: (Coordinate & { branchId?: number })[], journey: JourneyRequest) {
  const calculated = fuelCost(route.distanceMeters, baseline.distanceMeters, dedicated, fuel);
  const total = combinedCost(grocery.totalUsdUnits, calculated.cost);
  return { grocery, routeDistanceMeters: route.distanceMeters, routeDurationSeconds: route.durationSeconds,
    chargedDistanceMeters: dedicated ? route.distanceMeters : Math.max(0, route.distanceMeters - baseline.distanceMeters),
    fuelLiters: displayFraction(calculated.liters, 6), fuelUsd: displayFraction(calculated.cost), totalUsd: displayFraction(total),
    fuelExactUsd: serializeFraction(calculated.cost), totalExactUsd: serializeFraction(total),
    visitOrder: stops.flatMap(p => p.branchId === undefined ? [] : [p.branchId]),
    routePoints: [journey.origin, ...stops.map(p => ({ latitude: p.latitude, longitude: p.longitude })), journey.destination] };
}
type TripPlan = ReturnType<typeof tripPlan>;
function comparePlans(a: TripPlan, b: TripPlan) {
  const exact = (p: TripPlan) => ({ numerator: BigInt(p.totalExactUsd.numerator), denominator: BigInt(p.totalExactUsd.denominator) });
  const different = a.grocery.branchIds.findIndex((id, i) => id !== b.grocery.branchIds[i]);
  return compareFractions(exact(a), exact(b)) || a.grocery.branchIds.length - b.grocery.branchIds.length
    || (different < 0 ? 0 : a.grocery.branchIds[different] - b.grocery.branchIds[different])
    || a.routeDistanceMeters - b.routeDistanceMeters || a.routeDurationSeconds - b.routeDurationSeconds
    || a.visitOrder.join(',').localeCompare(b.visitOrder.join(','), 'en');
}
export async function optimizeTrip(snapshot: BasketSnapshot, input: TripRequest, routing: RoutingAdapter,
  signal?: AbortSignal, now = new Date(), freshnessDays = 30) {
  input = readTripRequest(input);
  const { journey, fuel, maxStores } = input;
  const { active, excludedItems, byBranch } = prepareBasket(snapshot, now, freshnessDays);
  const baseline = checkedRoute(await routing.route([journey.origin, ...journey.waypoints, journey.destination], true, signal));
  if (!validGeometry(baseline.geometry)) throw new RoutingError('invalid_response');
  const withinEnvelope = routeEnvelope(baseline.geometry!, 3000);
  const dedicated = journey.origin.latitude === journey.destination.latitude && journey.origin.longitude === journey.destination.longitude;
  const excludedBranches: { branchId: number; reason: string }[] = [];
  const located: { branchId: number; latitude: number; longitude: number; proximity: number }[] = [];
  const locations = new Map(snapshot.locations?.map(p => [p.branchId, p]));
  const physical = new Set<string>();
  for (const branch of byBranch.values()) {
    const p = locations.get(branch.branchId);
    const reason = !branch.lines.size ? 'no_eligible_prices' : !p || p.latitude === null || p.longitude === null ? 'missing_coordinates'
      : !validCoordinates(p.latitude, p.longitude) ? 'invalid_coordinates' : null;
    if (reason) { excludedBranches.push({ branchId: branch.branchId, reason }); continue; }
    const point = { branchId: branch.branchId, latitude: p!.latitude!, longitude: p!.longitude! };
    const key = `${branch.supermarketId}:${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`;
    if (physical.has(key)) { excludedBranches.push({ branchId: branch.branchId, reason: 'duplicate_location' }); continue; }
    physical.add(key);
    const proximity = withinEnvelope(point) ? distanceToRouteMeters(point, baseline.geometry!) : Infinity;
    if (proximity > 3000) excludedBranches.push({ branchId: branch.branchId, reason: 'outside_corridor' });
    else located.push({ ...point, proximity });
  }
  located.sort((a, b) => a.proximity - b.proximity || a.branchId - b.branchId);
  for (const b of located.slice(3)) excludedBranches.push({ branchId: b.branchId, reason: 'candidate_limit' });
  const selected = located.slice(0, 3).sort((a, b) => a.branchId - b.branchId);
  const candidates = [...generateBasketCandidates(selected.map(b => byBranch.get(b.branchId)!), active.map(i => i.productId), maxStores)];
  const unique = [...new Map(candidates.map(c => [c.branchIds.join(','), c])).values()]
    .sort((a, b) => a.branchIds.length - b.branchIds.length || a.branchIds.join(',').localeCompare(b.branchIds.join(','), 'en'));
  const plans: TripPlan[] = [], routeFailures: { branchIds: number[]; reason: string }[] = [];
  let routeEvaluations = 0, evaluationComplete = !excludedBranches.some(b => ['candidate_limit', 'missing_coordinates', 'invalid_coordinates', 'duplicate_location'].includes(b.reason));
  for (const grocery of unique) {
    if (grocery.branchIds.length + journey.waypoints.length > 9) {
      evaluationComplete = false; routeFailures.push({ branchIds: grocery.branchIds, reason: 'stop_limit' }); continue;
    }
    let best: TripPlan | null = null;
    for (const stops of stopOrders(journey.waypoints, grocery.branchIds.map(id => selected.find(b => b.branchId === id)!))) {
      if (signal?.aborted && !(signal.reason instanceof RoutingError && signal.reason.reason === 'timeout')) throw new RoutingError('cancelled');
      if (routeEvaluations >= 24 || signal?.aborted) {
        evaluationComplete = false; routeFailures.push({ branchIds: grocery.branchIds, reason: signal?.aborted ? 'timeout' : 'evaluation_limit' }); break;
      }
      routeEvaluations++;
      try {
        const route = checkedRoute(await routing.route([journey.origin, ...stops, journey.destination], false, signal));
        const delta = detour(baseline, route);
        if (!delta) throw new RoutingError('invalid_response');
        const extraTime = dedicated ? route.durationSeconds : delta.additionalDurationSeconds;
        if (extraTime > journey.maxDetourMinutes * 60) continue;
        const plan = tripPlan(grocery, route, baseline, dedicated, fuel, stops, journey);
        if (!best || comparePlans(plan, best) < 0) best = plan;
      } catch (error) {
        if (!(error instanceof RoutingError)) throw error;
        if (error.reason === 'cancelled' && !signal?.aborted) throw error;
        if (error.reason === 'cancelled' && !(signal?.reason instanceof RoutingError && signal.reason.reason === 'timeout')) throw error;
        if (!['no_route', 'snap_too_far'].includes(error.reason)) evaluationComplete = false;
        routeFailures.push({ branchIds: grocery.branchIds, reason: error.reason });
      }
    }
    if (best) plans.push(best);
  }
  plans.sort(comparePlans);
  return { shoppingList: { ...snapshot.shoppingList, items: active }, maximumStores: maxStores, journey, fuel,
    distancePolicy: dedicated ? 'full_shopping_route' as const : 'nonnegative_additional_distance' as const,
    baseline: { distanceMeters: baseline.distanceMeters, durationSeconds: baseline.durationSeconds },
    status: plans.length ? 'available' as const : 'unavailable' as const, plans, excludedItems,
    excludedBranches, routeFailures, routeEvaluations, evaluationComplete, scope: 'best_evaluated_plans' as const,
    candidateBranchIds: selected.map(b => b.branchId), estimated: true as const, liveTraffic: false as const,
    evaluatedAt: now.toISOString(), freshnessDays, demonstrationData: true as const,
    attribution: routing.attribution ?? osrmAttribution };
}
