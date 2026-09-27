import { NavLink, Outlet, useLocation } from 'react-router-dom'

export function Layout() {
  const { pathname } = useLocation()
  const inMessenger = pathname.startsWith('/messenger')

  return (
    <div className="app-shell">
      {inMessenger && (
        <header className="app-header">
          <span className="brand">🍞 CrumbTrail</span>
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
