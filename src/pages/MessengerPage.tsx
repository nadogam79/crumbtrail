import { Link } from 'react-router-dom'
import { MOCK_CONVERSATIONS, MOCK_FRIENDS } from '../data/mockMessenger'

export function MessengerPage() {
  return (
    <div className="page">
      <section className="card">
        <h1>메신저</h1>
        <div className="map-placeholder">지도 영역 (준비 중)</div>
      </section>

      <section className="card">
        <h2>친구 ({MOCK_FRIENDS.length})</h2>
        <ul className="contact-list">
          {MOCK_FRIENDS.map((f) => {
            const messages = MOCK_CONVERSATIONS[f.id] ?? []
            const last = messages[messages.length - 1]
            return (
              <li key={f.id}>
                <Link to={`/messenger/${f.id}`} className="contact-item friend-link">
                  <span className="friend-avatar">
                    {f.avatar}
                    {f.online && <span className="friend-online" />}
                  </span>
                  <div className="friend-info">
                    <strong>{f.name}</strong>
                    <span className="contact-relation"> · {f.relation}</span>
                    <div className="contact-phone">{last ? last.text : '아직 대화가 없어요'}</div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
