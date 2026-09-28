import type { Coordinate } from '../types'

const EARTH_RADIUS_M = 6371000

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

// Projects a point onto segment a->b in a local equirectangular projection (fine for
// short in-city segments). t is the position along the segment (0..1), offMeters the
// perpendicular distance to it.
function projectOntoSegment(point: Coordinate, a: Coordinate, b: Coordinate): { t: number; offMeters: number } {
  const refLat = toRad(a.lat)
  const project = (c: Coordinate) => ({
    x: toRad(c.lng - a.lng) * Math.cos(refLat) * EARTH_RADIUS_M,
    y: toRad(c.lat - a.lat) * EARTH_RADIUS_M,
  })

  const p = project(point)
  const d = project(b)
  const lenSq = d.x ** 2 + d.y ** 2

  if (lenSq === 0) return { t: 0, offMeters: Math.hypot(p.x, p.y) }

  const t = Math.max(0, Math.min(1, (p.x * d.x + p.y * d.y) / lenSq))
  return { t, offMeters: Math.hypot(p.x - t * d.x, p.y - t * d.y) }
}

function distanceToSegmentMeters(point: Coordinate, a: Coordinate, b: Coordinate): number {
  return projectOntoSegment(point, a, b).offMeters
}

// Straight-line origin->destination fallback, used when no real route path is available.
export function distanceToRouteMeters(
  point: Coordinate,
  origin: Coordinate,
  destination: Coordinate,
): number {
  return distanceToSegmentMeters(point, origin, destination)
}

// Minimum distance from a point to any segment of a multi-point path
// (e.g. a real walking/transit route polyline made of several legs).
export function distanceToPolylineMeters(point: Coordinate, path: Coordinate[]): number {
  if (path.length === 0) return Infinity
  if (path.length === 1) return distanceMeters(point, path[0])

  let min = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    const d = distanceToSegmentMeters(point, path[i], path[i + 1])
    if (d < min) min = d
  }
  return min
}

export function interpolate(a: Coordinate, b: Coordinate, t: number): Coordinate {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  }
}

// Evenly spaced "breadcrumb" points walked along a multi-point path (e.g. a
// walking/transit route polyline). The i-th sample sits (i + 1) * intervalMeters from the start.
export function sampleAlongPath(path: Coordinate[], intervalMeters = 200): Coordinate[] {
  if (path.length < 2) return []

  const samples: Coordinate[] = []
  let sinceLastSample = 0

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    const segLen = distanceMeters(a, b)
    let travelled = 0

    while (sinceLastSample + (segLen - travelled) >= intervalMeters) {
      travelled += intervalMeters - sinceLastSample
      samples.push(interpolate(a, b, segLen === 0 ? 0 : travelled / segLen))
      sinceLastSample = 0
    }

    sinceLastSample += segLen - travelled
  }

  return samples
}

export function pathLengthMeters(path: Coordinate[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) total += distanceMeters(path[i - 1], path[i])
  return total
}

// Where a point sits along a path: alongMeters is the distance from the path start to the
// closest point on the path, offMeters how far the point is from the path.
export function projectOntoPath(point: Coordinate, path: Coordinate[]): { alongMeters: number; offMeters: number } {
  let best = { alongMeters: 0, offMeters: Infinity }
  let travelled = 0
  for (let i = 0; i < path.length - 1; i++) {
    const segLen = distanceMeters(path[i], path[i + 1])
    const { t, offMeters } = projectOntoSegment(point, path[i], path[i + 1])
    if (offMeters < best.offMeters) best = { alongMeters: travelled + t * segLen, offMeters }
    travelled += segLen
  }
  return best
}

// Splits a path at the given distance from its start into [before, after]. The split point
// is shared by both halves so they draw as one continuous line.
export function splitPathAt(path: Coordinate[], meters: number): [Coordinate[], Coordinate[]] {
  if (meters <= 0) return [[], path]
  let travelled = 0
  for (let i = 0; i < path.length - 1; i++) {
    const segLen = distanceMeters(path[i], path[i + 1])
    if (travelled + segLen >= meters) {
      const cut = interpolate(path[i], path[i + 1], segLen === 0 ? 0 : (meters - travelled) / segLen)
      return [[...path.slice(0, i + 1), cut], [cut, ...path.slice(i + 1)]]
    }
    travelled += segLen
  }
  return [path, []]
}
