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

// Perpendicular distance from a point to a single line segment a->b,
// approximated in a local equirectangular projection (fine for short in-city segments).
function distanceToSegmentMeters(point: Coordinate, a: Coordinate, b: Coordinate): number {
  const refLat = toRad(a.lat)
  const project = (c: Coordinate) => ({
    x: toRad(c.lng - a.lng) * Math.cos(refLat) * EARTH_RADIUS_M,
    y: toRad(c.lat - a.lat) * EARTH_RADIUS_M,
  })

  const p = project(point)
  const o = { x: 0, y: 0 }
  const d = project(b)

  const segX = d.x - o.x
  const segY = d.y - o.y
  const lenSq = segX ** 2 + segY ** 2

  if (lenSq === 0) return Math.hypot(p.x - o.x, p.y - o.y)

  let t = ((p.x - o.x) * segX + (p.y - o.y) * segY) / lenSq
  t = Math.max(0, Math.min(1, t))

  const closest = { x: o.x + t * segX, y: o.y + t * segY }
  return Math.hypot(p.x - closest.x, p.y - closest.y)
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

// Auto-generates evenly spaced "breadcrumb" checkpoints between origin and
// destination (excluding both endpoints, which are marked separately).
// Used only as a fallback when no real route path is available.
export function generateCheckpoints(
  origin: Coordinate,
  destination: Coordinate,
  intervalMeters = 200,
): Coordinate[] {
  const count = Math.round(distanceMeters(origin, destination) / intervalMeters)
  const checkpoints: Coordinate[] = []
  for (let i = 1; i < count; i++) {
    checkpoints.push(interpolate(origin, destination, i / count))
  }
  return checkpoints
}

// Same "breadcrumb" idea, but walked along a real multi-point path (e.g. a
// walking/transit route polyline) instead of a straight line.
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
