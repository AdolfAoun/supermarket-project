import { InvalidPayload, object } from './contracts';
import { ApiError } from './api';
import type { Optimization } from './optimization-contracts';
import { usableLocation, type JourneyDraft } from './journey';

export interface Point { latitude: number; longitude: number }
export interface DiscoveryRequest { origin: Point; destination: Point; waypoints: Point[]; maxDetourMinutes: number }
export interface RouteOption extends Point {
  branchId: number; branch: string; supermarketId: number; supermarket: string; address: string;
  journeyDistanceMeters: number; journeyDurationSeconds: number; additionalDistanceMeters: number;
  additionalDurationSeconds: number; rawDurationDeltaSeconds: number; insertionIndex: number;
}
export interface Discovery {
  journey: DiscoveryRequest; baseline: { distanceMeters: number; durationSeconds: number }; options: RouteOption[];
  exclusions: { branchId: number; reason: string }[]; evaluationComplete: boolean; evaluatedAt: string; estimated: true; liveTraffic: false;
  attribution: { label: string; url: string; fixMapUrl: string };
}
const invalid = (): never => { throw new InvalidPayload('Invalid route discovery response'); };
function point(v: unknown): Point {
  const p = object(v);
  if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number' || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)
    || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) invalid();
  return { latitude: p.latitude as number, longitude: p.longitude as number };
}
export function discoveryRequest(draft: JourneyDraft): DiscoveryRequest {
  if (draft.travelMode !== 'driving' || draft.place || !usableLocation(draft.origin) || !usableLocation(draft.destination)
    || !draft.waypoints.every(usableLocation) || draft.waypoints.length > 8) throw new ApiError('http', 'Import a complete driving journey with at most eight existing stops.');
  return { origin: point(draft.origin), destination: point(draft.destination), waypoints: draft.waypoints.map(point), maxDetourMinutes: 30 };
}
export function readDiscovery(value: unknown, expected: DiscoveryRequest): Discovery {
  const r = object(value), rawJourney = object(r.journey), baseline = object(r.baseline);
  const number = (v: unknown, max = 5000000) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : invalid();
  const integer = (v: unknown, max = 4294967295) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max ? v : invalid();
  const text = (v: unknown) => typeof v === 'string' && v.trim() && v.length <= 512 ? v : invalid();
  const journey = { origin: point(rawJourney.origin), destination: point(rawJourney.destination),
    waypoints: Array.isArray(rawJourney.waypoints) ? rawJourney.waypoints.map(point) : invalid(), maxDetourMinutes: rawJourney.maxDetourMinutes };
  const samePoint = (a: Point, b: Point) => a.latitude === b.latitude && a.longitude === b.longitude;
  if (!samePoint(journey.origin, expected.origin) || !samePoint(journey.destination, expected.destination)
    || journey.maxDetourMinutes !== expected.maxDetourMinutes || journey.waypoints.length !== expected.waypoints.length
    || !journey.waypoints.every((p, i) => samePoint(p, expected.waypoints[i]))
    || !Array.isArray(r.options) || r.options.length > 20 || !Array.isArray(r.exclusions)
    || typeof r.evaluationComplete !== 'boolean' || r.estimated !== true || r.liveTraffic !== false
    || typeof r.evaluatedAt !== 'string' || !Number.isFinite(Date.parse(r.evaluatedAt))) invalid();
  const baselineDistance = number(baseline.distanceMeters), baselineDuration = number(baseline.durationSeconds, 604800);
  const ids = new Set<number>();
  const options = (r.options as unknown[]).map(v => {
    const b = object(v), branchId = integer(b.branchId);
    if (ids.has(branchId)) invalid(); ids.add(branchId);
    const journeyDistanceMeters = number(b.journeyDistanceMeters), journeyDurationSeconds = number(b.journeyDurationSeconds, 604800);
    const additionalDurationSeconds = number(b.additionalDurationSeconds, expected.maxDetourMinutes * 60);
    const rawDelta = journeyDurationSeconds - baselineDuration;
    const deltaDistance = journeyDistanceMeters - baselineDistance;
    const distance = deltaDistance < 0 && deltaDistance >= -1 ? 0 : deltaDistance;
    if (rawDelta < -1 || Math.abs(additionalDurationSeconds - Math.max(0, rawDelta)) > 1e-7
      || typeof b.additionalDistanceMeters !== 'number' || !Number.isFinite(b.additionalDistanceMeters) || Math.abs(b.additionalDistanceMeters - distance) > 1e-7
      || b.rawDurationDeltaSeconds !== rawDelta || !Number.isInteger(b.insertionIndex) || Number(b.insertionIndex) < 0
      || Number(b.insertionIndex) > expected.waypoints.length) invalid();
    return { ...point(b), branchId, branch: text(b.branch), supermarketId: integer(b.supermarketId), supermarket: text(b.supermarket), address: text(b.address),
      journeyDistanceMeters, journeyDurationSeconds, additionalDistanceMeters: distance, additionalDurationSeconds,
      rawDurationDeltaSeconds: rawDelta, insertionIndex: Number(b.insertionIndex) };
  });
  for (let i = 1; i < options.length; i++) {
    const a = options[i - 1], b = options[i];
    if (a.additionalDurationSeconds > b.additionalDurationSeconds || (a.additionalDurationSeconds === b.additionalDurationSeconds
      && (a.additionalDistanceMeters > b.additionalDistanceMeters || (a.additionalDistanceMeters === b.additionalDistanceMeters && a.branchId > b.branchId)))) invalid();
  }
  const reasons = ['missing_coordinates', 'invalid_coordinates', 'outside_corridor', 'duplicate_location', 'evaluation_limit',
    'no_route', 'snap_too_far', 'routing_unavailable', 'inconsistent_route', 'above_detour_limit'];
  const exclusions = (r.exclusions as unknown[]).map(v => {
    const e = object(v); if (!reasons.includes(String(e.reason))) invalid(); return { branchId: integer(e.branchId), reason: String(e.reason) };
  });
  if (r.evaluationComplete && exclusions.some(e => ['evaluation_limit', 'routing_unavailable', 'inconsistent_route'].includes(e.reason))) invalid();
  const attribution = object(r.attribution);
  if (!['https://routing.openstreetmap.de/about.html', 'https://project-osrm.org'].includes(String(attribution.url)) || attribution.fixMapUrl !== 'https://www.openstreetmap.org/fixthemap') invalid();
  return { journey: expected, baseline: { distanceMeters: baselineDistance, durationSeconds: baselineDuration }, options, exclusions,
    evaluationComplete: r.evaluationComplete as boolean, evaluatedAt: r.evaluatedAt as string, estimated: true, liveTraffic: false,
    attribution: { label: text(attribution.label), url: String(attribution.url), fixMapUrl: String(attribution.fixMapUrl) } };
}
export const DEFAULT_DETOUR_MINUTES = 8;
export function filterDetours(result: Discovery, minutes: number): RouteOption[] {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 30) throw new Error('Invalid detour threshold');
  return result.options.filter(o => o.additionalDurationSeconds <= minutes * 60);
}
export function navigationUrl(journey: DiscoveryRequest, selected: RouteOption): string {
  point(journey.origin); point(journey.destination); point(selected);
  if (!Number.isInteger(selected.insertionIndex) || selected.insertionIndex < 0 || selected.insertionIndex > journey.waypoints.length) throw new Error('Invalid insertion');
  const same = (p: Point) => p.latitude === selected.latitude && p.longitude === selected.longitude;
  const stops = journey.waypoints.some(same) ? journey.waypoints : [...journey.waypoints.slice(0, selected.insertionIndex), selected, ...journey.waypoints.slice(selected.insertionIndex)];
  if (stops.length > 9) throw new ApiError('http', 'Google Maps supports at most nine intermediate stops in this link.');
  const pair = (p: Point) => `${point(p).latitude},${point(p).longitude}`;
  const query = new URLSearchParams({ api: '1', origin: pair(journey.origin), destination: pair(journey.destination), travelmode: 'driving', waypoints: stops.map(pair).join('|') });
  const url = `https://www.google.com/maps/dir/?${query}`;
  if (url.length > 2048) throw new ApiError('http', 'This journey is too long for a Google Maps navigation link.');
  return url;
}
export type BranchBasket = { status: 'complete'; totalUsd: string; oldestObservedAt: string; olderPrices: number; futurePrices: number }
  | { status: 'partial'; covered: number; required: number } | { status: 'unavailable' | 'not_loaded' };
