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

// Perpendicular distance from a point to the straight line segment origin->destination,
// approximated in a local equirectangular projection (fine for short in-city segments).
export function distanceToRouteMeters(
  point: Coordinate,
  origin: Coordinate,
  destination: Coordinate,
): number {
  const refLat = toRad(origin.lat)
  const project = (c: Coordinate) => ({
    x: toRad(c.lng - origin.lng) * Math.cos(refLat) * EARTH_RADIUS_M,
    y: toRad(c.lat - origin.lat) * EARTH_RADIUS_M,
  })

  const p = project(point)
  const o = { x: 0, y: 0 }
  const d = project(destination)

  const segX = d.x - o.x
  const segY = d.y - o.y
  const lenSq = segX ** 2 + segY ** 2

  if (lenSq === 0) return Math.hypot(p.x - o.x, p.y - o.y)

  let t = ((p.x - o.x) * segX + (p.y - o.y) * segY) / lenSq
  t = Math.max(0, Math.min(1, t))

  const closest = { x: o.x + t * segX, y: o.y + t * segY }
  return Math.hypot(p.x - closest.x, p.y - closest.y)
}

export function interpolate(a: Coordinate, b: Coordinate, t: number): Coordinate {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  }
}

// Auto-generates evenly spaced "breadcrumb" checkpoints between origin and
// destination (excluding both endpoints, which are marked separately).
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
