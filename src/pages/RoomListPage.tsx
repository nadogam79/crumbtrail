import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { FriendPicker } from '../components/FriendPicker'
import { createGroupRoom, listFriends, listRooms, roomTitle, type Friend, type RoomSummary } from '../lib/messenger'

const ROOM_LIST_POLL_MS = 15_000

// 오늘이면 시각만, 아니면 날짜만 (메신저 목록 관례)
function formatListTime(iso: string) {
  const date = new Date(iso)
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday
    ? date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

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
      {creating && (
        <form className="panel" onSubmit={handleCreate}>
          <h2>단체방 만들기</h2>
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
      )}

      <div className="section-head">
        <h2>
          대화 <span className="count">{rooms?.length ?? 0}</span>
        </h2>
        {!creating && (
          <button type="button" className="btn btn-secondary btn-small" onClick={openCreate}>
            + 단체방 만들기
          </button>
        )}
      </div>

      {error && <p className="warning-text section-desc">{error}</p>}

      {rooms === null ? (
        <p className="empty">불러오는 중...</p>
      ) : rooms.length === 0 ? (
        <p className="empty">아직 대화가 없어요. 친구 탭에서 대화를 시작해보세요.</p>
      ) : (
        <ul className="list">
          {rooms.map((r) => {
            const title = roomTitle(r)
            return (
              <li key={r.id}>
                <Link to={`/messenger/${r.id}`} className="list-row">
                  <Avatar name={title} group={r.is_group} />
                  <div className="row-main">
                    <span className="row-title">
                      {title}
                      {r.is_group && <span className="muted">{r.member_count}</span>}
                    </span>
                    <span className={`row-sub ${r.last_kind === 'auto' ? 'room-last-auto' : ''}`}>
                      {r.last_body ?? '아직 메시지가 없어요'}
                    </span>
                  </div>
                  {r.last_at && <span className="row-meta">{formatListTime(r.last_at)}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
