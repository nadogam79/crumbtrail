import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FriendPicker } from '../components/FriendPicker'
import { createGroupRoom, listFriends, listRooms, roomTitle, type Friend, type RoomSummary } from '../lib/messenger'

const ROOM_LIST_POLL_MS = 15_000

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function RoomListPage() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [groupName, setGroupName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const load = () =>
      listRooms()
        .then(setRooms)
        .catch((err: Error) => setError(err.message))
    load()
    const timer = setInterval(load, ROOM_LIST_POLL_MS)
    return () => clearInterval(timer)
  }, [])

  const openCreate = async () => {
    setCreating(true)
    setSelected(new Set())
    setGroupName('')
    try {
      setFriends(await listFriends())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (selected.size === 0) return
    setBusy(true)
    setError(null)
    try {
      navigate(`/messenger/${await createGroupRoom(groupName, [...selected])}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      {creating ? (
        <section className="card">
          <h2>단체방 만들기</h2>
          <form className="form" onSubmit={handleCreate}>
            <label className="field">
              <span>방 이름 (선택)</span>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={40}
                placeholder="비워두면 멤버 이름으로 표시돼요"
              />
            </label>
            <FriendPicker friends={friends} selected={selected} onChange={setSelected} />
            <div className="field-row">
              <button type="submit" className="btn btn-primary" disabled={busy || selected.size === 0}>
                {selected.size}명과 만들기
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>
                취소
              </button>
            </div>
          </form>
        </section>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={openCreate}>
          + 단체방 만들기
        </button>
      )}

      {error && <p className="warning-text">{error}</p>}

      <section className="card">
        <h2>대화 ({rooms?.length ?? 0})</h2>
        {rooms === null ? (
          <p className="map-hint">불러오는 중...</p>
        ) : rooms.length === 0 ? (
          <p>아직 대화가 없어요. 친구 탭에서 대화를 시작해보세요.</p>
        ) : (
          <ul className="contact-list">
            {rooms.map((r) => (
              <li key={r.id}>
                <Link to={`/messenger/${r.id}`} className="contact-item friend-link">
                  <span className="friend-avatar">{r.is_group ? '👥' : '💬'}</span>
                  <div className="friend-info">
                    <strong>{roomTitle(r)}</strong>
                    {r.is_group && <span className="contact-relation"> · {r.member_count}명</span>}
                    <div className={`contact-phone ${r.last_kind === 'auto' ? 'room-last-auto' : ''}`}>
                      {r.last_body ?? '아직 메시지가 없어요'}
                    </div>
                  </div>
                  {r.last_at && <span className="room-time">{formatTime(r.last_at)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
