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

const DEFAULT_CENTER: Coordinate = { lat: 37.5665, lng: 126.978 } // 서울시청 (지도 초기값)

const LEG_COLOR: Record<TransitMode, string> = {
  WALK: '#f97316',
  BUS: '#2563eb',
  SUBWAY: '#16a34a',
}
const PASSED_COLOR = '#9aa1a8'
const ROUTE_WEIGHT = 6

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
  const routeOverlaysRef = useRef<any[]>([])
  const currentOverlayRef = useRef<any>(null)
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

  // 경로 그리기: 지나온 구간(progressMeters까지)은 회색, 남은 구간은 이동수단별 색.
  // 진행도가 바뀔 때마다 다시 그리지만 지도 범위는 건드리지 않는다(아래 effect 담당).
  useEffect(() => {
    if (!mapReady) return
    const kakao = window.kakao
    const map = mapRef.current

    routeOverlaysRef.current.forEach((overlay) => overlay.setMap(null))
    routeOverlaysRef.current = []

    if (!origin) return

    const show = (overlay: any) => {
      overlay.setMap(map)
      routeOverlaysRef.current.push(overlay)
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
    // 흰 테두리 선을 먼저 깔고 그 위에 색 선을 올려 지도 배경과 분리한다
    const line = (path: Coordinate[], style: { color: string; dashed?: boolean }, zIndex: number) => {
      if (path.length < 2) return
      const kakaoPath = path.map((c) => new kakao.maps.LatLng(c.lat, c.lng))
      show(
        new kakao.maps.Polyline({
          path: kakaoPath,
          strokeWeight: ROUTE_WEIGHT + 4,
          strokeColor: '#ffffff',
          strokeOpacity: 1,
          zIndex,
        }),
      )
      show(
        new kakao.maps.Polyline({
          path: kakaoPath,
          strokeWeight: ROUTE_WEIGHT,
          strokeColor: style.color,
          strokeOpacity: 1,
          strokeStyle: style.dashed ? 'shortdash' : 'solid',
          zIndex: zIndex + 1,
        }),
      )
    }

    pin(origin, '<div class="kakao-pin kakao-pin-origin">출발</div>')
    if (!destination) return
    pin(destination, '<div class="kakao-pin kakao-pin-destination">도착</div>')

    // 실제 경로를 못 받았으면 출발-도착 직선을 추정 경로(점선)로 그린다
    const hasRealLegs = !!legs && legs.some((l) => l.path.length > 1)
    // 추정 직선과 재탐지 연결 구간은 점선으로 그린다
    const drawLegs: { mode: TransitMode; path: Coordinate[]; dashed?: boolean }[] = hasRealLegs
      ? legs!.filter((l) => l.path.length > 1).map((l) => ({ ...l, dashed: l.connector }))
      : [{ mode: 'WALK', path: [origin, destination], dashed: true }]

    const passed = progressMeters ?? 0
    let legStart = 0
    drawLegs.forEach((leg) => {
      const [done, remaining] = splitPathAt(leg.path, passed - legStart)
      line(done, { color: PASSED_COLOR, dashed: leg.dashed }, 1)
      line(remaining, { color: LEG_COLOR[leg.mode], dashed: leg.dashed }, 3)
      legStart += pathLengthMeters(leg.path)
    })

    // 빵조각은 이동수단과 상관없이 전체 경로를 이어서 뿌린다. leg별로 뿌리면 버스/지하철
    // 구간과 200m보다 짧은 도보 구간에는 하나도 찍히지 않는다. 지나온 빵조각은 흐리게.
    const fullPath = drawLegs.flatMap((leg) => leg.path)
    const interval = crumbIntervalMeters ?? checkpointIntervalMeters(pathLengthMeters(fullPath))
    sampleAlongPath(fullPath, interval).forEach((c, i) => {
      const isPassed = (i + 1) * interval <= passed
      show(
        new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(c.lat, c.lng),
          content: `<div class="kakao-crumb${isPassed ? ' kakao-crumb-passed' : ''}"><span>🍞</span></div>`,
          zIndex: 2,
        }),
      )
    })
  }, [mapReady, origin, destination, legs, progressMeters, crumbIntervalMeters])

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
