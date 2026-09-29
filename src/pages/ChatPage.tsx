import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
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

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

const dayKey = (iso: string) => new Date(iso).toDateString()

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
      <div className="chat-screen">
        <p className="empty">불러오는 중...</p>
      </div>
    )
  }

  if (room === null) {
    return (
      <div className="chat-screen">
        <div className="empty">
          <p>대화방을 찾을 수 없어요.</p>
          <br />
          <Link to="/messenger" className="btn btn-secondary">
            목록으로
          </Link>
        </div>
      </div>
    )
  }

  const others = room.members.filter((m) => m.id !== profile?.id)
  const title = roomTitle({ name: room.name, member_names: others.map((m) => m.name) })

  return (
    <div className="chat-screen">
      <div className="chat-bar">
        <Link to="/messenger" className="chat-back" aria-label="목록으로">
          ←
        </Link>
        <div className="chat-title">
          <strong>{title}</strong>
          {room.isGroup && (
            <span>
              {room.members.length}명 · {room.members.map((m) => m.name).join(', ')}
            </span>
          )}
        </div>
        {room.isGroup && (
          <div className="row-actions">
            <button type="button" className="btn-text" onClick={openInvite} disabled={busy}>
              초대
            </button>
            <button type="button" className="btn-text danger" onClick={handleLeave} disabled={busy}>
              나가기
            </button>
          </div>
        )}
      </div>

      {inviting && (
        <div className="chat-invite">
          <FriendPicker
            friends={friends}
            selected={selected}
            onChange={setSelected}
            excludeIds={new Set(room.members.map((m) => m.id))}
          />
          <div className="field-row">
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={handleInvite}
              disabled={busy || selected.size === 0}
            >
              {selected.size}명 초대
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setInviting(false)}>
              취소
            </button>
          </div>
        </div>
      )}

      <div className="chat-thread" ref={threadRef}>
        {messages.length === 0 && <p className="empty">아직 메시지가 없어요.</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at)
          const mine = m.sender_id === profile?.id
          // 같은 사람이 이어서 보낸 메시지는 이름을 반복하지 않는다
          const showName = !mine && (newDay || prev.kind === 'system' || prev.sender_id !== m.sender_id)

          return (
            <Fragment key={m.id}>
              {newDay && <div className="date-divider">{formatDate(m.created_at)}</div>}
              {m.kind === 'system' ? (
                <div className="msg-system">{m.body}</div>
              ) : (
                <div className={`msg-row ${mine ? 'mine' : 'theirs'}`}>
                  {showName && <span className="msg-name">{m.sender?.name ?? '(알 수 없음)'}</span>}
                  <div className="msg-line">
                    <div className={`bubble ${m.kind === 'auto' ? 'bubble-auto' : ''}`}>
                      {m.kind === 'auto' && <span className="auto-tag">자동 알림</span>}
                      <span>{m.body}</span>
                      {m.lat !== null && m.lng !== null && (
                        <a className="chat-location" href={kakaoMapLink(m.lat, m.lng)} target="_blank" rel="noreferrer">
                          📍 위치 보기 ({m.lat.toFixed(4)}, {m.lng.toFixed(4)})
                        </a>
                      )}
                    </div>
                    <span className="msg-time">{formatTime(m.created_at)}</span>
                  </div>
                </div>
              )}
            </Fragment>
          )
        })}
      </div>

      {error && <p className="warning-text chat-error">{error}</p>}

      <form className="composer" onSubmit={handleSend}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="메시지 입력" maxLength={2000} />
        <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
          전송
        </button>
      </form>
    </div>
  )
}
