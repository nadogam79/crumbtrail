import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTracking } from '../context/TrackingContext'
import { MOCK_CONVERSATIONS, MOCK_FRIENDS } from '../data/mockMessenger'
import { ChatPage } from './ChatPage'
import { ContactsPage } from './ContactsPage'
import { AlertPage } from './AlertPage'

type Segment = 'chat' | 'contacts' | 'alert'

function FriendList() {
  return (
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
  )
}

export function MessengerPage() {
  const { friendId } = useParams()
  const location = useLocation()
  const { status } = useTracking()
  const [segment, setSegment] = useState<Segment>(
    () => (location.state as { segment?: Segment } | null)?.segment ?? (status === 'alert' ? 'alert' : 'chat'),
  )

  return (
    <div className="page">
      <div className="segmented-control">
        <button
          type="button"
          className={segment === 'chat' ? 'segmented-btn active' : 'segmented-btn'}
          onClick={() => setSegment('chat')}
        >
          대화
        </button>
        <button
          type="button"
          className={segment === 'contacts' ? 'segmented-btn active' : 'segmented-btn'}
          onClick={() => setSegment('contacts')}
        >
          지인 관리
        </button>
        <button
          type="button"
          className={segment === 'alert' ? 'segmented-btn active' : 'segmented-btn'}
          onClick={() => setSegment('alert')}
        >
          알림방{status === 'alert' ? ' 🔴' : ''}
        </button>
      </div>

      {segment === 'chat' && (friendId ? <ChatPage /> : <FriendList />)}
      {segment === 'contacts' && <ContactsPage />}
      {segment === 'alert' && <AlertPage />}
    </div>
  )
}
