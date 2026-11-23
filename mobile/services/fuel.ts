import { InvalidPayload, object, timestamp } from './contracts';
import { array, branch, integer, literal, money, readItem, readList, text, units } from './private-contracts';
import type { Solution, OptimizationLine } from './optimization-contracts';
import type { DiscoveryRequest, Point } from './discovery';

export interface FuelSettings { consumption: string; price: string; currency: 'USD' | 'LBP' }
export interface FuelRequest { journey: DiscoveryRequest; fuel: FuelSettings; maxStores: number }
export function validFuel(value: FuelSettings): boolean {
  const decimal = (v: unknown) => typeof v === 'string' && /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(v);
  return decimal(value.consumption) && Number(value.consumption) > 0 && Number(value.consumption) <= 100
    && decimal(value.price) && (value.currency === 'USD' || value.currency === 'LBP');
}
const invalid = (): never => { throw new InvalidPayload('Invalid fuel comparison'); };
function metric(v: unknown, max = 5000000): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : invalid();
}
function point(value: unknown): Point {
  const p = object(value);
  if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number' || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)
    || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) invalid();
  return { latitude: p.latitude as number, longitude: p.longitude as number };
}
const samePoint = (a: Point, b: Point) => a.latitude === b.latitude && a.longitude === b.longitude;
const sameIds = (a: number[], b: number[]) => JSON.stringify(a) === JSON.stringify(b);
function exact(value: unknown) {
  const r = object(value);
  if (typeof r.numerator !== 'string' || !/^(0|[1-9]\d{0,1000})$/.test(r.numerator)
    || typeof r.denominator !== 'string' || !/^[1-9]\d{0,1000}$/.test(r.denominator)) invalid();
  return { numerator: BigInt(r.numerator as string), denominator: BigInt(r.denominator as string) };
}
function rendered(value: ReturnType<typeof exact>) {
  const cents = (value.numerator * 200n + value.denominator) / (2n * value.denominator);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
export function readFuelResult(value: unknown, listId: number, expected: FuelRequest) {
  const r = object(value), rawJourney = object(r.journey), settings = object(r.fuel);
  const journey = { origin: point(rawJourney.origin), destination: point(rawJourney.destination),
    waypoints: array(rawJourney.waypoints).map(point), maxDetourMinutes: rawJourney.maxDetourMinutes };
  if (!samePoint(journey.origin, expected.journey.origin) || !samePoint(journey.destination, expected.journey.destination)
    || journey.maxDetourMinutes !== expected.journey.maxDetourMinutes || journey.waypoints.length !== expected.journey.waypoints.length
    || !journey.waypoints.every((p, i) => samePoint(p, expected.journey.waypoints[i]))
    || settings.consumption !== expected.fuel.consumption || settings.price !== expected.fuel.price || settings.currency !== expected.fuel.currency
    || r.maximumStores !== expected.maxStores || typeof r.evaluationComplete !== 'boolean' || r.scope !== 'best_evaluated_plans'
    || r.estimated !== true || r.liveTraffic !== false || r.demonstrationData !== true) invalid();
  const shoppingList = readList({ shoppingList: r.shoppingList }, listId);
  if (!shoppingList.items.length || shoppingList.items.some(i => !i.product.isActive)) invalid();
  const required = new Map(shoppingList.items.map(i => [i.productId, i]));
  const excludedItems = array(r.excludedItems).map(item => readItem({ item }));
  if (excludedItems.some(i => i.product.isActive || required.has(i.productId))) invalid();
  const dedicated = samePoint(journey.origin, journey.destination);
  literal(r.distancePolicy, dedicated ? 'full_shopping_route' : 'nonnegative_additional_distance');
  const rawBaseline = object(r.baseline), baseline = { distanceMeters: metric(rawBaseline.distanceMeters), durationSeconds: metric(rawBaseline.durationSeconds, 604800) };
  const candidateBranchIds = array(r.candidateBranchIds).map(id => integer(id));
  if (candidateBranchIds.length > 3 || new Set(candidateBranchIds).size !== candidateBranchIds.length) invalid();
  const rawPlans = array(r.plans); if (rawPlans.length > 7) invalid();
  let previousTotal: ReturnType<typeof exact> | undefined;
  const planKeys = new Set<string>();
  const plans = rawPlans.map(value => {
    const p = object(value), g = object(p.grocery), branchIds = array(g.branchIds).map(id => integer(id));
    if (!branchIds.length || branchIds.length > expected.maxStores || branchIds.some((id, i) => !candidateBranchIds.includes(id) || (i > 0 && id <= branchIds[i - 1]))) invalid();
    const key = branchIds.join(','); if (planKeys.has(key)) invalid(); planKeys.add(key);
    const allocations = array(g.allocations).map(value => {
      const b = object(value);
      const items: OptimizationLine[] = array(b.items).map(value => {
        const l = object(value), productId = integer(l.productId), quantity = integer(l.quantity, 999);
        if (required.get(productId)?.quantity !== quantity || !['USD', 'LBP'].includes(String(l.originalCurrency))
          || !['recent', 'older', 'future'].includes(String(l.freshness))) invalid();
        const unitPriceUsdUnits = units(l.unitPriceUsdUnits), lineTotalUsdUnits = units(l.lineTotalUsdUnits), originalPrice = money(l.originalPrice);
        const originalHundredths = BigInt(originalPrice.replace('.', ''));
        if (originalHundredths <= 0n || originalHundredths * (l.originalCurrency === 'USD' ? 90000n : 1n) !== BigInt(unitPriceUsdUnits)
          || BigInt(unitPriceUsdUnits) * BigInt(quantity) !== BigInt(lineTotalUsdUnits)) invalid();
        return { productId, quantity, unitPriceUsdUnits, lineTotalUsdUnits, originalPrice, originalCurrency: l.originalCurrency as 'USD' | 'LBP',
          unitPriceUsd: money(l.unitPriceUsd), lineTotalUsd: money(l.lineTotalUsd), observedAt: timestamp(l.observedAt),
          freshness: l.freshness as OptimizationLine['freshness'], availability: literal(l.availability, 'unknown'),
          status: literal(l.status, 'verified'), sourceType: literal(l.sourceType, 'seed'), demonstrationData: literal(l.demonstrationData, true) };
      });
      const subtotalUsdUnits = units(b.subtotalUsdUnits);
      if (!items.length || items.reduce((n, l) => n + BigInt(l.lineTotalUsdUnits), 0n) !== BigInt(subtotalUsdUnits)) invalid();
      return { ...branch(b), items, subtotalUsdUnits, subtotalUsd: money(b.subtotalUsd) };
    });
    const productIds = allocations.flatMap(b => b.items.map(i => i.productId)).sort((a, b) => a - b);
    const totalUsdUnits = units(g.totalUsdUnits);
    if (!sameIds(allocations.map(b => b.branchId), branchIds) || !sameIds(productIds, [...required.keys()].sort((a, b) => a - b))
      || allocations.reduce((n, b) => n + BigInt(b.subtotalUsdUnits), 0n) !== BigInt(totalUsdUnits)) invalid();
    const grocery: Solution = { branchIds, allocations, totalUsdUnits, totalUsd: money(g.totalUsd) };
    const fuel = exact(p.fuelExactUsd), total = exact(p.totalExactUsd);
    if ((BigInt(totalUsdUnits) * fuel.denominator + fuel.numerator * 9000000n) * total.denominator
      !== total.numerator * 9000000n * fuel.denominator || rendered(fuel) !== p.fuelUsd || rendered(total) !== p.totalUsd
      || rendered({ numerator: BigInt(totalUsdUnits), denominator: 9000000n }) !== grocery.totalUsd) invalid();
    if (previousTotal && previousTotal.numerator * total.denominator > total.numerator * previousTotal.denominator) invalid();
    previousTotal = total;
    const routeDistanceMeters = metric(p.routeDistanceMeters), routeDurationSeconds = metric(p.routeDurationSeconds, 604800);
    const chargedDistanceMeters = metric(p.chargedDistanceMeters);
    if (Math.abs(chargedDistanceMeters - (dedicated ? routeDistanceMeters : Math.max(0, routeDistanceMeters - baseline.distanceMeters))) > 1e-7
      || routeDurationSeconds - baseline.durationSeconds < -1 || (dedicated ? routeDurationSeconds : Math.max(0, routeDurationSeconds - baseline.durationSeconds)) > expected.journey.maxDetourMinutes * 60) invalid();
    const visitOrder = array(p.visitOrder).map(id => integer(id)), routePoints = array(p.routePoints).map(point);
    if (!sameIds([...visitOrder].sort((a, b) => a - b), branchIds) || routePoints.length !== 2 + journey.waypoints.length + branchIds.length
      || !samePoint(routePoints[0], journey.origin) || !samePoint(routePoints[routePoints.length - 1], journey.destination)) invalid();
    let cursor = 1;
    for (const stop of journey.waypoints) {
      while (cursor < routePoints.length - 1 && !samePoint(routePoints[cursor], stop)) cursor++;
      if (cursor >= routePoints.length - 1) invalid(); cursor++;
    }
    if (typeof p.fuelLiters !== 'string' || !/^\d+\.\d{6}$/.test(p.fuelLiters)) invalid();
    return { grocery, fuelUsd: money(p.fuelUsd), totalUsd: money(p.totalUsd), fuelLiters: p.fuelLiters as string,
      chargedDistanceMeters, routeDistanceMeters, routeDurationSeconds, visitOrder, routePoints };
  });
  const excludedBranches = array(r.excludedBranches).map(v => { const e = object(v); return { branchId: integer(e.branchId), reason: text(e.reason) }; });
  const routeFailures = array(r.routeFailures).map(v => { const e = object(v); return { branchIds: array(e.branchIds).map(id => integer(id)), reason: text(e.reason) }; });
  if (r.evaluationComplete && (excludedBranches.some(b => ['candidate_limit', 'missing_coordinates', 'invalid_coordinates', 'duplicate_location'].includes(b.reason))
    || routeFailures.some(f => !['no_route', 'snap_too_far'].includes(f.reason)))) invalid();
  const evaluations = r.routeEvaluations;
  if (typeof evaluations !== 'number' || !Number.isInteger(evaluations) || evaluations < 0 || evaluations > 24) invalid();
  literal(r.status, plans.length ? 'available' : 'unavailable');
  if (typeof r.evaluatedAt !== 'string' || !Number.isFinite(Date.parse(r.evaluatedAt))) invalid();
  return { shoppingList, plans, excludedItems, excludedBranches, routeFailures, baseline, evaluationComplete: r.evaluationComplete as boolean,
    distancePolicy: dedicated ? 'full_shopping_route' as const : 'nonnegative_additional_distance' as const };
}
export type FuelResult = ReturnType<typeof readFuelResult>;
export function fuelNavigation(points: Point[]): string {
  if (points.length < 3 || points.length > 11) throw new Error('Unsupported route');
  const pair = (p: Point) => `${point(p).latitude},${point(p).longitude}`;
  return 'https://www.google.com/maps/dir/?' + new URLSearchParams({ api: '1', travelmode: 'driving',
    origin: pair(points[0]), destination: pair(points[points.length - 1]), waypoints: points.slice(1, -1).map(pair).join('|') }).toString();
}
