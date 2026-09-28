import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './Avatar'

export function AccountMenu() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 바깥을 누르면 닫기
  useEffect(() => {
    if (!open) return
    const handle = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  }, [open])

  if (!profile) return null

  const handleSignOut = () => {
    if (window.confirm('로그아웃할까요? 진행 중인 귀가 추적도 종료돼요.')) signOut()
  }

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="계정 정보"
        aria-expanded={open}
      >
        <Avatar name={profile.name} small />
      </button>
      {open && (
        <div className="account-dropdown">
          <strong>{profile.name}</strong>
          <span>@{profile.handle}</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={handleSignOut}>
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
