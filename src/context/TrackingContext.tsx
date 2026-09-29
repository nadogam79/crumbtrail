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
import { ALERT_GRACE_MS, ALERT_REASON_LABEL } from '../types'
import { distanceMeters, distanceToPolylineMeters, distanceToRouteMeters } from '../lib/geo'
import { sendAutoAlert } from '../lib/messenger'
import { fireAlertEffects, prepareAlertEffects } from '../lib/alertEffects'

const STILL_EPSILON_METERS = 5
// 지도 상단 발송 결과 알림이 자동으로 사라지기까지의 시간
const DISPATCH_NOTICE_MS = 5000
const GPS_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }

interface TrackingState {
  status: SessionStatus
  route: RouteSettings | null
  // 이동 시작 시각(ms). 경보/해제를 거쳐도 경과 시간이 초기화되지 않도록 상태에 둔다
  startedAt: number | null
  simMinutesElapsed: number
  breadcrumbs: Breadcrumb[]
  alert: AlertInfo | null
}

// 비상 연락망 자동 발송 결과. 지도 탭에서 보낸 여부를 보여주는 데 쓴다.
export interface DispatchNotice {
  text: string
  failed: boolean
}

type Action =
  | { type: 'START_ROUTE'; route: RouteSettings; startedAt: number }
  | { type: 'ADD_BREADCRUMB'; breadcrumb: Breadcrumb; simMinutesElapsed: number }
  | { type: 'TRIGGER_ALERT'; alert: AlertInfo }
  | { type: 'ALERT_SENT' }
  | { type: 'RESOLVE_ALERT' }
  | { type: 'RESET_SESSION' }

const initialState: TrackingState = {
  status: 'idle',
  route: null,
  startedAt: null,
  simMinutesElapsed: 0,
  breadcrumbs: [],
  alert: null,
}

const isTracking = (status: SessionStatus) => status === 'active' || status === 'alert'

function reducer(state: TrackingState, action: Action): TrackingState {
  switch (action.type) {
    case 'START_ROUTE':
      return {
        ...state,
        status: 'active',
        route: action.route,
        startedAt: action.startedAt,
        simMinutesElapsed: 0,
        breadcrumbs: [{ coord: action.route.origin, timestamp: 0 }],
        alert: null,
      }
    case 'ADD_BREADCRUMB':
      // 경보 중에도 위치는 계속 기록한다 (지인에게 최신 위치가 필요하다)
      if (!isTracking(state.status)) return state
      return {
        ...state,
        breadcrumbs: [...state.breadcrumbs, action.breadcrumb],
        simMinutesElapsed: action.simMinutesElapsed,
      }
    case 'TRIGGER_ALERT':
      return { ...state, status: 'alert', alert: action.alert }
    case 'ALERT_SENT':
      return state.alert ? { ...state, alert: { ...state.alert, sendAt: null } } : state
    case 'RESOLVE_ALERT':
      // '나 괜찮아'는 경보만 끄고 추적은 이어간다
      return state.status === 'alert' ? { ...state, status: 'active', alert: null } : state
    case 'RESET_SESSION':
      return initialState
    default:
      return state
  }
}

interface TrackingContextValue extends TrackingState {
  dispatchNotice: DispatchNotice | null
  startRoute: (route: RouteSettings) => void
  // GPS를 캐시 없이 새로 받아 현재 위치를 갱신한다. 추적 중이면 기록·판정에도 반영한다.
  relocate: () => Promise<Coordinate | null>
  resolveAlert: () => void
  arrive: () => void
  stopTracking: () => void
}

const TrackingContext = createContext<TrackingContextValue | null>(null)

