import { useEffect, useRef, useState } from 'react'
import { loadKakaoMaps } from '../lib/kakaoMaps'
import { checkpointIntervalMeters, pathLengthMeters, sampleAlongPath, splitPathAt } from '../lib/geo'
import type { Coordinate, RouteLeg, TransitMode } from '../types'

interface RouteMapProps {
  origin: Coordinate | null
  destination: Coordinate | null
  current?: Coordinate | null
  legs?: RouteLeg[] | null
  // 값이 바뀔 때마다 현재 위치를 지도 중앙으로 옮긴다 (내 위치 버튼용)
  recenterKey?: number
  // 경로 시작점부터 이미 지나온 거리(m). 이 지점까지는 회색으로 그린다
  progressMeters?: number
  // 빵 조각 간격(m). 없으면 경로 길이로 정한다
  crumbIntervalMeters?: number
  className?: string
}

// 경로 한 구간(leg)과 그 구간에 지금 그려진 선. drawnAt은 선을 그릴 때의 구간 내 진행 거리(m).
interface LegDraw {
  mode: TransitMode
  path: Coordinate[]
  dashed?: boolean
  start: number
  length: number
  lines: any[]
  drawnAt: number | null
}

interface RouteDraw {
  legs: LegDraw[]
  // passedAt: 경로 시작부터 이 거리를 지나면 지난 빵 조각
  crumbs: { coord: Coordinate; el: HTMLElement; passedAt: number }[]
  // 지난 빵 조각 수. null이면 아직 진행도를 반영하지 않은 새 경로
  passedCount: number | null
}

const DEFAULT_CENTER: Coordinate = { lat: 37.5665, lng: 126.978 } // 서울시청 (지도 초기값)

const LEG_COLOR: Record<TransitMode, string> = {
  WALK: '#f97316',
  BUS: '#2563eb',
  SUBWAY: '#16a34a',
}
const PASSED_COLOR = '#9aa1a8'
const ROUTE_WEIGHT = 6
// 빵 조각을 지날 때 띄우는 효과 길이. CSS 애니메이션(.kakao-crumb-burst)과 맞춘다.
const CRUMB_BURST_MS = 900

