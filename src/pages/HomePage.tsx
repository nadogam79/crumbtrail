import { Link } from 'react-router-dom'
import { useTracking } from '../context/TrackingContext'
import { StatusBadge } from '../components/StatusBadge'
import { ALERT_REASON_LABEL } from '../types'

export function HomePage() {
  const { status, route, contacts, alert, simMinutesElapsed } = useTracking()

  return (
    <div className="page">
      <section className="card intro-card">
        <h1>안전 귀가, 빵 부스러기처럼</h1>
        <p>
          이동 경로를 등록해두면 이상 신호가 감지됐을 때 등록된 지인에게 자동으로 알려요.
          신고 대신, 가까운 사람들이 먼저 상황을 살펴요.
        </p>
      </section>

      <section className="card status-card">
        <div className="status-card-head">
          <h2>현재 상태</h2>
          <StatusBadge status={status} />
        </div>

        {status === 'idle' && (
          <>
            <p>등록된 이동 경로가 없어요.</p>
            {contacts.length === 0 && (
              <p className="warning-text">
                지인이 아직 등록되지 않았어요. <Link to="/contacts">지인부터 등록</Link>하는 걸 추천해요.
              </p>
            )}
            <Link to="/route-setup" className="btn btn-primary">
              경로 설정하고 출발하기
            </Link>
          </>
        )}

        {status === 'active' && route && (
          <>
            <p>
              <strong>{route.destinationLabel}</strong>(으)로 이동 중이에요. (T+{Math.round(simMinutesElapsed)}분 / 예상{' '}
              {route.etaMinutes}분)
            </p>
            <Link to="/tracking" className="btn btn-primary">
              이동 현황 보기
            </Link>
          </>
        )}

        {status === 'alert' && alert && (
          <>
            <p className="warning-text">
              이상 신호 감지됨: {ALERT_REASON_LABEL[alert.reason]}. 등록된 지인에게 알림이 전송됐어요.
            </p>
            <Link to="/alert" className="btn btn-danger">
              알림방 확인하기
            </Link>
          </>
        )}

        {status === 'resolved' && (
          <>
            <p>상황이 해제됐어요. 안전하게 도착했나요?</p>
            <Link to="/route-setup" className="btn btn-primary">
              새 경로 설정하기
            </Link>
          </>
        )}
      </section>

      <section className="card">
        <h2>등록된 지인</h2>
        {contacts.length === 0 ? (
          <p>등록된 지인이 없어요.</p>
        ) : (
          <p>
            {contacts.length}명 등록됨 — {contacts.map((c) => c.name).join(', ')}
          </p>
        )}
        <Link to="/contacts" className="btn btn-secondary">
          지인 관리
        </Link>
      </section>
    </div>
  )
}
