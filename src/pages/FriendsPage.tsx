import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
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
    setFriends((prev) => prev?.map((f) => (f.profile.id === friend.profile.id ? { ...f, isEmergency: next } : f)) ?? null)
    setEmergency(friend.profile.id, next).catch((err: Error) => {
      setError(err.message)
      reload()
    })
  }

  const handleRemove = (friend: Friend) => {
    if (!window.confirm(`${friend.profile.name}님을 친구에서 삭제할까요? 기존 대화방은 남아요.`)) return
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
      <section className="card">
        <h2>친구 추가</h2>
        <p>
          아이디 또는 이름으로 찾아서 추가해요. 내 아이디는 <strong>@{profile?.handle}</strong>이에요.
        </p>
        <form className="chat-input-row" onSubmit={handleSearch}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="아이디 또는 이름"
            autoCapitalize="none"
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            검색
          </button>
        </form>
        {error && <p className="warning-text">{error}</p>}
        {results !== null &&
          (results.length === 0 ? (
            <p className="map-hint">검색 결과가 없어요.</p>
          ) : (
            <ul className="contact-list">
              {results.map((r) => (
                <li key={r.id} className="contact-item">
                  <div className="friend-info">
                    <strong>{r.name}</strong>
                    <span className="contact-relation"> @{r.handle}</span>
                  </div>
                  {friendIds.has(r.id) ? (
                    <span className="contact-relation">친구</span>
                  ) : (
                    <button type="button" className="btn btn-primary btn-small" onClick={() => handleAdd(r)} disabled={busy}>
                      추가
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section className="card">
        <h2>
          친구 ({friends?.length ?? 0}) · 비상 연락망 {emergencyCount}명
        </h2>
        <p>비상 연락망으로 지정한 친구에게는 귀가 시작, 이상 감지, 해제, 도착 소식이 1:1 대화로 자동 전송돼요.</p>
        {friends === null ? (
          <p className="map-hint">불러오는 중...</p>
        ) : friends.length === 0 ? (
          <p>아직 추가한 친구가 없어요.</p>
        ) : (
          <ul className="contact-list">
            {friends.map((f) => (
              <li key={f.profile.id} className="contact-item">
                <div className="friend-info">
                  <strong>{f.profile.name}</strong>
                  <span className="contact-relation"> @{f.profile.handle}</span>
                  <label className="emergency-toggle">
                    <input
                      type="checkbox"
                      checked={f.isEmergency}
                      onChange={() => toggleEmergency(f)}
                      disabled={busy}
                    />
                    비상 연락망
                  </label>
                </div>
                <div className="contact-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => openDm(f)} disabled={busy}>
                    대화
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => handleRemove(f)} disabled={busy}>
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
