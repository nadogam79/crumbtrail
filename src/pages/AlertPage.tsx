import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTracking } from '../context/TrackingContext'
import { StatusBadge } from '../components/StatusBadge'
import { ALERT_REASON_LABEL } from '../types'

export function AlertPage() {
  const { status, alert, route, breadcrumbs, contacts, messages, postMessage, resolveAlert, resetSession } =
    useTracking()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set())

  const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1]
  const [battery, setBattery] = useState(0)

  useEffect(() => {
    if (!alert) return
    setAckedIds(new Set())
    setBattery(12 + Math.round(Math.random() * 30))

    const timers = contacts.map((contact, i) =>
      setTimeout(
        () => {
          setAckedIds((prev) => new Set(prev).add(contact.id))
          postMessage(`${contact.name}님이 알림을 확인했어요.`, {
            author: contact.id,
            authorLabel: contact.name,
          })
        },
        1500 + i * 1800 + Math.random() * 1200,
      ),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.triggeredAt])

  const handleSend = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    postMessage(draft.trim())
    setDraft('')
  }

  const handleResolve = () => {
    resolveAlert()
  }

  const handleBackHome = () => {
    resetSession()
    navigate('/')
  }

  if (status !== 'alert' && status !== 'resolved') {
    return (
      <div className="page">
        <section className="card">
          <h1>알림방</h1>
          <p>현재 활성화된 이상 신호 알림이 없어요.</p>
          <Link to="/" className="btn btn-primary">
            홈으로
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <section className="card status-card">
        <div className="status-card-head">
          <h1>알림방</h1>
          <StatusBadge status={status} />
        </div>
        {alert && (
          <p className="warning-text">
            {ALERT_REASON_LABEL[alert.reason]} · T+{alert.triggeredAt}분에 감지됨
          </p>
        )}
        {route && lastBreadcrumb && (
          <p className="alert-meta">
            마지막 위치: ({lastBreadcrumb.coord.lat.toFixed(4)}, {lastBreadcrumb.coord.lng.toFixed(4)}) · 배터리{' '}
            {battery}% · 목적지 {route.destinationLabel}
          </p>
        )}
      </section>

      <section className="card">
        <h2>대응 현황</h2>
        {contacts.length === 0 ? (
          <p>등록된 지인이 없어요.</p>
        ) : (
          <ul className="contact-list">
            {contacts.map((c) => (
              <li key={c.id} className="contact-item">
                <div>
                  <strong>{c.name}</strong>
                  {c.relation && <span className="contact-relation"> · {c.relation}</span>}
                </div>
                <span className={ackedIds.has(c.id) ? 'ack-status acked' : 'ack-status waiting'}>
                  {ackedIds.has(c.id) ? '확인함' : '대기 중'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card chat-card">
        <h2>채팅방</h2>
        <div className="chat-thread">
          {messages.map((m) => (
            <div key={m.id} className={`chat-bubble chat-${m.author === 'user' ? 'user' : m.author === 'system' ? 'system' : 'contact'}`}>
              <span className="chat-author">{m.authorLabel}</span>
              <span className="chat-text">{m.text}</span>
            </div>
          ))}
        </div>

        {status === 'alert' ? (
          <>
            <form className="chat-input-row" onSubmit={handleSend}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="메시지 보내기"
              />
              <button type="submit" className="btn btn-secondary">
                전송
              </button>
            </form>
            <button type="button" className="btn btn-primary resolve-btn" onClick={handleResolve}>
              나 괜찮아, 오탐이었어
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={handleBackHome}>
            처음으로 돌아가기
          </button>
        )}
      </section>
    </div>
  )
}
