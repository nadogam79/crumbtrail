interface AvatarProps {
  name: string
  group?: boolean
  police?: boolean
  small?: boolean
}

// 프로필 사진 기능은 없으므로 이름 첫 글자로 표시
export function Avatar({ name, group, police, small }: AvatarProps) {
  const variant = police ? ' avatar-police' : group ? ' avatar-group' : ''
  return (
    <span className={`avatar${variant}${small ? ' avatar-small' : ''}`} aria-hidden="true">
      {group ? '👥' : name.slice(0, 1)}
    </span>
  )
}
