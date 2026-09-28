import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useAuth } from './context/AuthContext'
import { TrackingProvider } from './context/TrackingContext'
import { AuthPage } from './pages/AuthPage'
import { MapPage } from './pages/MapPage'
import { MessengerPage } from './pages/MessengerPage'
import './App.css'

function App() {
  const { loading, profile } = useAuth()

  if (loading) return null
  if (!profile) return <AuthPage />

  // 로그아웃 시 TrackingProvider가 언마운트되면서 위치 추적도 함께 정리된다.
  return (
    <TrackingProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<MapPage />} />
          <Route path="messenger" element={<MessengerPage />} />
          <Route path="messenger/:roomId" element={<MessengerPage />} />
        </Route>
      </Routes>
    </TrackingProvider>
  )
}

export default App
