export interface Coordinate {
  lat: number
  lng: number
}

export interface Breadcrumb {
  coord: Coordinate
  timestamp: number
}

export type TransitMode = 'WALK' | 'BUS' | 'SUBWAY'

export interface RouteLeg {
  mode: TransitMode
  label?: string // 버스 노선명/지하철 호선명 등
  path: Coordinate[]
  distanceMeters: number
  minutes: number
}

export interface RouteResult {
  legs: RouteLeg[]
  totalDistanceMeters: number
  totalMinutes: number
}

export interface RouteSettings {
  destinationLabel: string
  origin: Coordinate
  destination: Coordinate
  etaMinutes: number
  checkInIntervalMinutes: number
  deviationThresholdMeters: number
  stillnessThresholdMinutes: number
  // 실제 경로(보행/대중교통) 조회 결과. 조회 실패 시 없을 수 있고,
  // 그 경우 origin-destination 직선을 기준으로 이탈을 판정한다(폴백).
  legs?: RouteLeg[]
}

export type AlertReason = 'deviation' | 'stillness' | 'overdue' | 'missed-checkin'

export interface AlertInfo {
  reason: AlertReason
  triggeredAt: number
  message: string
}

export type SessionStatus = 'idle' | 'active' | 'alert' | 'resolved'

export const ALERT_REASON_LABEL: Record<AlertReason, string> = {
  deviation: '경로 이탈',
  stillness: '장시간 정지/신호 끊김',
  overdue: '예상 도착 시간 초과',
  'missed-checkin': '체크인 미응답',
}
