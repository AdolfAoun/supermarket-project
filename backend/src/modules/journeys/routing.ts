import { createHash } from 'node:crypto';
import { setTimeout as setNodeTimeout } from 'node:timers';
import { coordinate, distanceMeters, validCoordinates, validGeometry, validPosition, type Coordinate, type Position } from '../shared/geo.js';

export type RoutingFailure = 'no_route' | 'snap_too_far' | 'unavailable' | 'rate_limited' | 'timeout' | 'invalid_response' | 'cancelled' | 'busy';
export class RoutingError extends Error {
  constructor(public readonly reason: RoutingFailure) { super(`Road routing ${reason}`); }
}
export interface RoadRoute { distanceMeters: number; durationSeconds: number; geometry: Position[] | null }
export interface RoutingAttribution { label: string; url: string; fixMapUrl: string }
export const DEFAULT_OSRM_BASE_URL = 'https://routing.openstreetmap.de/routed-car';
export const osrmAttribution: RoutingAttribution = { label: 'Routing: OSRM · Map data © OpenStreetMap contributors',
  url: 'https://project-osrm.org', fixMapUrl: 'https://www.openstreetmap.org/fixthemap' };
export interface RoutingAdapter { attribution?: RoutingAttribution; route(points: Coordinate[], geometry: boolean, signal?: AbortSignal): Promise<RoadRoute> }
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new RoutingError('invalid_response');
  return v as Record<string, unknown>;
};
const measure = (v: unknown, max: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) throw new RoutingError('invalid_response');
  return v;
};
export function readRoadRoute(value: unknown, points: Coordinate[], needGeometry: boolean): RoadRoute {
  const data = record(value);
  if (data.code === 'NoRoute' || data.code === 'NoSegment') throw new RoutingError('no_route');
  if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length !== 1 || !Array.isArray(data.waypoints)
    || data.waypoints.length !== points.length) throw new RoutingError('invalid_response');
  const waypoints = data.waypoints.map((v, i) => {
    const w = record(v);
    if (!validPosition(w.location)) throw new RoutingError('invalid_response');
    if (distanceMeters(points[i], coordinate(w.location)) > 250 || measure(w.distance, 100000) > 250) throw new RoutingError('snap_too_far');
    return w.location;
  });
  const r = record(data.routes[0]);
  const distance = measure(r.distance, 5000000), duration = measure(r.duration, 604800);
  if (!Array.isArray(r.legs) || r.legs.length !== points.length - 1) throw new RoutingError('invalid_response');
  let legDistance = 0, legDuration = 0;
  for (const leg of r.legs) { const l = record(leg); legDistance += measure(l.distance, 5000000); legDuration += measure(l.duration, 604800); }
  if (Math.abs(legDistance - distance) > points.length || Math.abs(legDuration - duration) > points.length) throw new RoutingError('invalid_response');
  let geometry: Position[] | null = null;
  if (needGeometry) {
    const g = record(r.geometry);
    if (g.type !== 'LineString' || !validGeometry(g.coordinates)) throw new RoutingError('invalid_response');
    geometry = g.coordinates;
    if (distanceMeters(coordinate(geometry[0]), coordinate(waypoints[0])) > 30
      || distanceMeters(coordinate(geometry[geometry.length - 1]), coordinate(waypoints[waypoints.length - 1])) > 30) throw new RoutingError('invalid_response');
  }
  return { distanceMeters: distance, durationSeconds: duration, geometry };
}
export function routingUrl(value: string): string {
  const u = new URL(value);
  if ((u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))
    || u.username || u.password || u.search || u.hash) throw new Error('OSRM_BASE_URL must be HTTPS (or loopback HTTP), without credentials/query/fragment');
  return u.href.replace(/\/+$/, '');
}
export function createOsrmAdapter(options: {
  baseUrl: string; fetch?: typeof fetch; intervalMs?: number; timeoutMs?: number; cacheMs?: number;
  now?: () => number; wait?: (milliseconds: number) => Promise<void>;
}): RoutingAdapter {
  const base = routingUrl(options.baseUrl), transport = options.fetch ?? fetch;
  const now = options.now ?? Date.now, wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const interval = Math.max(options.fetch ? 0 : 1000, options.intervalMs ?? 1100);
  const cache = new Map<string, { expires: number; value: RoadRoute; version: number }>();
  const inFlight = new Map<string, Promise<RoadRoute>>();
  let tail: Promise<unknown> = Promise.resolve(), queued = 0, lastStart = -Infinity, cooldown = 0, cacheVersion = 0;
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    if (queued >= 32) return Promise.reject(new RoutingError('busy'));
    queued++;
    const task = tail.then(work).finally(() => { queued--; });
    tail = task.catch(() => {});
    return task;
  }
  async function load(points: Coordinate[], geometry: boolean): Promise<RoadRoute> {
    if (now() < cooldown) throw new RoutingError('rate_limited');
    await wait(Math.max(0, lastStart + interval - now())); lastStart = now();
    const url = `${base}/route/v1/driving/${points.map(p => `${p.longitude},${p.latitude}`).join(';')}?overview=${geometry ? 'full' : 'false'}&geometries=geojson&steps=false&alternatives=false&continue_straight=false&radiuses=${points.map(() => 250).join(';')}`;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 7000);
    try {
      const response = await transport(url, { signal: controller.signal, redirect: 'error',
        headers: { Accept: 'application/json', 'User-Agent': 'LebanonSupermarketCapstone/1.0' } });
      if (response.status === 429) { void response.body?.cancel(); cooldown = now() + 60000; throw new RoutingError('rate_limited'); }
      if (!response.ok) {
        if (response.status !== 400) { void response.body?.cancel(); throw new RoutingError('unavailable'); }
      }
      const reader = response.body?.getReader();
      if (!reader) throw new RoutingError('invalid_response');
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 1000000) { await reader.cancel(); throw new RoutingError('invalid_response'); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return readRoadRoute(parsed, points, geometry);
    } catch (error) {
      if (error instanceof RoutingError) throw error;
      throw new RoutingError(controller.signal.aborted ? 'timeout' : error instanceof SyntaxError ? 'invalid_response' : 'unavailable');
    } finally { clearTimeout(timer); }
  }
  return {
    attribution: base === DEFAULT_OSRM_BASE_URL ? { ...osrmAttribution, label: 'Routing: OSRM / FOSSGIS · Map data © OpenStreetMap contributors',
      url: 'https://routing.openstreetmap.de/about.html' } : osrmAttribution,
    async route(points, geometry, signal) {
      if (signal?.aborted) throw new RoutingError('cancelled');
      if (points.length < 2 || points.length > 11 || points.some(p => !validCoordinates(p.latitude, p.longitude))) throw new RoutingError('invalid_response');
      points = points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
      const key = createHash('sha256').update(JSON.stringify([points, geometry])).digest('hex');
      const cached = cache.get(key);
      if (cached && cached.expires > now()) return structuredClone(cached.value);
      if (cached) cache.delete(key);
      let task = inFlight.get(key);
      if (!task) {
        task = enqueue(async () => {
          const value = await load(points, geometry);
          if (cache.size >= 128) cache.delete(cache.keys().next().value!);
          const version = ++cacheVersion;
          const entry = { value, expires: now() + (options.cacheMs ?? 300000), version };
          cache.set(key, entry);
          // Retain only the key/version in expiry closures, not evicted geometry.
          const expiry: unknown = setNodeTimeout(() => { if (cache.get(key)?.version === version) cache.delete(key); }, options.cacheMs ?? 300000);
          // RN's ambient timer types also participate in cross-package tests.
          if (typeof expiry === 'object' && expiry !== null && 'unref' in expiry && typeof expiry.unref === 'function') expiry.unref();
          return value;
        }).finally(() => { inFlight.delete(key); });
        inFlight.set(key, task);
      }
      // Shared requests may serve another caller; abort only this wait. Future
      // detour requests stop when the discovery operation's signal is cancelled.
      return new Promise((resolve, reject) => {
        const abort = () => reject(new RoutingError('cancelled'));
        signal?.addEventListener('abort', abort, { once: true });
        task!.then(v => { if (!signal?.aborted) resolve(structuredClone(v)); else abort(); }, reject)
          .finally(() => signal?.removeEventListener('abort', abort));
      });
    },
  };
}
