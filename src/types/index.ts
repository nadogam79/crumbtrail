export interface Coordinate {
  lat: number
  lng: number
}

export interface Contact {
  id: string
  name: string
  phone: string
  relation: string
}

export interface Breadcrumb {
  coord: Coordinate
  timestamp: number
}

export interface RouteSettings {
  destinationLabel: string
  origin: Coordinate
  destination: Coordinate
  etaMinutes: number
  checkInIntervalMinutes: number
  deviationThresholdMeters: number
  stillnessThresholdMinutes: number
}

export type AlertReason = 'deviation' | 'stillness' | 'overdue' | 'missed-checkin'

export interface AlertInfo {
  reason: AlertReason
  triggeredAt: number
  message: string
}

export type SessionStatus = 'idle' | 'active' | 'alert' | 'resolved'

export interface ChatMessage {
  id: string
  author: 'system' | 'user' | string
  authorLabel: string
  text: string
  timestamp: number
}

export const ALERT_REASON_LABEL: Record<AlertReason, string> = {
  deviation: '경로 이탈',
  stillness: '장시간 정지/신호 끊김',
  overdue: '예상 도착 시간 초과',
  'missed-checkin': '체크인 미응답',
}
