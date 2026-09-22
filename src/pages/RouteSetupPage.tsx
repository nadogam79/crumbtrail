import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTracking } from '../context/TrackingContext'

const DEFAULT_ORIGIN = { lat: 37.4979, lng: 127.0276 } // 강남역 (예시)
const DEFAULT_DESTINATION = { lat: 37.5065, lng: 127.0432 } // 예시 목적지

export function RouteSetupPage() {
  const { contacts, startRoute } = useTracking()
  const navigate = useNavigate()

  const [destinationLabel, setDestinationLabel] = useState('집')
  const [originLat, setOriginLat] = useState(DEFAULT_ORIGIN.lat)
  const [originLng, setOriginLng] = useState(DEFAULT_ORIGIN.lng)
  const [destLat, setDestLat] = useState(DEFAULT_DESTINATION.lat)
  const [destLng, setDestLng] = useState(DEFAULT_DESTINATION.lng)
  const [etaMinutes, setEtaMinutes] = useState(15)
  const [checkInIntervalMinutes, setCheckInIntervalMinutes] = useState(10)
  const [deviationThresholdMeters, setDeviationThresholdMeters] = useState(150)
  const [stillnessThresholdMinutes, setStillnessThresholdMinutes] = useState(8)
  const [locating, setLocating] = useState(false)

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOriginLat(pos.coords.latitude)
        setOriginLng(pos.coords.longitude)
        setLocating(false)
      },
      () => setLocating(false),
      { timeout: 5000 },
    )
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (contacts.length === 0) return

    startRoute({
      destinationLabel,
      origin: { lat: originLat, lng: originLng },
      destination: { lat: destLat, lng: destLng },
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
        <p>출발 전 예상 이동 루트와 목적지를 등록해두면, 이상 신호를 더 정확히 감지할 수 있어요.</p>

        {contacts.length === 0 && (
          <p className="warning-text">
            알림을 받을 지인이 없어요. <Link to="/contacts">지인을 먼저 등록</Link>해주세요.
          </p>
        )}

        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>목적지</span>
            <input
              type="text"
              value={destinationLabel}
              onChange={(e) => setDestinationLabel(e.target.value)}
              required
            />
          </label>

          <fieldset className="field-group">
            <legend>출발 위치</legend>
            <div className="field-row">
              <label className="field">
                <span>위도</span>
                <input
                  type="number"
                  step="0.0001"
                  value={originLat}
                  onChange={(e) => setOriginLat(Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>경도</span>
                <input
                  type="number"
                  step="0.0001"
                  value={originLng}
                  onChange={(e) => setOriginLng(Number(e.target.value))}
                />
              </label>
            </div>
            <button type="button" className="btn btn-secondary" onClick={useCurrentLocation} disabled={locating}>
              {locating ? '위치 확인 중…' : '내 위치 사용'}
            </button>
          </fieldset>

          <fieldset className="field-group">
            <legend>목적지 위치</legend>
            <div className="field-row">
              <label className="field">
                <span>위도</span>
                <input
                  type="number"
                  step="0.0001"
                  value={destLat}
                  onChange={(e) => setDestLat(Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>경도</span>
                <input
                  type="number"
                  step="0.0001"
                  value={destLng}
                  onChange={(e) => setDestLng(Number(e.target.value))}
                />
              </label>
            </div>
          </fieldset>

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

          <button type="submit" className="btn btn-primary" disabled={contacts.length === 0}>
            이동 시작
          </button>
        </form>
      </section>
    </div>
  )
}
