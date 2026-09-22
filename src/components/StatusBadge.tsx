import type { SessionStatus } from '../types'

const LABEL: Record<SessionStatus, string> = {
  idle: '대기 중',
  active: '이동 중',
  alert: '이상 신호 감지',
  resolved: '상황 종료',
}

export function StatusBadge({ status }: { status: SessionStatus }) {
  return <span className={`status-badge status-${status}`}>{LABEL[status]}</span>
}
