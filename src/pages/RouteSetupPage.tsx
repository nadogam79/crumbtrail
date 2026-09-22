import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTracking } from '../context/TrackingContext'
import { RouteMap } from '../components/RouteMap'
import { loadKakaoMaps } from '../lib/kakaoMaps'
import type { Coordinate } from '../types'

export function RouteSetupPage() {
  const { contacts, startRoute } = useTracking()
  const navigate = useNavigate()

  const [destinationLabel, setDestinationLabel] = useState('집')
  const [origin, setOrigin] = useState<Coordinate | null>(null)
  const [destination, setDestination] = useState<Coordinate | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)

  const [etaMinutes, setEtaMinutes] = useState(15)
  const [checkInIntervalMinutes, setCheckInIntervalMinutes] = useState(10)
  const [deviationThresholdMeters, setDeviationThresholdMeters] = useState(150)
  const [stillnessThresholdMinutes, setStillnessThresholdMinutes] = useState(8)

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

  const handleDestinationChange = useCallback((coord: Coordinate) => {
    setDestination(coord)
  }, [])

  const runSearch = async () => {
    if (!searchQuery.trim()) return
    setSearchError(null)
    try {
      const kakao = await loadKakaoMaps()
      const places = new kakao.maps.services.Places()
      places.keywordSearch(searchQuery.trim(), (results: any[], status: string) => {
        if (status !== kakao.maps.services.Status.OK || results.length === 0) {
          setSearchError('검색 결과가 없어요.')
          return
        }
        const top = results[0]
        setDestination({ lat: Number(top.y), lng: Number(top.x) })
        setDestinationLabel(top.place_name)
      })
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '검색 중 오류가 발생했어요.')
    }
  }

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    runSearch()
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (contacts.length === 0 || !origin || !destination) return

    startRoute({
      destinationLabel,
      origin,
      destination,
      etaMinutes,
      checkInIntervalMinutes,
      deviationThresholdMeters,
      stillnessThresholdMinutes,
    })
    navigate('/tracking')
  }

  return (
    <div className="page">
      <section className="card">
        <h1>경로 설정</h1>
        <p>목적지를 검색하거나 지도를 클릭해서 지정해주세요. 출발 위치는 현재 위치로 자동 설정돼요.</p>

        {contacts.length === 0 && (
          <p className="warning-text">
            알림을 받을 지인이 없어요. <Link to="/contacts">지인을 먼저 등록</Link>해주세요.
          </p>
        )}

        <form className="form" onSubmit={handleSubmit}>
          <div className="field-row">
            <label className="field">
              <span>목적지 검색</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="예: 강남역, 회사, 상세 주소"
              />
            </label>
            <button type="button" className="btn btn-secondary" onClick={runSearch}>
              검색
            </button>
          </div>
          {searchError && <p className="warning-text">{searchError}</p>}

          <p className="map-hint">
            {locating
              ? '현재 위치를 확인하는 중…'
              : origin
                ? '지도를 클릭하면 목적지를 직접 지정하거나 미세 조정할 수 있어요.'
                : '현재 위치를 가져오지 못했어요. 위치 새로고침을 눌러주세요.'}
          </p>
          {locationError && <p className="warning-text">{locationError}</p>}

          <RouteMap origin={origin} destination={destination} onDestinationChange={handleDestinationChange} />

          <button type="button" className="btn btn-secondary" onClick={refreshCurrentLocation} disabled={locating}>
            내 위치 새로고침
          </button>

          <label className="field">
            <span>목적지 이름</span>
            <input
              type="text"
              value={destinationLabel}
              onChange={(e) => setDestinationLabel(e.target.value)}
              required
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>예상 소요 시간 (분)</span>
              <input
                type="number"
                min={1}
                value={etaMinutes}
                onChange={(e) => setEtaMinutes(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>체크인 주기 (분)</span>
              <input
                type="number"
                min={1}
                value={checkInIntervalMinutes}
                onChange={(e) => setCheckInIntervalMinutes(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>경로 이탈 허용 거리 (m)</span>
              <input
                type="number"
                min={10}
                value={deviationThresholdMeters}
                onChange={(e) => setDeviationThresholdMeters(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>정지/신호끊김 허용 시간 (분)</span>
              <input
                type="number"
                min={1}
                value={stillnessThresholdMinutes}
                onChange={(e) => setStillnessThresholdMinutes(Number(e.target.value))}
              />
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={contacts.length === 0 || !origin || !destination}
          >
            이동 시작
          </button>
        </form>
      </section>
    </div>
  )
}
