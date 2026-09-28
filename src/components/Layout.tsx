import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Layout() {
  const { pathname } = useLocation()
  const { profile, signOut } = useAuth()
  const inMessenger = pathname.startsWith('/messenger')

  const handleSignOut = () => {
    if (window.confirm('로그아웃할까요? 진행 중인 귀가 추적도 종료돼요.')) signOut()
  }

  return (
    <div className="app-shell">
      {inMessenger && (
        <header className="app-header">
          <span className="brand">🍞 CrumbTrail</span>
          <span className="app-header-user">
            {profile?.name} <span className="contact-relation">@{profile?.handle}</span>
            <button type="button" className="btn btn-secondary btn-small" onClick={handleSignOut}>
              로그아웃
            </button>
          </span>
        </header>
      )}
      <main className={inMessenger ? 'app-main' : 'app-main app-main-map'}>
        <Outlet />
      </main>
      {inMessenger && (
        <NavLink to="/" className="messenger-fab" aria-label="지도로">
          🗺️
        </NavLink>
      )}
    </div>
  )
}
