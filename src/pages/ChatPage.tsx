import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FriendPicker } from '../components/FriendPicker'
import { useAuth } from '../context/AuthContext'
import {
  getRoom,
  inviteToRoom,
  kakaoMapLink,
  leaveRoom,
  listFriends,
  listMessages,
  roomTitle,
  sendMessage,
  type Friend,
  type Message,
  type RoomDetail,
} from '../lib/messenger'

const MESSAGE_POLL_MS = 5_000

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function bubbleClass(m: Message, myId: string | undefined) {
  if (m.kind === 'system') return 'chat-bubble chat-system'
  const side = m.sender_id === myId ? 'chat-user' : 'chat-contact'
  return `chat-bubble ${side}${m.kind === 'auto' ? ' chat-auto' : ''}`
}

export function ChatPage({ roomId }: { roomId: string }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  // undefined: 불러오는 중, null: 없거나 접근 불가
  const [room, setRoom] = useState<RoomDetail | null | undefined>(undefined)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [inviting, setInviting] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const threadRef = useRef<HTMLDivElement>(null)
  const lastMessageId = messages.at(-1)?.id

  const loadRoom = useCallback(() => {
    getRoom(roomId)
      .then(setRoom)
      .catch((err: Error) => setError(err.message))
  }, [roomId])

  const loadMessages = useCallback(() => {
    listMessages(roomId)
      .then(setMessages)
      .catch((err: Error) => setError(err.message))
  }, [roomId])

  useEffect(() => {
    const load = () => {
      // 다른 멤버의 초대/나가기도 반영되도록 방 정보도 함께 갱신
      loadRoom()
      loadMessages()
    }
    load()
    const timer = setInterval(load, MESSAGE_POLL_MS)
    return () => clearInterval(timer)
  }, [loadRoom, loadMessages])

  // 새 메시지가 생겼을 때만 맨 아래로
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [lastMessageId])

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleSend = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    run(async () => {
      await sendMessage(roomId, text)
      setDraft('')
      loadMessages()
    })
  }

  const openInvite = () =>
    run(async () => {
      setFriends(await listFriends())
      setSelected(new Set())
      setInviting(true)
    })

  const handleInvite = () =>
    run(async () => {
      await inviteToRoom(roomId, [...selected])
      setInviting(false)
      loadRoom()
      loadMessages()
    })

  const handleLeave = () => {
    if (!window.confirm('이 방에서 나갈까요? 다시 들어오려면 다른 멤버가 초대해야 해요.')) return
    run(async () => {
      await leaveRoom(roomId)
      navigate('/messenger')
    })
  }

  if (room === undefined) {
    return (
      <div className="page">
        <p className="map-hint">불러오는 중...</p>
      </div>
    )
  }

  if (room === null) {
    return (
      <div className="page">
        <section className="card">
          <p>대화방을 찾을 수 없어요.</p>
          <Link to="/messenger" className="btn btn-secondary">
            목록으로
          </Link>
        </section>
      </div>
    )
  }

  const others = room.members.filter((m) => m.id !== profile?.id)
  const title = roomTitle({ name: room.name, member_names: others.map((m) => m.name) })

  return (
    <div className="page">
      <section className="card chat-card">
        <div className="status-card-head">
          <h2>
            {title}
            {room.isGroup && <span className="contact-relation"> · {room.members.length}명</span>}
          </h2>
          <Link to="/messenger" className="btn btn-secondary">
            ← 목록
          </Link>
        </div>

        {room.isGroup && (
          <div className="chat-room-actions">
            <span className="contact-phone">{room.members.map((m) => m.name).join(', ')}</span>
            <div className="contact-actions">
              <button type="button" className="btn btn-secondary btn-small" onClick={openInvite} disabled={busy}>
                초대
              </button>
              <button type="button" className="btn btn-danger btn-small" onClick={handleLeave} disabled={busy}>
                나가기
              </button>
            </div>
          </div>
        )}

        {inviting && (
          <div className="form">
            <FriendPicker
              friends={friends}
              selected={selected}
              onChange={setSelected}
              excludeIds={new Set(room.members.map((m) => m.id))}
            />
            <div className="field-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleInvite}
                disabled={busy || selected.size === 0}
              >
                {selected.size}명 초대
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setInviting(false)}>
                취소
              </button>
            </div>
          </div>
        )}

        <div className="chat-thread" ref={threadRef}>
          {messages.length === 0 && <p className="map-hint">아직 메시지가 없어요.</p>}
          {messages.map((m) => (
            <div key={m.id} className={bubbleClass(m, profile?.id)}>
              <span className="chat-author">
                {m.sender_id === profile?.id ? '나' : (m.sender?.name ?? '(알 수 없음)')} · {formatTime(m.created_at)}
                {m.kind === 'auto' && ' · 자동 알림'}
              </span>
              {m.body}
              {m.lat !== null && m.lng !== null && (
                <a className="chat-location" href={kakaoMapLink(m.lat, m.lng)} target="_blank" rel="noreferrer">
                  📍 위치 보기 ({m.lat.toFixed(4)}, {m.lng.toFixed(4)})
                </a>
              )}
            </div>
          ))}
        </div>

        {error && <p className="warning-text">{error}</p>}

        <form className="chat-input-row" onSubmit={handleSend}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="메시지 입력" maxLength={2000} />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            전송
          </button>
        </form>
      </section>
    </div>
  )
}
