import type { Friend } from '../lib/messenger'

interface FriendPickerProps {
  friends: Friend[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  // 이미 방에 있는 사람 등 선택할 수 없는 대상
  excludeIds?: Set<string>
}

export function FriendPicker({ friends, selected, onChange, excludeIds }: FriendPickerProps) {
  // 경찰은 단체방에 넣을 수 없다
  const candidates = friends.filter((f) => !f.isPolice && !excludeIds?.has(f.profile.id))

  if (candidates.length === 0) return <p className="map-hint">선택할 수 있는 친구가 없어요.</p>

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <ul className="contact-list">
      {candidates.map((f) => (
        <li key={f.profile.id}>
          <label className="contact-item picker-item">
            <input type="checkbox" checked={selected.has(f.profile.id)} onChange={() => toggle(f.profile.id)} />
            <span className="friend-info">
              <strong>{f.profile.name}</strong>
              <span className="contact-relation"> @{f.profile.handle}</span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}