export function RouteMap({
  origin,
  destination,
  current,
  legs,
  recenterKey,
  progressMeters,
  crumbIntervalMeters,
  className = 'route-map',
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const currentOverlayRef = useRef<any>(null)
  // 지금 그려진 경로의 구간별 선과 빵 조각. 경로가 바뀔 때 새로 만든다.
  const routeDrawRef = useRef<RouteDraw | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return
        const center = origin ?? DEFAULT_CENTER
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: 4,
        })
        setMapReady(true)
      })
      .catch((err: Error) => setError(err.message))
    return () => {
      cancelled = true
    }
    // Map is created once; origin changes afterwards just recenter via the overlay effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 경로가 바뀔 때만 핀·빵 조각을 새로 만든다. 이동 중 진행도가 바뀔 때는 아래 effect가
  // 진행 지점이 걸친 구간의 선과 빵 조각 표시만 고친다. 지도 범위는 건드리지 않는다(그 아래 effect 담당).
  useEffect(() => {
    if (!mapReady) return
    const kakao = window.kakao
    const map = mapRef.current
    const overlays: any[] = []
    const show = (overlay: any) => {
      overlay.setMap(map)
      overlays.push(overlay)
    }
    const pin = (position: Coordinate, html: string) =>
      show(
        new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(position.lat, position.lng),
          content: html,
          yAnchor: 1.4,
          zIndex: 3,
        }),
      )

    let draw: RouteDraw | null = null
    if (origin) pin(origin, '<div class="kakao-pin kakao-pin-origin">출발</div>')
    if (origin && destination) {
      pin(destination, '<div class="kakao-pin kakao-pin-destination">도착</div>')

      // 실제 경로를 못 받았으면 출발-도착 직선을 추정 경로(점선)로 그린다
      const hasRealLegs = !!legs && legs.some((l) => l.path.length > 1)
      // 추정 직선과 재탐지 연결 구간은 점선으로 그린다
      const drawLegs: { mode: TransitMode; path: Coordinate[]; dashed?: boolean }[] = hasRealLegs
        ? legs!.filter((l) => l.path.length > 1).map((l) => ({ ...l, dashed: l.connector }))
        : [{ mode: 'WALK', path: [origin, destination], dashed: true }]

      let legStart = 0
      const legDraws = drawLegs.map((leg) => {
        const length = pathLengthMeters(leg.path)
        const draw: LegDraw = { ...leg, start: legStart, length, lines: [], drawnAt: null }
        legStart += length
        return draw
      })

      // 빵조각은 이동수단과 상관없이 전체 경로를 이어서 뿌린다. leg별로 뿌리면 버스/지하철
      // 구간과 200m보다 짧은 도보 구간에는 하나도 찍히지 않는다. 지나온 빵조각은 흐리게(아래 effect).
      const fullPath = drawLegs.flatMap((leg) => leg.path)
      const interval = crumbIntervalMeters ?? checkpointIntervalMeters(pathLengthMeters(fullPath))
      const crumbs = sampleAlongPath(fullPath, interval).map((coord, i) => {
        const el = document.createElement('div')
        el.className = 'kakao-crumb'
        el.innerHTML = '<span>🍞</span>'
        show(
          new kakao.maps.CustomOverlay({
            position: new kakao.maps.LatLng(coord.lat, coord.lng),
            content: el,
            zIndex: 2,
          }),
        )
        return { coord, el, passedAt: (i + 1) * interval }
      })

      // passedCount가 null이면 처음 그리는 것이라 이미 지난 빵 조각에 효과를 내지 않는다(새 경로, 재탐지)
      draw = { legs: legDraws, crumbs, passedCount: null }
    }
    routeDrawRef.current = draw

    return () => {
      overlays.forEach((overlay) => overlay.setMap(null))
      // 구간 선은 아래 effect가 이 draw에 붙여둔 것
      draw?.legs.forEach((leg) => leg.lines.forEach((line) => line.setMap(null)))
      if (routeDrawRef.current === draw) routeDrawRef.current = null
    }
  }, [mapReady, origin, destination, legs, crumbIntervalMeters])

  // 진행도 반영: 지나온 구간(progressMeters까지)은 회색, 남은 구간은 이동수단별 색.
  // 진행 지점이 걸친 구간만 선을 다시 그린다. 위 effect 바로 뒤에 돌아야 하므로 순서를 바꾸지 않는다.
  useEffect(() => {
    const draw = routeDrawRef.current
    if (!mapReady || !draw) return
    const kakao = window.kakao
    const map = mapRef.current
    const passed = progressMeters ?? 0

    // 흰 테두리 선을 먼저 깔고 그 위에 색 선을 올려 지도 배경과 분리한다
    const line = (target: any[], path: Coordinate[], style: { color: string; dashed?: boolean }, zIndex: number) => {
      if (path.length < 2) return
      const kakaoPath = path.map((c) => new kakao.maps.LatLng(c.lat, c.lng))
      const outline = new kakao.maps.Polyline({
        path: kakaoPath,
        strokeWeight: ROUTE_WEIGHT + 4,
        strokeColor: '#ffffff',
        strokeOpacity: 1,
        zIndex,
      })
      const colored = new kakao.maps.Polyline({
        path: kakaoPath,
        strokeWeight: ROUTE_WEIGHT,
        strokeColor: style.color,
        strokeOpacity: 1,
        strokeStyle: style.dashed ? 'shortdash' : 'solid',
        zIndex: zIndex + 1,
      })
      outline.setMap(map)
      colored.setMap(map)
      target.push(outline, colored)
    }

    draw.legs.forEach((leg) => {
      // 이 구간 안에서 지나온 거리. 전부 지났거나 아직 안 들어선 구간은 값이 그대로라 다시 그리지 않는다.
      const local = Math.max(0, Math.min(leg.length, passed - leg.start))
      if (leg.drawnAt === local) return
      leg.lines.forEach((l) => l.setMap(null))
      leg.lines = []
      // 끝까지 지난 구간은 자르지 않는다(끝점에서 자르면 길이 0짜리 색 선이 남는다)
      const [done, remaining] = local >= leg.length ? [leg.path, []] : splitPathAt(leg.path, local)
      line(leg.lines, done, { color: PASSED_COLOR, dashed: leg.dashed }, 1)
      line(leg.lines, remaining, { color: LEG_COLOR[leg.mode], dashed: leg.dashed }, 3)
      leg.drawnAt = local
    })

    const passedCount = draw.crumbs.filter((c) => c.passedAt <= passed).length
    draw.crumbs.forEach((c, i) => c.el.classList.toggle('kakao-crumb-passed', i < passedCount))

    // 새로 지난 빵 조각에만 효과를 띄웠다가 시간이 지나면 지운다
    const prevCount = draw.passedCount
    draw.passedCount = passedCount
    if (prevCount !== null && passedCount > prevCount) {
      draw.crumbs.slice(prevCount, passedCount).forEach(({ coord }) => {
        const burst = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(coord.lat, coord.lng),
          content: '<div class="kakao-crumb-burst"><span class="kakao-crumb-burst-ring"></span><span>🍞</span></div>',
          zIndex: 4,
        })
        burst.setMap(map)
        setTimeout(() => burst.setMap(null), CRUMB_BURST_MS)
      })
    }
  }, [mapReady, origin, destination, legs, crumbIntervalMeters, progressMeters])

  // 경로가 바뀔 때만 전체 경로가 보이도록 지도 범위를 맞춘다
  useEffect(() => {
    if (!mapReady || !origin) return
    const kakao = window.kakao
    const bounds = new kakao.maps.LatLngBounds()
    const points = [origin, ...(destination ? [destination] : []), ...(legs?.flatMap((l) => l.path) ?? [])]
    points.forEach((c) => bounds.extend(new kakao.maps.LatLng(c.lat, c.lng)))
    mapRef.current.setBounds(bounds, 48)
  }, [mapReady, origin, destination, legs])

  useEffect(() => {
    if (!mapReady) return
    const kakao = window.kakao
    const map = mapRef.current

    currentOverlayRef.current?.setMap(null)
    currentOverlayRef.current = null

    if (!current) return

    const position = new kakao.maps.LatLng(current.lat, current.lng)
    currentOverlayRef.current = new kakao.maps.CustomOverlay({
      position,
      content:
        '<div class="kakao-me"><span class="kakao-pin-pulse"></span><span class="kakao-pin-current"></span></div>',
      zIndex: 10,
    })
    currentOverlayRef.current.setMap(map)
    map.panTo(position)
  }, [mapReady, current])

  useEffect(() => {
    if (!recenterKey || !mapReady || !current) return
    const kakao = window.kakao
    mapRef.current.panTo(new kakao.maps.LatLng(current.lat, current.lng))
    // 버튼을 누른 순간에만 반응해야 하므로 current 변화에는 반응하지 않는다 (그건 위 effect가 담당)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey, mapReady])

  if (error) {
    return <p className="warning-text">{error}</p>
  }

  return <div ref={containerRef} className={className} />
}
