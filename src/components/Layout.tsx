import { NavLink, Outlet } from 'react-router-dom'
import { useTracking } from '../context/TrackingContext'

const NAV_ITEMS = [
  { to: '/', label: '홈' },
  { to: '/route-setup', label: '경로 설정' },
  { to: '/tracking', label: '이동 중' },
  { to: '/contacts', label: '지인 관리' },
]

export function Layout() {
  const { status } = useTracking()

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">🍞 CrumbTrail</span>
        <nav className="app-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/alert"
            className={({ isActive }) =>
              isActive ? 'nav-link active nav-alert' : status === 'alert' ? 'nav-link nav-alert' : 'nav-link'
            }
          >
            알림방{status === 'alert' ? ' 🔴' : ''}
          </NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
