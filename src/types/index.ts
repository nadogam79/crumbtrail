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
  // 경로 재탐지 때 지나온 경로 끝과 새 경로 시작을 잇는 구간 (지도에 점선으로 그린다)
  connector?: boolean
}

export interface RouteResult {
  // transit: 대중교통 경로, pedestrian: 가까운 거리 등으로 대중교통 경로가 없어 도보 경로로 대체
  source?: 'transit' | 'pedestrian'
  legs: RouteLeg[]
  totalDistanceMeters: number
  totalMinutes: number
}

export interface RouteSettings {
  destinationLabel: string
  origin: Coordinate
  destination: Coordinate
  etaMinutes: number
  deviationThresholdMeters: number
  stillnessThresholdMinutes: number
  // 실제 경로(보행/대중교통) 조회 결과. 조회 실패 시 없을 수 있고,
  // 그 경우 origin-destination 직선을 기준으로 이탈을 판정한다(폴백).
  legs?: RouteLeg[]
  // 경로 출처. 대중교통 경로는 재탐지를 지원하지 않는다(TMAP 대중교통 API 하루 10회 한도)
  source?: RouteResult['source']
  // 빵 조각 간격(m). 재탐지로 경로 길이가 바뀌어도 이미 찍힌 빵 조각 위치가 그대로이도록 고정한다
  crumbIntervalMeters?: number
}

export type AlertReason = 'deviation' | 'stillness' | 'overdue'

export interface AlertInfo {
  reason: AlertReason
  triggeredAt: number
  message: string
  // 이 시각(ms)까지 '나 괜찮아'를 누르지 않으면 비상 연락망에 발송한다. null이면 이미 발송됨
  sendAt: number | null
}

// 경보가 뜬 뒤 비상 연락망에 보내기 전까지 '나 괜찮아'로 취소할 수 있는 시간
export const ALERT_GRACE_MS = 30_000

export type SessionStatus = 'idle' | 'active' | 'alert'

export const ALERT_REASON_LABEL: Record<AlertReason, string> = {
  deviation: '경로 이탈',
  stillness: '장시간 정지/신호 끊김',
  overdue: '예상 도착 시간 초과',
}
