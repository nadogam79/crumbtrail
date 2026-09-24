import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { RouteSetupPage } from './pages/RouteSetupPage'
import { TrackingPage } from './pages/TrackingPage'
import { ContactsPage } from './pages/ContactsPage'
import { AlertPage } from './pages/AlertPage'
import { MessengerPage } from './pages/MessengerPage'
import { ChatPage } from './pages/ChatPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="route-setup" element={<RouteSetupPage />} />
        <Route path="tracking" element={<TrackingPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="alert" element={<AlertPage />} />
        <Route path="messenger" element={<MessengerPage />} />
        <Route path="messenger/:friendId" element={<ChatPage />} />
      </Route>
    </Routes>
  )
}

export default App
