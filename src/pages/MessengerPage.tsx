import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { ChatPage } from './ChatPage'
import { FriendsPage } from './FriendsPage'
import { RoomListPage } from './RoomListPage'

type Segment = 'rooms' | 'friends'

export function MessengerPage() {
  const { roomId } = useParams()
  const location = useLocation()
  const [segment, setSegment] = useState<Segment>(
    () => (location.state as { segment?: Segment } | null)?.segment ?? 'rooms',
  )

  if (roomId) return <ChatPage key={roomId} roomId={roomId} />

  return (
    <div className="page">
      <div className="segmented-control">
        <button
          type="button"
          className={segment === 'rooms' ? 'segmented-btn active' : 'segmented-btn'}
          onClick={() => setSegment('rooms')}
        >
          대화
        </button>
        <button
          type="button"
          className={segment === 'friends' ? 'segmented-btn active' : 'segmented-btn'}
          onClick={() => setSegment('friends')}
        >
          친구
        </button>
      </div>

      {segment === 'rooms' ? <RoomListPage /> : <FriendsPage />}
    </div>
  )
}
