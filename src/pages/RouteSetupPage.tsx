import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTracking } from '../context/TrackingContext'
import { RouteMap } from '../components/RouteMap'
import { distanceMeters } from '../lib/geo'
import { loadKakaoMaps } from '../lib/kakaoMaps'
import { fetchRoute } from '../lib/routing'
import type { Coordinate, RouteResult } from '../types'

interface RouteSetupPageProps {
  onStarted: () => void
}

interface Place {
  id: string
  name: string
  address: string
  coord: Coordinate
  distanceMeters: number | null
}

const SEARCH_RESULT_COUNT = 5

// 경로 조회가 실패했을 때의 소요 시간 추정: 직선거리에 우회 여유를 곱해 도보 속도로 나눈다
const DETOUR_FACTOR = 1.3
const WALK_METERS_PER_MINUTE = 4000 / 60

// 세부 설정 기본값.
// TODO: 체크인은 이후 경로 위 체크포인트를 자동 생성하고 GPS가 그 지점에 도착하면 자동 체크되는 방식으로 바뀔 예정.
// 그때 '체크인 주기'는 체크포인트 간격/도착 허용 반경 같은 설정으로 대체된다.
const DEFAULT_CHECK_IN_INTERVAL_MINUTES = 10
const DEFAULT_DEVIATION_THRESHOLD_METERS = 150
const DEFAULT_STILLNESS_THRESHOLD_MINUTES = 8