export function branchBasket(option: RouteOption, pricing: Optimization | null): BranchBasket {
  if (!pricing) return { status: 'not_loaded' };
  const sameBranch = (b: { branchId: number; branch: string; supermarketId: number; supermarket: string }) =>
    b.branchId === option.branchId && b.supermarketId === option.supermarketId && b.branch === option.branch && b.supermarket === option.supermarket;
  const complete = pricing.comparison.eligibleBranches.find(sameBranch);
  if (complete) return { status: 'complete', totalUsd: complete.totalUsd,
    oldestObservedAt: complete.items.map(i => i.observedAt).sort()[0], olderPrices: complete.items.filter(i => i.freshness === 'older').length,
    futurePrices: complete.items.filter(i => i.freshness === 'future').length };
  const incomplete = pricing.comparison.incompleteBranches.find(sameBranch);
  const required = pricing.comparison.shoppingList.items.length;
  return incomplete && incomplete.missingProductIds.length < required ? { status: 'partial', covered: required - incomplete.missingProductIds.length, required }
    : { status: 'unavailable' };
}
export function driveTime(seconds: number): string {
  const rounded = Math.round(seconds), minutes = Math.floor(rounded / 60), rest = rounded % 60;
  return minutes ? `${minutes} min${rest ? ` ${rest} sec` : ''}` : rounded ? `${rounded} sec` : seconds > 0 ? 'under 1 sec' : '0 min';
}
