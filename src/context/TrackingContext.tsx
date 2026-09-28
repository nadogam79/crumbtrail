import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AlertInfo, AlertReason, Breadcrumb, Coordinate, RouteSettings, SessionStatus } from '../types'
import { ALERT_REASON_LABEL } from '../types'
import { distanceMeters, distanceToPolylineMeters, distanceToRouteMeters } from '../lib/geo'
import { sendAutoAlert } from '../lib/messenger'

const STILL_EPSILON_METERS = 5
// 지도 상단 발송 결과 알림이 자동으로 사라지기까지의 시간
const DISPATCH_NOTICE_MS = 5000

interface TrackingState {
  status: SessionStatus
  route: RouteSettings | null
  simMinutesElapsed: number
  breadcrumbs: Breadcrumb[]
  lastCheckInMinute: number | null
  alert: AlertInfo | null
}

// 비상 연락망 자동 발송 결과. 지도 탭에서 보낸 여부를 보여주는 데 쓴다.
export interface DispatchNotice {
  text: string
  failed: boolean
}

type Action =
  | { type: 'START_ROUTE'; route: RouteSettings }
  | { type: 'ADD_BREADCRUMB'; breadcrumb: Breadcrumb; simMinutesElapsed: number }
  | { type: 'CHECK_IN' }
  | { type: 'TRIGGER_ALERT'; alert: AlertInfo }
  | { type: 'RESOLVE_ALERT' }
  | { type: 'RESET_SESSION' }

const initialState: TrackingState = {
  status: 'idle',
  route: null,
  simMinutesElapsed: 0,
  breadcrumbs: [],
  lastCheckInMinute: null,
  alert: null,
}

function reducer(state: TrackingState, action: Action): TrackingState {
  switch (action.type) {
    case 'START_ROUTE':
      return {
        ...state,
        status: 'active',
        route: action.route,
        simMinutesElapsed: 0,
        breadcrumbs: [{ coord: action.route.origin, timestamp: 0 }],
        lastCheckInMinute: 0,
        alert: null,
      }
    case 'ADD_BREADCRUMB':
      if (state.status !== 'active') return state
      return {
        ...state,
        breadcrumbs: [...state.breadcrumbs, action.breadcrumb],
        simMinutesElapsed: action.simMinutesElapsed,
      }
    case 'CHECK_IN':
      return { ...state, lastCheckInMinute: state.simMinutesElapsed }
    case 'TRIGGER_ALERT':
      return { ...state, status: 'alert', alert: action.alert }
    case 'RESOLVE_ALERT':
      return { ...state, status: 'resolved' }
    case 'RESET_SESSION':
      return initialState
    default:
      return state
  }
}

interface TrackingContextValue extends TrackingState {
  dispatchNotice: DispatchNotice | null
  startRoute: (route: RouteSettings) => void
  checkIn: () => void
  resolveAlert: () => void
  arrive: () => void
  stopTracking: () => void
}

const TrackingContext = createContext<TrackingContextValue | null>(null)

