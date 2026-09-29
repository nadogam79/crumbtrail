import type { Breadcrumb, Coordinate, RouteLeg, RouteSettings } from '../types'

const EARTH_RADIUS_M = 6371000

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
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
export function distanceToRouteMeters(point: Coordinate, origin: Coordinate, destination: Coordinate): number {
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
      return [
        [...path.slice(0, i + 1), cut],
        [cut, ...path.slice(i + 1)],
      ]
    }
    travelled += segLen
  }
  return [path, []]
}

// 빵 조각(체크포인트) 간격: 기본 200m, 경로가 길면 전체 개수가 MAX_CRUMBS를 넘지 않도록 간격을 늘린다
const MIN_CRUMB_INTERVAL_METERS = 200
const MAX_CRUMBS = 30

export const checkpointIntervalMeters = (totalMeters: number) =>
  Math.max(MIN_CRUMB_INTERVAL_METERS, totalMeters / MAX_CRUMBS)

// 이탈/진행도 판정에 쓰는 경로. 실제 경로를 못 받았으면 출발-도착 직선.
export function routeLegsOrStraight(route: RouteSettings): RouteLeg[] {
  const legs = route.legs?.filter((l) => l.path.length > 1) ?? []
  if (legs.length > 0) return legs
  const distance = distanceMeters(route.origin, route.destination)
  return [
    { mode: 'WALK', path: [route.origin, route.destination], distanceMeters: distance, minutes: route.etaMinutes },
  ]
}

// 경로 객체는 바뀌지 않으므로(바뀌면 새 객체) 이어 붙인 경로를 경로마다 한 번만 만든다
const routePathCache = new WeakMap<RouteSettings, Coordinate[]>()

export function routePath(route: RouteSettings): Coordinate[] {
  let path = routePathCache.get(route)
  if (!path) {
    path = routeLegsOrStraight(route).flatMap((leg) => leg.path)
    routePathCache.set(route, path)
  }
  return path
}

// 위치 하나가 경로를 따라 어디쯤인지(m). 이탈 허용 거리 밖이면 진행으로 인정하지 않고 0.
export function crumbProgressMeters(route: RouteSettings, coord: Coordinate): number {
  const { alongMeters, offMeters } = projectOntoPath(coord, routePath(route))
  return offMeters <= route.deviationThresholdMeters ? alongMeters : 0
}

// 경로를 따라 어디까지 왔는지(m). 경로에서 이탈 허용 거리 안에 있던 위치만 인정하고,
// GPS가 흔들려 뒤로 튀어도 진행도가 줄지 않도록 지금까지의 최댓값을 쓴다.
// 기록 전체를 다시 훑으므로 경로가 바뀔 때만 쓰고, 이동 중에는 crumbProgressMeters로 최댓값을 이어간다.
export function routeProgressMeters(route: RouteSettings, breadcrumbs: Breadcrumb[]): number {
  return breadcrumbs.reduce((max, crumb) => Math.max(max, crumbProgressMeters(route, crumb.coord)), 0)
}

// 경로 앞부분 meters만큼을 이동수단을 유지한 채 잘라낸다 (재탐지 때 지나온 구간 보존용)
export function legsUpTo(legs: RouteLeg[], meters: number): RouteLeg[] {
  const result: RouteLeg[] = []
  let legStart = 0
  for (const leg of legs) {
    if (meters <= legStart) break
    const length = pathLengthMeters(leg.path)
    const [done] = splitPathAt(leg.path, meters - legStart)
    if (done.length > 1) {
      const ratio = length > 0 ? Math.min(1, (meters - legStart) / length) : 1
      result.push({ ...leg, path: done, distanceMeters: leg.distanceMeters * ratio, minutes: leg.minutes * ratio })
    }
    legStart += length
  }
  return result
}
