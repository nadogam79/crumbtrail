import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  addFriend,
  getOrCreateDm,
  listFriends,
  removeFriend,
  searchProfiles,
  setEmergency,
  type Friend,
  type Profile,
} from '../lib/messenger'

export function FriendsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [query, setQuery] = useState('')
  // null: 아직 검색 안 함
  const [results, setResults] = useState<Profile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      setFriends(await listFriends())
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

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

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    const text = query.trim()
    if (!text || !profile) return
    run(async () => {
      setResults(await searchProfiles(text, profile.id))
    })
  }

  const handleAdd = (target: Profile) =>
    run(async () => {
      await addFriend(target.id)
      await reload()
    })

  const friendIds = new Set(friends?.map((f) => f.profile.id))

  // 체크박스가 바로 반응하도록 먼저 화면에 반영하고, 실패하면 서버 값으로 되돌린다.
  const toggleEmergency = (friend: Friend) => {
    const next = !friend.isEmergency
    setFriends(
      (prev) => prev?.map((f) => (f.profile.id === friend.profile.id ? { ...f, isEmergency: next } : f)) ?? null,
    )
    setEmergency(friend.profile.id, next).catch((err: Error) => {
      setError(err.message)
      reload()
    })
  }

  const handleRemove = async (friend: Friend) => {
    const ok = await confirm({
      title: `${friend.profile.name}님을 친구에서 삭제할까요?`,
      message: '기존 대화방은 남아요.',
      confirmLabel: '삭제',
      danger: true,
    })
    if (!ok) return
    run(async () => {
      await removeFriend(friend.profile.id)
      await reload()
    })
  }

  const openDm = (friend: Friend) =>
    run(async () => {
      navigate(`/messenger/${await getOrCreateDm(friend.profile.id)}`)
    })

  const emergencyCount = friends?.filter((f) => f.isEmergency).length ?? 0

  return (
    <>
      <form className="panel" onSubmit={handleSearch}>
        <h2>친구 추가</h2>
        <div className="search-bar">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="아이디 또는 이름으로 검색"
            autoCapitalize="none"
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            검색
          </button>
        </div>
        <p className="map-hint">
          내 아이디는 <strong>@{profile?.handle}</strong>이에요.
        </p>
        {error && <p className="warning-text">{error}</p>}
        {results !== null &&
          (results.length === 0 ? (
            <p className="map-hint">검색 결과가 없어요.</p>
          ) : (
            <ul className="list">
              {results.map((r) => (
                <li key={r.id} className="list-row">
                  <Avatar name={r.name} small />
                  <div className="row-main">
                    <span className="row-title">
                      {r.name}
                      <span className="muted">@{r.handle}</span>
                    </span>
                  </div>
                  {friendIds.has(r.id) ? (
                    <span className="row-tag">친구</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => handleAdd(r)}
                      disabled={busy}
                    >
                      추가
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </form>

      <div className="section-head">
        <h2>
          친구 <span className="count">{friends?.length ?? 0}</span>
        </h2>
        <span className="map-hint">비상 연락망 {emergencyCount}명</span>
      </div>
      <p className="section-desc">
        비상 연락망에게는 귀가 시작, 이상 감지, 해제, 도착 소식이 1:1 대화로 자동 전송돼요.
      </p>

      {friends === null ? (
        <p className="empty">불러오는 중...</p>
      ) : friends.length === 0 ? (
        <p className="empty">아직 추가한 친구가 없어요.</p>
      ) : (
        <ul className="list">
          {friends.map((f) => (
            <li key={f.profile.id} className="list-row">
              <Avatar name={f.profile.name} police={f.isPolice} />
              <div className="row-main">
                <span className="row-title">
                  {f.profile.name}
                  <span className="muted">@{f.profile.handle}</span>
                </span>
                {f.isPolice ? (
                  <span className="emergency-toggle fixed">기본 친구 · 모든 비상 메시지를 받아요</span>
                ) : (
                  <label className="emergency-toggle">
                    <input type="checkbox" checked={f.isEmergency} onChange={() => toggleEmergency(f)} />
                    비상 연락망
                  </label>
                )}
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-secondary btn-small" onClick={() => openDm(f)} disabled={busy}>
                  대화
                </button>
                {!f.isPolice && (
                  <button type="button" className="btn-text danger" onClick={() => handleRemove(f)} disabled={busy}>
                    삭제
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
