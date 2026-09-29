import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './Avatar'
import { getAlertEffectPrefs, setAlertEffectPrefs, type AlertEffectPrefs } from '../lib/alertEffects'

export function AccountMenu() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState(getAlertEffectPrefs)
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

  const togglePref = (key: keyof AlertEffectPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setAlertEffectPrefs(next)
  }

  const notificationBlocked = 'Notification' in window && Notification.permission === 'denied'

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
          <div className="account-settings">
            <span className="account-settings-title">이상 신호 경보</span>
            <label className="account-toggle">
              진동
              <input type="checkbox" role="switch" className="switch" checked={prefs.vibrate} onChange={() => togglePref('vibrate')} />
            </label>
            <label className="account-toggle">
              경고음
              <input type="checkbox" role="switch" className="switch" checked={prefs.sound} onChange={() => togglePref('sound')} />
            </label>
            {notificationBlocked && (
              <span className="account-settings-note">시스템 알림이 차단돼 있어요. 브라우저 설정에서 허용해주세요.</span>
            )}
          </div>
          <button type="button" className="btn btn-secondary btn-small" onClick={handleSignOut}>
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
