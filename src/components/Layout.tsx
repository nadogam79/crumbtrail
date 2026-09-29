import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { pathname } = useLocation();
  const { profile, signOut } = useAuth();
  const inMessenger = pathname.startsWith("/messenger");
  const inRoom = /^\/messenger\/[^/]+/.test(pathname);

  const handleSignOut = () => {
    if (window.confirm("로그아웃할까요? 진행 중인 귀가 추적도 종료돼요."))
      signOut();
  };

  const mainClass = !inMessenger
    ? "app-main app-main-map"
    : inRoom
      ? "app-main app-main-chat"
      : "app-main";

  return (
    <div className="app-shell">
      {inMessenger && !inRoom && (
        <header className="app-header">
          <span className="brand">실종빵프로맵</span>
          <span className="app-header-user">
            {profile?.name} <span className="handle">@{profile?.handle}</span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={handleSignOut}
            >
              로그아웃
            </button>
          </span>
        </header>
      )}
      <main className={mainClass}>
        <Outlet />
      </main>
      {/* 목록↔채팅방 이동 시 같은 요소가 유지되어야 위치 전환 애니메이션이 동작한다 */}
      {inMessenger && (
        <nav
          className={`floating-nav messenger-nav ${inRoom ? "messenger-nav-top" : ""}`}
        >
          <NavLink to="/" className="floating-nav-btn floating-nav-btn-primary">
            지도로 돌아가기
          </NavLink>
        </nav>
      )}
    </div>
  );
}
