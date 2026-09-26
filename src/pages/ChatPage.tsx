import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MOCK_CONVERSATIONS, MOCK_FRIENDS } from '../data/mockMessenger'
import type { ChatMessage } from '../types'

const formatTime = (ts: number) =>
  new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function ChatPage() {
  const { friendId = '' } = useParams()
  const friend = MOCK_FRIENDS.find((f) => f.id === friendId)
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_CONVERSATIONS[friendId] ?? [])
  const [draft, setDraft] = useState('')

  if (!friend) {
    return (
      <div className="page">
        <section className="card">
          <p>친구를 찾을 수 없어요.</p>
          <Link to="/messenger" className="btn btn-secondary">
            목록으로
          </Link>
        </section>
      </div>
    )
  }

  const handleSend = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, author: 'user', authorLabel: '나', text: draft.trim(), timestamp: Date.now() },
    ])
    setDraft('')
  }

  return (
    <div className="page">
      <section className="card chat-card">
        <div className="status-card-head">
          <h2>
            {friend.avatar} {friend.name}
          </h2>
          <Link to="/messenger" className="btn btn-secondary">
            ← 목록
          </Link>
        </div>

        <div className="chat-thread">
          {messages.length === 0 && <p className="map-hint">이전 대화가 없어요.</p>}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`chat-bubble ${m.author === 'system' ? 'chat-system' : m.author === 'user' ? 'chat-user' : 'chat-contact'}`}
            >
              <span className="chat-author">
                {m.authorLabel} · {formatTime(m.timestamp)}
              </span>
              {m.text}
            </div>
          ))}
        </div>

        <form className="chat-input-row" onSubmit={handleSend}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="메시지 입력" />
          <button type="submit" className="btn btn-primary">
            전송
          </button>
        </form>
      </section>
    </div>
  )
}
