import { useEffect, useRef, useState } from 'react'
import { loadKakaoMaps } from '../lib/kakaoMaps'
import { generateCheckpoints } from '../lib/geo'
import type { Coordinate } from '../types'

interface RouteMapProps {
  origin: Coordinate | null
  destination: Coordinate | null
  current?: Coordinate | null
  onDestinationChange?: (coord: Coordinate) => void
}

const DEFAULT_CENTER: Coordinate = { lat: 37.5665, lng: 126.978 } // 서울시청 (지도 초기값)

export function RouteMap({ origin, destination, current, onDestinationChange }: RouteMapProps) {
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
    if (!mapReady || !onDestinationChange) return
    const kakao = window.kakao
    const map = mapRef.current
    const handleClick = (e: any) => {
      onDestinationChange({ lat: e.latLng.getLat(), lng: e.latLng.getLng() })
    }
    kakao.maps.event.addListener(map, 'click', handleClick)
    return () => kakao.maps.event.removeListener(map, 'click', handleClick)
  }, [mapReady, onDestinationChange])

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

    map.setBounds(bounds, 48)
  }, [mapReady, origin, destination])

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

  return <div ref={containerRef} className="route-map" />
}
