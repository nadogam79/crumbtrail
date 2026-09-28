import { useEffect, useRef, useState } from 'react'
import { loadKakaoMaps } from '../lib/kakaoMaps'
import { generateCheckpoints, sampleAlongPath } from '../lib/geo'
import type { Coordinate, RouteLeg, TransitMode } from '../types'

interface RouteMapProps {
  origin: Coordinate | null
  destination: Coordinate | null
  current?: Coordinate | null
  legs?: RouteLeg[] | null
  className?: string
}

const DEFAULT_CENTER: Coordinate = { lat: 37.5665, lng: 126.978 } // 서울시청 (지도 초기값)

const LEG_STYLE: Record<TransitMode, { color: string; style: string }> = {
  WALK: { color: '#b98a4e', style: 'shortdash' },
  BUS: { color: '#2563eb', style: 'solid' },
  SUBWAY: { color: '#16a34a', style: 'solid' },
}

export function RouteMap({
  origin,
  destination,
  current,
  legs,
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

  useEffect(() => {
    if (!mapReady) return
    const kakao = window.kakao
    const map = mapRef.current

    routeOverlaysRef.current.forEach((overlay) => overlay.setMap(null))
    routeOverlaysRef.current = []

    if (!origin) return

    const bounds = new kakao.maps.LatLngBounds()
    const addOverlay = (overlay: any, position: Coordinate) => {
      overlay.setMap(map)
      routeOverlaysRef.current.push(overlay)
      bounds.extend(new kakao.maps.LatLng(position.lat, position.lng))
    }

    addOverlay(
      new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(origin.lat, origin.lng),
        content: '<div class="kakao-pin kakao-pin-origin">출발</div>',
        yAnchor: 1.4,
      }),
      origin,
    )

    if (destination) {
      addOverlay(
        new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(destination.lat, destination.lng),
          content: '<div class="kakao-pin kakao-pin-destination">도착</div>',
          yAnchor: 1.4,
        }),
        destination,
      )

      const hasRealLegs = !!legs && legs.length > 0 && legs.some((l) => l.path.length > 1)

      if (hasRealLegs) {
        // 실제 보행/대중교통 경로: leg마다 이동수단별 색으로 그리고, 각 leg를 따라
        // 빵조각(🍞)을 200m 간격으로 뿌린다.
        legs!.forEach((leg) => {
          if (leg.path.length < 2) return
          const style = LEG_STYLE[leg.mode]
          const kakaoPath = leg.path.map((c) => new kakao.maps.LatLng(c.lat, c.lng))
          const polyline = new kakao.maps.Polyline({
            path: kakaoPath,
            strokeWeight: leg.mode === 'WALK' ? 3 : 5,
            strokeColor: style.color,
            strokeStyle: style.style,
          })
          polyline.setMap(map)
          routeOverlaysRef.current.push(polyline)
          leg.path.forEach((c) => bounds.extend(new kakao.maps.LatLng(c.lat, c.lng)))

          if (leg.mode === 'WALK') {
            sampleAlongPath(leg.path).forEach((c) => {
              addOverlay(
                new kakao.maps.CustomOverlay({
                  position: new kakao.maps.LatLng(c.lat, c.lng),
                  content: '<div class="kakao-crumb">🍞</div>',
                }),
                c,
              )
            })
          }
        })
      } else {
        // 실제 경로를 아직 못 받아왔을 때의 폴백: 직선 미리보기
        const checkpoints = generateCheckpoints(origin, destination)
        const path = [origin, ...checkpoints, destination].map((c) => new kakao.maps.LatLng(c.lat, c.lng))
        const polyline = new kakao.maps.Polyline({
          path,
          strokeWeight: 3,
          strokeColor: '#b98a4e',
          strokeStyle: 'shortdash',
        })
        polyline.setMap(map)
        routeOverlaysRef.current.push(polyline)

        checkpoints.forEach((c) => {
          addOverlay(
            new kakao.maps.CustomOverlay({
              position: new kakao.maps.LatLng(c.lat, c.lng),
              content: '<div class="kakao-crumb">🍞</div>',
            }),
            c,
          )
        })
      }
    }

    map.setBounds(bounds, 48)
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
      content: '<div class="kakao-pin kakao-pin-current"></div>',
      zIndex: 10,
    })
    currentOverlayRef.current.setMap(map)
    map.panTo(position)
  }, [mapReady, current])

  if (error) {
    return <p className="warning-text">{error}</p>
  }

  return <div ref={containerRef} className={className} />
}
