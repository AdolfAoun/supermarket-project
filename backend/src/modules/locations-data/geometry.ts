import { validPosition, type Position } from '../shared/geo.js';

type Polygon = Position[][];
export function ringContains(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function ring(value: unknown): Position[] {
  if (!Array.isArray(value) || value.length < 4 || value.length > 20000 || !value.every(validPosition)) throw new Error('Invalid polygon ring');
  const points = value as Position[];
  if (!equal(points[0], points[points.length - 1])) throw new Error('Unclosed polygon ring');
  return points;
}
const equal = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];
export function polygons(value: unknown): Polygon[] {
  const g = value as { type?: unknown; coordinates?: unknown };
  if (!g || !Array.isArray(g.coordinates)) throw new Error('Missing geometry');
  const raw = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  if (!raw.length || raw.length > 100) throw new Error('Unsupported polygon geometry');
  let count = 0;
  return raw.map(p => {
    if (!Array.isArray(p) || !p.length || p.length > 100) throw new Error('Invalid polygon');
    const rings = p.map(ring); count += rings.reduce((n, r) => n + r.length, 0);
    if (count > 20000) throw new Error('Oversized polygon geometry');
    return rings;
  });
}
export const polygonContains = (point: Position, p: Polygon) => ringContains(point, p[0]) && !p.slice(1).some(h => ringContains(point, h));
export const withinBoundary = (point: Position, boundary: unknown) => polygons(boundary).some(p => polygonContains(point, p));

// Choose the widest interior horizontal interval; unlike a bbox/vertex centroid,
// this stays inside concave polygons and outside holes. It is NOT an entrance.
export function representative(value: unknown): { point: Position; method: 'osm_point' | 'interior_point' } {
  const g = value as { type?: unknown; coordinates?: unknown };
  if (g?.type === 'Point' && validPosition(g.coordinates)) return { point: g.coordinates, method: 'osm_point' };
  let best: { point: Position; width: number } | null = null;
  for (const p of polygons(value)) {
    const ys = [...new Set(p.flat().map(v => v[1]))].sort((a, b) => a - b);
    // Bound work on very detailed polygons. Any missed interval causes review,
    // never a fallback to a point outside the polygon.
    for (let i = 1; i < ys.length; i += Math.max(1, Math.ceil(ys.length / 128))) {
      const y = (ys[i - 1] + ys[i]) / 2, xs: number[] = [];
      for (const r of p) for (let j = 1; j < r.length; j++) {
        const a = r[j - 1], b = r[j];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let j = 1; j < xs.length; j++) {
        const point: Position = [(xs[j - 1] + xs[j]) / 2, y], width = xs[j] - xs[j - 1];
        if (width > 0 && polygonContains(point, p) && (!best || width > best.width)) best = { point, width };
      }
    }
  }
  if (!best) throw new Error('No safe polygon interior');
  return { point: best.point, method: 'interior_point' };
}

// Overpass `out geom` relations contain member-way geometries. Assemble by exact
// shared endpoints; unsupported/missing/open rings fail for manual review.
export function overpassGeometry(element: Record<string, unknown>): unknown {
  const positions = (v: unknown): Position[] => {
    if (!Array.isArray(v)) throw new Error('Missing way geometry');
    return v.map(p => { const x = p as { lon: number; lat: number }; const pair: Position = [x.lon, x.lat]; if (!validPosition(pair)) throw new Error('Invalid way coordinate'); return pair; });
  };
  if (element.type === 'node') return { type: 'Point', coordinates: [element.lon, element.lat] };
  if (element.type === 'way') return { type: 'Polygon', coordinates: [positions(element.geometry)] };
  if (element.type !== 'relation' || !Array.isArray(element.members)) throw new Error('Unsupported OSM geometry');
  const groups: Record<string, Position[][]> = { outer: [], inner: [] };
  if (element.members.length > 1000) throw new Error('Oversized relation');
  for (const member of element.members as Record<string, unknown>[]) {
    if (member.type !== 'way' || !['', 'outer', 'inner'].includes(String(member.role))) throw new Error('Unsupported relation member');
    groups[member.role === 'inner' ? 'inner' : 'outer'].push(positions(member.geometry));
  }
  function assemble(parts: Position[][]): Position[][] {
    const result: Position[][] = [];
    while (parts.length) {
      let current = parts.shift()!;
      while (!equal(current[0], current[current.length - 1])) {
        const index = parts.findIndex(p => equal(p[0], current[current.length - 1]) || equal(p[p.length - 1], current[current.length - 1]));
        if (index < 0) throw new Error('Incomplete relation ring');
        let next = parts.splice(index, 1)[0];
        if (!equal(next[0], current[current.length - 1])) next = [...next].reverse();
        current = current.concat(next.slice(1));
        if (current.length > 20000) throw new Error('Oversized relation ring');
      }
      result.push(ring(current));
    }
    return result;
  }
  const outers = assemble(groups.outer), inners = assemble(groups.inner);
  const result = outers.map(outer => [outer]);
  for (const hole of inners) {
    const owners = outers.map((p, i) => ringContains(hole[0], p) ? i : -1).filter(i => i >= 0);
    if (owners.length !== 1) throw new Error('Ambiguous relation hole');
    result[owners[0]].push(hole);
  }
  return { type: 'MultiPolygon', coordinates: result };
}
