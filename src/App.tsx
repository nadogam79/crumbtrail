import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { MapPage } from './pages/MapPage'
import { MessengerPage } from './pages/MessengerPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<MapPage />} />
        <Route path="messenger" element={<MessengerPage />} />
        <Route path="messenger/:friendId" element={<MessengerPage />} />
      </Route>
    </Routes>
  )
}

export default App