const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`)

export function RouteSetupPage({ onStarted }: RouteSetupPageProps) {
  const { startRoute } = useTracking()

  const [origin, setOrigin] = useState<Coordinate | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [destination, setDestination] = useState<Place | null>(null)

  const [route, setRoute] = useState<RouteResult | null>(null)
  const [routing, setRouting] = useState(false)
  const [routingFailed, setRoutingFailed] = useState(false)
  // 다시 시도 버튼으로 같은 출발/도착지 경로를 재조회하기 위한 트리거
  const [routeAttempt, setRouteAttempt] = useState(0)

  const [destinationLabel, setDestinationLabel] = useState('')
  const [checkInIntervalMinutes, setCheckInIntervalMinutes] = useState(DEFAULT_CHECK_IN_INTERVAL_MINUTES)
  const [deviationThresholdMeters, setDeviationThresholdMeters] = useState(DEFAULT_DEVIATION_THRESHOLD_METERS)
  const [stillnessThresholdMinutes, setStillnessThresholdMinutes] = useState(DEFAULT_STILLNESS_THRESHOLD_MINUTES)

  const refreshCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('이 브라우저는 위치 정보를 지원하지 않아요.')
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      () => {
        setLocationError('현재 위치를 가져오지 못했어요. 위치 권한을 확인해주세요.')
        setLocating(false)
      },
      { timeout: 8000 },
    )
  }, [])

  useEffect(() => {
    refreshCurrentLocation()
  }, [refreshCurrentLocation])

  // 출발/목적지가 정해지면 실제 경로(대중교통, 가까우면 도보)를 조회한다
  useEffect(() => {
    if (!origin || !destination) {
      setRoute(null)
      setRoutingFailed(false)
      return
    }

    let cancelled = false
    setRoute(null)
    setRoutingFailed(false)
    setRouting(true)
    fetchRoute(origin, destination.coord)
      .then((result) => {
        if (!cancelled) setRoute(result)
      })
      .catch(() => {
        if (!cancelled) setRoutingFailed(true)
      })
      .finally(() => {
        if (!cancelled) setRouting(false)
      })
    return () => {
      cancelled = true
    }
  }, [origin, destination, routeAttempt])

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault()
    const query = searchQuery.trim()
    if (!query) return
    setSearchError(null)
    try {
      const kakao = await loadKakaoMaps()
      const places = new kakao.maps.services.Places()
      // 현재 위치를 넘기면 결과마다 내 위치로부터의 거리가 같이 온다
      const options: Record<string, unknown> = { size: SEARCH_RESULT_COUNT }
      if (origin) options.location = new kakao.maps.LatLng(origin.lat, origin.lng)

      places.keywordSearch(
        query,
        (data: any[], status: string) => {
          if (status !== kakao.maps.services.Status.OK || data.length === 0) {
            setResults([])
            return
          }
          setResults(
            data.map((d) => ({
              id: d.id,
              name: d.place_name,
              address: d.road_address_name || d.address_name,
              coord: { lat: Number(d.y), lng: Number(d.x) },
              distanceMeters: d.distance ? Number(d.distance) : null,
            })),
          )
        },
        options,
      )
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '검색 중 오류가 발생했어요.')
    }
  }

  const selectPlace = (place: Place) => {
    setDestination(place)
    setDestinationLabel(place.name)
    setResults(null)
  }

  const fallbackMinutes =
    origin && destination
      ? Math.max(1, Math.round((distanceMeters(origin, destination.coord) * DETOUR_FACTOR) / WALK_METERS_PER_MINUTE))
      : null
  const etaMinutes = route ? Math.max(1, Math.round(route.totalMinutes)) : fallbackMinutes
  const canStart = !!origin && !!destination && !routing && etaMinutes !== null

  const handleStart = () => {
    if (!canStart || !origin || !destination || etaMinutes === null) return
    startRoute({
      destinationLabel: destinationLabel.trim() || destination.name,
      origin,
      destination: destination.coord,
      etaMinutes,
      checkInIntervalMinutes,
      deviationThresholdMeters,
      stillnessThresholdMinutes,
      legs: route?.legs,
    })
    onStarted()
  }

  return (
    <div className="sheet">
      <div className="sheet-head">
        <span className="guide-eyebrow">목적지 설정</span>
        <p className="guide-intro">목적지를 검색하고 이동을 시작하세요. 출발지는 현재 위치예요.</p>
      </div>

      <div className="sheet-body">
        <form className="search-bar" onSubmit={handleSearch}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="장소, 주소 검색"
            aria-label="목적지 검색"
          />
          <button type="submit" className="btn btn-primary">
            검색
          </button>
        </form>
        {searchError && <p className="warning-text">{searchError}</p>}

        {results !== null &&
          (results.length === 0 ? (
            <p className="map-hint">검색 결과가 없어요.</p>
          ) : (
            <ul className="list place-list">
              {results.map((place) => (
                <li key={place.id}>
                  <button type="button" className="list-row place-row" onClick={() => selectPlace(place)}>
                    <div className="row-main">
                      <span className="row-title">{place.name}</span>
                      <span className="row-sub">{place.address}</span>
                    </div>
                    {place.distanceMeters !== null && (
                      <span className="row-meta">{formatDistance(place.distanceMeters)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ))}

        <div className="map-wrap">
          <RouteMap origin={origin} destination={destination?.coord ?? null} legs={route?.legs} />
          <button
            type="button"
            className="map-locate-btn"
            onClick={refreshCurrentLocation}
            disabled={locating}
            aria-label="내 위치 새로고침"
            title="내 위치 새로고침"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {locating && <p className="map-hint">현재 위치를 확인하는 중…</p>}
        {locationError && <p className="warning-text">{locationError}</p>}

        {destination && (
          <div className="route-summary">
            <strong>{destination.name}</strong>
            {routing ? (
              <span className="map-hint">경로를 찾는 중…</span>
            ) : route ? (
              <span>
                {route.legs.some((l) => l.mode !== 'WALK') ? '대중교통' : '도보'} · 약 {etaMinutes}분 ·{' '}
                {formatDistance(route.totalDistanceMeters)}
              </span>
            ) : routingFailed ? (
              <>
                <span className="route-summary-warn">
                  경로를 불러오지 못해 직선 거리로 추정했어요 (약 {etaMinutes}분). 이탈 감지도 직선 기준으로 동작해요.
                </span>
                <button type="button" className="btn-text" onClick={() => setRouteAttempt((n) => n + 1)}>
                  다시 시도
                </button>
              </>
            ) : null}
          </div>
        )}

        <details className="advanced">
          <summary>세부 설정</summary>
          <div className="form">
            <label className="field">
              <span>목적지 이름</span>
              <input
                value={destinationLabel}
                onChange={(e) => setDestinationLabel(e.target.value)}
                placeholder={destination?.name ?? '예: 집'}
                maxLength={40}
              />
              <small>친구에게 가는 알림에 표시돼요.</small>
            </label>
            <label className="setting-row">
              <span>체크인 주기</span>
              <span className="setting-input">
                <input
                  type="number"
                  min={1}
                  value={checkInIntervalMinutes}
                  onChange={(e) => setCheckInIntervalMinutes(Number(e.target.value))}
                />
                분
              </span>
            </label>
            <label className="setting-row">
              <span>경로 이탈 허용 거리</span>
              <span className="setting-input">
                <input
                  type="number"
                  min={10}
                  value={deviationThresholdMeters}
                  onChange={(e) => setDeviationThresholdMeters(Number(e.target.value))}
                />
                m
              </span>
            </label>
            <label className="setting-row">
              <span>정지 허용 시간</span>
              <span className="setting-input">
                <input
                  type="number"
                  min={1}
                  value={stillnessThresholdMinutes}
                  onChange={(e) => setStillnessThresholdMinutes(Number(e.target.value))}
                />
                분
              </span>
            </label>
          </div>
        </details>
      </div>

      <div className="sheet-footer">
        <button type="button" className="btn btn-primary sheet-cta" onClick={handleStart} disabled={!canStart}>
          {destination ? '이동 시작' : '목적지를 검색해주세요'}
        </button>
      </div>
    </div>
  )
}
