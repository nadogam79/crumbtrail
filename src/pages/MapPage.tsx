import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTracking } from '../context/TrackingContext'
import { RouteMap } from '../components/RouteMap'
import { Modal } from '../components/Modal'
import { StatusBadge } from '../components/StatusBadge'
import { RouteSetupPage } from './RouteSetupPage'

export function MapPage() {
  const { status, route, breadcrumbs, simMinutesElapsed, checkIn, resetSession } = useTracking()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)

  const current = breadcrumbs.at(-1)?.coord ?? null

  const handleStop = () => {
    if (window.confirm('이동을 중단할까요? 지금까지의 경로 기록이 초기화돼요.')) {
      resetSession()
    }
  }

  return (
    <div className="map-page">
      <RouteMap
        origin={route?.origin ?? null}
        destination={route?.destination ?? null}
        current={current}
        legs={route?.legs}
        className="route-map route-map-full"
      />

      <div className={`map-topbar ${status === 'alert' ? 'chip-alert' : ''}`}>
        <span className="map-topbar-brand">🍞 CrumbTrail</span>

        {status === 'idle' && <span className="map-topbar-info">이상 신호가 감지되면 지인에게 바로 알려요</span>}

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
      </div>

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

        {(status === 'alert' || status === 'resolved') && (
          <button
            type="button"
            className="floating-nav-btn"
            onClick={() => navigate('/messenger', { state: { segment: 'alert' } })}
          >
            알림방으로{status === 'alert' ? ' 🔴' : ''}
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

      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)}>
          <RouteSetupPage onStarted={() => setModalOpen(false)} />
        </Modal>
      )}
    </div>
  )
}
