import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTracking } from '../context/TrackingContext'
import { StatusBadge } from '../components/StatusBadge'
import { BreadcrumbTrail } from '../components/BreadcrumbTrail'

export function TrackingPage() {
  const { status, route, breadcrumbs, simMinutesElapsed, lastCheckInMinute, movementMode, checkIn, setMovementMode } =
    useTracking()
  const navigate = useNavigate()

  useEffect(() => {
    if (status === 'idle') navigate('/route-setup')
  }, [status, navigate])

  if (!route) return null

  const sinceCheckIn = simMinutesElapsed - (lastCheckInMinute ?? 0)
  const nextCheckInDeadline = Math.max(0, route.checkInIntervalMinutes - sinceCheckIn)
  const current = breadcrumbs[breadcrumbs.length - 1]

  return (
    <div className="page">
      <section className="card status-card">
        <div className="status-card-head">
          <h1>{route.destinationLabel}(으)로 이동 중</h1>
          <StatusBadge status={status} />
        </div>
        <p>
          경과 T+{simMinutesElapsed}분 / 예상 {route.etaMinutes}분
        </p>

        {status === 'alert' && (
          <p className="warning-text">
            이상 신호가 감지되어 지인에게 알림을 보냈어요. <Link to="/alert">알림방 확인하기</Link>
          </p>
        )}

        {status === 'resolved' && <p>상황이 해제됐어요. 수고했어요!</p>}
      </section>

      <section className="card">
        <h2>이동 경로</h2>
        <BreadcrumbTrail origin={route.origin} destination={route.destination} breadcrumbs={breadcrumbs} />
        {current && (
          <p className="trail-current-coord">
            현재 위치 ({current.coord.lat.toFixed(4)}, {current.coord.lng.toFixed(4)}) · T+{current.timestamp}분
          </p>
        )}
      </section>

      {status === 'active' && (
        <section className="card">
          <h2>체크인</h2>
          <p>
            {nextCheckInDeadline > 0
              ? `다음 체크인까지 약 ${nextCheckInDeadline}분 남았어요.`
              : '체크인이 필요해요!'}
          </p>
          <button type="button" className="btn btn-primary" onClick={checkIn}>
            지금 괜찮음 체크인
          </button>
        </section>
      )}

      {status === 'active' && (
        <section className="card debug-card">
          <h2>테스트용 시뮬레이션 컨트롤</h2>
          <p>실제 GPS 없이 이상 감지 로직을 확인해볼 수 있어요.</p>
          <div className="field-row">
            <button
              type="button"
              className={movementMode === 'normal' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setMovementMode('normal')}
            >
              정상 이동
            </button>
            <button
              type="button"
              className={movementMode === 'deviating' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setMovementMode('deviating')}
            >
              경로 이탈 시뮬레이션
            </button>
            <button
              type="button"
              className={movementMode === 'stopped' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setMovementMode('stopped')}
            >
              정지/신호끊김 시뮬레이션
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
