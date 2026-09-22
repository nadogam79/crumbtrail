import type { Breadcrumb, Coordinate } from '../types'

const VIEW = 320
const PAD = 24

function project(coord: Coordinate, bounds: ReturnType<typeof getBounds>) {
  const { minLat, maxLat, minLng, maxLng } = bounds
  const latSpan = maxLat - minLat || 0.0001
  const lngSpan = maxLng - minLng || 0.0001
  const x = PAD + ((coord.lng - minLng) / lngSpan) * (VIEW - PAD * 2)
  const y = PAD + (1 - (coord.lat - minLat) / latSpan) * (VIEW - PAD * 2)
  return { x, y }
}

function getBounds(points: Coordinate[]) {
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  }
}

export function BreadcrumbTrail({
  origin,
  destination,
  breadcrumbs,
}: {
  origin: Coordinate
  destination: Coordinate
  breadcrumbs: Breadcrumb[]
}) {
  const current = breadcrumbs[breadcrumbs.length - 1]?.coord ?? origin
  const bounds = getBounds([origin, destination, current, ...breadcrumbs.map((b) => b.coord)])

  const o = project(origin, bounds)
  const d = project(destination, bounds)
  const c = project(current, bounds)
  const trailPoints = breadcrumbs.map((b) => project(b.coord, bounds))

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="breadcrumb-trail" role="img" aria-label="이동 경로 미리보기">
      <line x1={o.x} y1={o.y} x2={d.x} y2={d.y} className="trail-planned" />
      {trailPoints.length > 1 && (
        <polyline
          points={trailPoints.map((p) => `${p.x},${p.y}`).join(' ')}
          className="trail-actual"
        />
      )}
      <circle cx={o.x} cy={o.y} r={7} className="trail-origin" />
      <circle cx={d.x} cy={d.y} r={7} className="trail-destination" />
      <circle cx={c.x} cy={c.y} r={6} className="trail-current" />
    </svg>
  )
}