export function TrackingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [dispatchNotice, setDispatchNotice] = useState<DispatchNotice | null>(null)
  const stateRef = useRef(state)
  // 추적 중일 때 GPS 위치 하나를 기록·판정하는 함수. relocate()도 같은 경로로 위치를 넣는다.
  const handleFixRef = useRef<((coord: Coordinate) => void) | null>(null)
  // 유예 시간이 끝나면 보낼 경보 메시지
  const pendingAlertRef = useRef<{ label: string; body: string; coord: Coordinate } | null>(null)

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

  const tracking = isTracking(state.status)

  // Deadman-switch engine: on every real GPS fix, record it as a breadcrumb and
  // evaluate the anomaly conditions against real elapsed time.
  // 경보 중에도 계속 돌며 위치를 기록하고, 새 경보는 'active'일 때만 보낸다.
  useEffect(() => {
    if (!tracking) return
    if (!navigator.geolocation) return

    const startedAt = stateRef.current.startedAt ?? Date.now()
    let lastMovedAtMinute = (Date.now() - startedAt) / 60000
    // 한 번 알린 사유는 그 상황이 풀려야(경로 복귀, 다시 움직임) 다시 알린다.
    // 도착 지연은 풀릴 수 없으므로 한 번만 알린다.
    const armed: Record<AlertReason, boolean> = { deviation: true, stillness: true, overdue: true }
    // 상태 반영 전에 GPS 콜백이 한 번 더 들어와도 중복 발송하지 않도록
    let alertPending = false

    // 바로 보내지 않고 경보만 울린다. 유예 시간 안에 '나 괜찮아'가 없으면 아래 타이머가 발송한다.
    const triggerAlert = (reason: AlertReason, detail: string, elapsed: number, coord: Coordinate) => {
      armed[reason] = false
      alertPending = true
      const label = ALERT_REASON_LABEL[reason]
      pendingAlertRef.current = { label, body: `⚠️ ${label} 감지: ${detail}`, coord }
      dispatch({
        type: 'TRIGGER_ALERT',
        alert: { reason, triggeredAt: elapsed, message: detail, sendAt: Date.now() + ALERT_GRACE_MS },
      })
      fireAlertEffects(
        `⚠️ ${label} 감지`,
        `${detail} ${ALERT_GRACE_MS / 1000}초 안에 '나 괜찮아'를 누르지 않으면 비상 연락망에 알려요.`,
      )
    }

    const handleFix = (coord: Coordinate) => {
      const current = stateRef.current
      const route = current.route
      if (!route || !isTracking(current.status)) return
      // 경보가 해제되어 'active'로 돌아왔으면 다시 판정할 수 있다
      if (current.status === 'active') alertPending = false

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
      const deviated = deviationM > route.deviationThresholdMeters
      const still = elapsed - lastMovedAtMinute >= route.stillnessThresholdMinutes

      if (!deviated) armed.deviation = true
      if (!still) armed.stillness = true

      if (alertPending || current.status !== 'active') return

      if (deviated && armed.deviation) {
        triggerAlert('deviation', `예상 경로에서 약 ${Math.round(deviationM)}m 벗어났어요.`, elapsed, coord)
        return
      }

      if (still && armed.stillness) {
        triggerAlert('stillness', `${route.stillnessThresholdMinutes}분 이상 위치가 움직이지 않았어요.`, elapsed, coord)
        return
      }

      if (elapsed > route.etaMinutes + route.stillnessThresholdMinutes && armed.overdue) {
        triggerAlert(
          'overdue',
          `예상 도착 시간(${route.etaMinutes}분)이 지났는데 도착하지 않았어요.`,
          elapsed,
          coord,
        )
      }
    }

    handleFixRef.current = handleFix
    const watchId = navigator.geolocation.watchPosition(
      (pos) => handleFix({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      undefined,
      GPS_OPTIONS,
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
      handleFixRef.current = null
    }
  }, [tracking, notify])

  const lastCoord = () => stateRef.current.breadcrumbs.at(-1)?.coord ?? null

  // 경보 유예 타이머: 시간이 다 되면 그때 비상 연락망에 보낸다. 해제/종료되면 sendAt이 바뀌어 취소된다.
  const sendAt = state.alert?.sendAt ?? null
  useEffect(() => {
    if (sendAt === null) return
    const timer = setTimeout(() => {
      const pending = pendingAlertRef.current
      pendingAlertRef.current = null
      dispatch({ type: 'ALERT_SENT' })
      if (pending) notify(pending.label, pending.body, lastCoord() ?? pending.coord)
    }, Math.max(0, sendAt - Date.now()))
    return () => clearTimeout(timer)
  }, [sendAt, notify])

  const startRoute = useCallback(
    (route: RouteSettings) => {
      // 이동 시작 버튼을 누른 순간에 경고음/알림 권한을 준비해둔다
      prepareAlertEffects()
      dispatch({ type: 'START_ROUTE', route, startedAt: Date.now() })
      notify(
        '귀가 시작',
        `🍞 ${route.destinationLabel}(으)로 귀가를 시작했어요. 예상 소요 ${route.etaMinutes}분.`,
        route.origin,
      )
    },
    [notify],
  )

  const relocate = useCallback(
    () =>
      new Promise<Coordinate | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coord = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            handleFixRef.current?.(coord)
            resolve(coord)
          },
          () => resolve(null),
          { ...GPS_OPTIONS, maximumAge: 0 },
        )
      }),
    [],
  )

  const resolveAlert = useCallback(() => {
    const alreadySent = stateRef.current.alert?.sendAt === null
    pendingAlertRef.current = null
    dispatch({ type: 'RESOLVE_ALERT' })
    // 유예 시간 안에 누르면 아무것도 보내지 않은 상태이므로 해제 메시지도 보내지 않는다
    if (alreadySent) notify('오탐 해제', '✅ 괜찮아요, 오탐이었어요. 알림을 해제할게요.', lastCoord())
  }, [notify])

  const arrive = useCallback(() => {
    const destination = stateRef.current.route?.destinationLabel ?? '목적지'
    notify('도착', `🏠 ${destination}에 무사히 도착했어요.`, lastCoord())
    pendingAlertRef.current = null
    dispatch({ type: 'RESET_SESSION' })
  }, [notify])

  const stopTracking = useCallback(() => {
    notify('추적 중단', '⏹ 귀가 추적을 중단했어요.', lastCoord())
    pendingAlertRef.current = null
    dispatch({ type: 'RESET_SESSION' })
  }, [notify])

  const value = useMemo<TrackingContextValue>(
    () => ({ ...state, dispatchNotice, startRoute, relocate, resolveAlert, arrive, stopTracking }),
    [state, dispatchNotice, startRoute, relocate, resolveAlert, arrive, stopTracking],
  )

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>
}

export function useTracking() {
  const ctx = useContext(TrackingContext)
  if (!ctx) throw new Error('useTracking must be used within a TrackingProvider')
  return ctx
}
