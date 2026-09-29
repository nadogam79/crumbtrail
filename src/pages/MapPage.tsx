import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTracking } from '../context/TrackingContext'
import { RouteMap } from '../components/RouteMap'
import { AccountMenu } from '../components/AccountMenu'
import { GuideModal } from '../components/GuideModal'
import { Modal } from '../components/Modal'
import { StatusBadge } from '../components/StatusBadge'
import { routeProgressMeters } from '../lib/geo'
import { isGuideHiddenToday } from '../lib/guidePreference'
import { ALERT_GRACE_MS, ALERT_REASON_LABEL, type Coordinate } from '../types'
import { RouteSetupPage } from './RouteSetupPage'

// 앱을 연(새로고침/로그인) 뒤 지도 화면에 처음 들어올 때 한 번만 가이드를 띄운다.
let guideShownThisLoad = false

export function MapPage() {
  const {
    status,
    route,
    breadcrumbs,
    simMinutesElapsed,
    alert,
    dispatchNotice,
    relocate,
    reroute,
    resolveAlert,
    arrive,
    stopTracking,
  } = useTracking()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    if (guideShownThisLoad || isGuideHiddenToday()) return
    guideShownThisLoad = true
    setGuideOpen(true)
  }, [])

  // 대기 중에는 지도 기본 위치를 현재 위치로. 추적 중에는 breadcrumb이 현재 위치가 된다.
  const [idleLocation, setIdleLocation] = useState<Coordinate | null>(null)

  useEffect(() => {
    if (status !== 'idle' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setIdleLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => {}, // 권한 거부 등이면 기본 위치(서울시청)를 그대로 보여준다
      { timeout: 8000 },
    )
  }, [status])

  const current = breadcrumbs.at(-1)?.coord ?? (status === 'idle' ? idleLocation : null)
  const [recenterKey, setRecenterKey] = useState(0)
  const [locating, setLocating] = useState(false)

  // 경보 유예 중('나 괜찮아'를 기다리는 30초)이면 남은 시간을 1초 단위로 보여준다
  const sendAt = status === 'alert' ? (alert?.sendAt ?? null) : null
  const graceActive = sendAt !== null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (sendAt === null) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [sendAt])
  const graceLeftMs = sendAt === null ? 0 : Math.max(0, sendAt - now)
  const graceLeftSec = Math.ceil(graceLeftMs / 1000)

  // 경로를 따라 어디까지 왔는지(m). 지나온 구간 회색 처리와 빵 조각 지남 표시에 쓴다.
  const progressMeters = useMemo(
    () => (route && status !== 'idle' ? routeProgressMeters(route, breadcrumbs) : 0),
    [route, breadcrumbs, status],
  )

  // GPS를 캐시 없이 새로 받아 내 위치를 다시 계산하고 지도를 그쪽으로 옮긴다.
  // 추적 중이면 받은 위치가 기록에도 들어간다. 실패하면 마지막 위치로만 옮긴다.
  const handleLocate = async () => {
    if (locating) return
    setLocating(true)
    const coord = await relocate()
    if (coord && status === 'idle') setIdleLocation(coord)
    setLocating(false)
    setRecenterKey((k) => k + 1)
  }

  // 도보 경로는 지름길 등으로 얼마든지 달라질 수 있어 현위치 기준으로 남은 경로를 다시 찾게 한다.
  // 대중교통 경로는 TMAP 대중교통 API 한도(하루 10회) 때문에 지원하지 않는다.
  const [rerouting, setRerouting] = useState(false)
  const canReroute = status === 'active' && route?.source !== 'transit'
  const handleReroute = async () => {
    if (rerouting) return
    if (!window.confirm('현재 위치에서 목적지까지 도보 경로를 다시 찾을까요? 지나온 경로와 빵 조각은 그대로 둬요.'))
      return
    setRerouting(true)
    await reroute()
    setRerouting(false)
  }

  const handleArrive = () => {
    if (window.confirm('도착 처리할까요? 비상 연락망에 도착 메시지가 전송돼요.')) arrive()
  }

  const handleStop = () => {
    if (window.confirm('이동을 중단할까요? 지금까지의 경로 기록이 초기화되고 비상 연락망에 중단 메시지가 전송돼요.')) {
      stopTracking()
    }
  }

  return (
    <div className="map-page">
      <RouteMap
        origin={route?.origin ?? null}
        destination={route?.destination ?? null}
        current={current}
        legs={route?.legs}
        recenterKey={recenterKey}
        progressMeters={progressMeters}
        crumbIntervalMeters={route?.crumbIntervalMeters}
        className="route-map route-map-full"
      />

      <button
        type="button"
        className={`map-locate-fab ${locating ? 'map-locate-fab-busy' : ''}`}
        onClick={handleLocate}
        disabled={locating}
        aria-label="내 위치 다시 계산"
        title="내 위치 다시 계산"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      <div className={`map-topbar ${status === 'alert' ? 'chip-alert' : ''}`}>
        <span className="map-topbar-brand">실종빵프로맵</span>

        {status === 'idle' && (
          <span className="map-topbar-info map-topbar-tagline">이상 신호가 감지되면 지인에게 바로 알려요</span>
        )}

        {status !== 'idle' && route && (
          <div className="map-topbar-info">
            <div className="map-topbar-info-text">
              <strong>{route.destinationLabel}</strong>
              <span>
                T+{Math.round(simMinutesElapsed)}분 / 예상 {route.etaMinutes}분
              </span>
            </div>
            <StatusBadge status={status} />
          </div>
        )}

        <div className="map-topbar-actions">
          <button type="button" className="icon-btn" onClick={() => setGuideOpen(true)} aria-label="사용 가이드">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="12" cy="7.75" r="1.1" fill="currentColor" />
            </svg>
          </button>
          <AccountMenu />
        </div>
      </div>

      <div className="map-notices">
        {status === 'alert' && alert && (
          <div className="alert-banner" role="alert">
            <strong>⚠️ {ALERT_REASON_LABEL[alert.reason]} 감지</strong>
            <span>{alert.message}</span>
            <span>
              {graceActive
                ? `${graceLeftSec}초 안에 '나 괜찮아'를 누르지 않으면 비상 연락망에 알려요.`
                : "비상 연락망에 알림을 보냈어요. 괜찮다면 아래 '나 괜찮아'를 눌러주세요."}
            </span>
          </div>
        )}

        {dispatchNotice && (
          <div className={`dispatch-notice ${dispatchNotice.failed ? 'dispatch-notice-failed' : ''}`}>
            {dispatchNotice.text}
          </div>
        )}
      </div>

      <div className="floating-nav">
        {status === 'idle' && (
          <button
            type="button"
            className="floating-nav-btn floating-nav-btn-primary"
            onClick={() => setModalOpen(true)}
          >
            목적지 설정
          </button>
        )}

        {graceActive && (
          // 버튼 배경이 남은 시간만큼 줄어든다. 다른 버튼은 유예 중에 숨긴다.
          <button
            key={sendAt}
            type="button"
            className="floating-nav-btn grace-btn"
            style={{
              animationDuration: `${ALERT_GRACE_MS}ms`,
              animationDelay: `${graceLeftMs - ALERT_GRACE_MS}ms`,
            }}
            onClick={resolveAlert}
          >
            <span>나 괜찮아 · {graceLeftSec}초</span>
          </button>
        )}

        {status === 'alert' && !graceActive && (
          <button type="button" className="floating-nav-btn floating-nav-btn-primary" onClick={resolveAlert}>
            나 괜찮아
          </button>
        )}

        {canReroute && (
          <button type="button" className="floating-nav-btn" onClick={handleReroute} disabled={rerouting}>
            {rerouting ? '재탐지 중…' : '경로 재탐지'}
          </button>
        )}

        {status !== 'idle' && !graceActive && (
          <button type="button" className="floating-nav-btn" onClick={handleArrive}>
            도착했어요
          </button>
        )}

        {!graceActive && (
          <button type="button" className="floating-nav-btn" onClick={() => navigate('/messenger')}>
            메신저
          </button>
        )}

        {status !== 'idle' && !graceActive && (
          <button
            type="button"
            className="floating-nav-btn floating-nav-btn-danger floating-nav-btn-stop"
            onClick={handleStop}
            aria-label="이동 중단"
            title="이동 중단"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <rect width="14" height="14" rx="2.5" fill="currentColor" />
            </svg>
          </button>
        )}
      </div>

      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}

      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} compact>
          <RouteSetupPage onStarted={() => setModalOpen(false)} />
        </Modal>
      )}
    </div>
  )
}
