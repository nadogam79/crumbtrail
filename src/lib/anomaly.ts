import type { AlertReason, Coordinate, RouteSettings } from '../types'
import { distanceToPolylineMeters, distanceToRouteMeters } from './geo'

// 이상 감지 규칙. React와 무관한 순수 함수라 따로 테스트할 수 있다.

export interface FixEvaluation {
  deviationMeters: number
  deviated: boolean // 경로에서 허용 거리보다 멀리 있음
  still: boolean // 허용 시간 이상 움직이지 않음
  overdue: boolean // 예상 도착 시간 + 정지 허용 시간을 넘김
}

// GPS 위치 하나를 경로·경과 시간에 비춰 판정한다
export function evaluateFix(
  coord: Coordinate,
  route: RouteSettings,
  elapsedMinutes: number,
  lastMovedAtMinute: number,
): FixEvaluation {
  const fullPath = route.legs?.flatMap((leg) => leg.path) ?? []
  const deviationMeters =
    fullPath.length > 1
      ? distanceToPolylineMeters(coord, fullPath)
      : distanceToRouteMeters(coord, route.origin, route.destination)
  return {
    deviationMeters,
    deviated: deviationMeters > route.deviationThresholdMeters,
    still: elapsedMinutes - lastMovedAtMinute >= route.stillnessThresholdMinutes,
    overdue: elapsedMinutes > route.etaMinutes + route.stillnessThresholdMinutes,
  }
}

// 판정 결과 중 지금 알릴 경보 하나를 고른다 (이탈 > 정지 > 도착 지연 순).
// armed가 false인 사유는 이미 알렸고 아직 상황이 풀리지 않은 것이라 건너뛴다.
export function pickAlert(
  evaluation: FixEvaluation,
  armed: Record<AlertReason, boolean>,
  route: RouteSettings,
): { reason: AlertReason; detail: string } | null {
  if (evaluation.deviated && armed.deviation) {
    return { reason: 'deviation', detail: `예상 경로에서 약 ${Math.round(evaluation.deviationMeters)}m 벗어났어요.` }
  }
  if (evaluation.still && armed.stillness) {
    return { reason: 'stillness', detail: `${route.stillnessThresholdMinutes}분 이상 위치가 움직이지 않았어요.` }
  }
  if (evaluation.overdue && armed.overdue) {
    return { reason: 'overdue', detail: `예상 도착 시간(${route.etaMinutes}분)이 지났는데 도착하지 않았어요.` }
  }
  return null
}