export function TrackingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [dispatchNotice, setDispatchNotice] = useState<DispatchNotice | null>(null)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  })

  useEffect(() => {
    if (!dispatchNotice) return
    const timer = setTimeout(() => setDispatchNotice(null), DISPATCH_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [dispatchNotice])

  // 지도 탭 이벤트를 비상 연락망 친구들의 1:1방으로 자동 발송
  const notify = useCallback(async (label: string, body: string, coord: Coordinate | null) => {
    try {
      const count = await sendAutoAlert(body, coord)
      setDispatchNotice(
        count > 0
          ? { text: `${label}: 비상 연락망 ${count}명에게 메시지를 보냈어요.`, failed: false }
          : { text: `${label}: 비상 연락망으로 지정된 친구가 없어 보내지 못했어요.`, failed: true },
      )
    } catch {
      setDispatchNotice({ text: `${label}: 메시지 전송에 실패했어요. 네트워크를 확인해주세요.`, failed: true })
    }
  }, [])

  // Deadman-switch engine: on every real GPS fix, record it as a breadcrumb and
  // evaluate the four anomaly conditions from CLAUDE.md against real elapsed time.
  useEffect(() => {
    if (state.status !== 'active') return
    if (!navigator.geolocation) return

    const startedAt = Date.now()
    let lastMovedAtMinute = 0
    // 상태 반영 전에 GPS 콜백이 한 번 더 들어와도 중복 발송하지 않도록
    let alerted = false

    const triggerAlert = (reason: AlertReason, detail: string, elapsed: number, coord: Coordinate) => {
      alerted = true
      dispatch({
        type: 'TRIGGER_ALERT',
        alert: { reason, triggeredAt: elapsed, message: `${detail} 비상 연락망에 알림을 보내고 있어요.` },
      })
      notify(ALERT_REASON_LABEL[reason], `⚠️ ${ALERT_REASON_LABEL[reason]} 감지: ${detail}`, coord)
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const current = stateRef.current
        const route = current.route
        if (alerted || !route || current.status !== 'active') return

        const coord = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        const elapsed = (Date.now() - startedAt) / 60000
        const lastCoord = current.breadcrumbs[current.breadcrumbs.length - 1].coord

        if (distanceMeters(coord, lastCoord) >= STILL_EPSILON_METERS) {
          lastMovedAtMinute = elapsed
        }

        dispatch({
          type: 'ADD_BREADCRUMB',
          breadcrumb: { coord, timestamp: elapsed },
          simMinutesElapsed: elapsed,
        })

        const fullPath = route.legs?.flatMap((leg) => leg.path) ?? []
        const deviationM =
          fullPath.length > 1
            ? distanceToPolylineMeters(coord, fullPath)
            : distanceToRouteMeters(coord, route.origin, route.destination)

        if (deviationM > route.deviationThresholdMeters) {
          triggerAlert('deviation', `예상 경로에서 약 ${Math.round(deviationM)}m 벗어났어요.`, elapsed, coord)
          return
        }

        const stillMinutes = elapsed - lastMovedAtMinute

        if (stillMinutes >= route.stillnessThresholdMinutes) {
          triggerAlert('stillness', `${route.stillnessThresholdMinutes}분 이상 위치가 움직이지 않았어요.`, elapsed, coord)
          return
        }

        if (elapsed - (current.lastCheckInMinute ?? 0) >= route.checkInIntervalMinutes) {
          triggerAlert('missed-checkin', `${route.checkInIntervalMinutes}분 동안 체크인이 없었어요.`, elapsed, coord)
          return
        }

        if (elapsed > route.etaMinutes + route.stillnessThresholdMinutes) {
          triggerAlert(
            'overdue',
            `예상 도착 시간(${route.etaMinutes}분)이 지났는데 도착하지 않았어요.`,
            elapsed,
            coord,
          )
        }
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [state.status, notify])

  const lastCoord = () => stateRef.current.breadcrumbs.at(-1)?.coord ?? null

  const startRoute = useCallback(
    (route: RouteSettings) => {
      dispatch({ type: 'START_ROUTE', route })
      notify(
        '귀가 시작',
        `🍞 ${route.destinationLabel}(으)로 귀가를 시작했어요. 예상 소요 ${route.etaMinutes}분.`,
        route.origin,
      )
    },
    [notify],
  )

  const checkIn = useCallback(() => {
    dispatch({ type: 'CHECK_IN' })
  }, [])

  const resolveAlert = useCallback(() => {
    dispatch({ type: 'RESOLVE_ALERT' })
    notify('오탐 해제', '✅ 괜찮아요, 오탐이었어요. 알림을 해제할게요.', lastCoord())
  }, [notify])

  const arrive = useCallback(() => {
    const destination = stateRef.current.route?.destinationLabel ?? '목적지'
    notify('도착', `🏠 ${destination}에 무사히 도착했어요.`, lastCoord())
    dispatch({ type: 'RESET_SESSION' })
  }, [notify])

  const stopTracking = useCallback(() => {
    notify('추적 중단', '⏹ 귀가 추적을 중단했어요.', lastCoord())
    dispatch({ type: 'RESET_SESSION' })
  }, [notify])

  const value = useMemo<TrackingContextValue>(
    () => ({ ...state, dispatchNotice, startRoute, checkIn, resolveAlert, arrive, stopTracking }),
    [state, dispatchNotice, startRoute, checkIn, resolveAlert, arrive, stopTracking],
  )

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>
}

export function useTracking() {
  const ctx = useContext(TrackingContext)
  if (!ctx) throw new Error('useTracking must be used within a TrackingProvider')
  return ctx
}
