import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTracking } from '../context/TrackingContext'
import { RouteMap } from '../components/RouteMap'
import { AccountMenu } from '../components/AccountMenu'
import { GuideModal } from '../components/GuideModal'
import { Modal } from '../components/Modal'
import { StatusBadge } from '../components/StatusBadge'
import { projectOntoPath } from '../lib/geo'
import { isGuideHiddenToday } from '../lib/guidePreference'
import type { Coordinate } from '../types'
import { RouteSetupPage } from './RouteSetupPage'

// 앱을 연(새로고침/로그인) 뒤 지도 화면에 처음 들어올 때 한 번만 가이드를 띄운다.
let guideShownThisLoad = false

export function MapPage() {
  const { status, route, breadcrumbs, simMinutesElapsed, dispatchNotice, checkIn, resolveAlert, arrive, stopTracking } =
    useTracking()
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
      (pos) => setIdleLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, // 권한 거부 등이면 기본 위치(서울시청)를 그대로 보여준다
      { timeout: 8000 },
    )
  }, [status])

  const current = breadcrumbs.at(-1)?.coord ?? (status === 'idle' ? idleLocation : null)
  const [recenterKey, setRecenterKey] = useState(0)

  // 경로를 따라 어디까지 왔는지(m). 경로에서 이탈 허용 거리 안에 있던 위치만 인정하고,
  // GPS가 흔들려 뒤로 튀어도 진행도가 줄지 않도록 지금까지의 최댓값을 쓴다.
  const progressMeters = useMemo(() => {
    if (!route || status === 'idle') return 0
    const path = route.legs?.flatMap((leg) => leg.path) ?? []
    const routePath = path.length > 1 ? path : [route.origin, route.destination]
    return breadcrumbs.reduce((max, crumb) => {
      const { alongMeters, offMeters } = projectOntoPath(crumb.coord, routePath)
      return offMeters <= route.deviationThresholdMeters ? Math.max(max, alongMeters) : max
    }, 0)
  }, [route, breadcrumbs, status])

  // 대기 중이면 위치를 새로 받아온 뒤, 추적 중이면 마지막 GPS 위치로 지도를 옮긴다
  const handleLocate = () => {
    if (status === 'idle' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIdleLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setRecenterKey((k) => k + 1)
        },
        () => setRecenterKey((k) => k + 1),
        { timeout: 8000 },
      )
      return
    }
    setRecenterKey((k) => k + 1)
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
        className="route-map route-map-full"
      />

      <button type="button" className="map-locate-fab" onClick={handleLocate} aria-label="내 위치로 이동" title="내 위치로 이동">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      <div className={`map-topbar ${status === 'alert' ? 'chip-alert' : ''}`}>
        <span className="map-topbar-brand">🍞 CrumbTrail</span>

        {status === 'idle' && <span className="map-topbar-info map-topbar-tagline">이상 신호가 감지되면 지인에게 바로 알려요</span>}

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

      {dispatchNotice && (
        <div className={`dispatch-notice ${dispatchNotice.failed ? 'dispatch-notice-failed' : ''}`}>
          {dispatchNotice.text}
        </div>
      )}

      <div className="floating-nav">
        {status === 'idle' && (
          <button type="button" className="floating-nav-btn floating-nav-btn-primary" onClick={() => setModalOpen(true)}>
            목적지 설정
          </button>
        )}

        {status === 'active' && (
          <button type="button" className="floating-nav-btn" onClick={checkIn}>
            체크인
          </button>
        )}

        {status === 'alert' && (
          <button type="button" className="floating-nav-btn floating-nav-btn-primary" onClick={resolveAlert}>
            나 괜찮아
          </button>
        )}

        {status !== 'idle' && (
          <button type="button" className="floating-nav-btn" onClick={handleArrive}>
            도착했어요
          </button>
        )}

        <button type="button" className="floating-nav-btn" onClick={() => navigate('/messenger')}>
          메신저
        </button>

        {status !== 'idle' && (
          <button type="button" className="floating-nav-btn floating-nav-btn-danger" onClick={handleStop}>
            이동 중단
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
