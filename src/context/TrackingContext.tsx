import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import type {
  AlertInfo,
  Breadcrumb,
  ChatMessage,
  Contact,
  RouteSettings,
  SessionStatus,
} from '../types'
import { distanceMeters, distanceToRouteMeters, interpolate } from '../lib/geo'

// 1 tick = 2 real seconds = 1 simulated minute, so minute-based thresholds
// (check-in interval, stillness, ETA) can be demoed in seconds without a live GPS feed.
const TICK_MS = 2000
const SIM_MINUTES_PER_TICK = 1
const STILL_EPSILON_METERS = 5

export type MovementMode = 'normal' | 'deviating' | 'stopped'

interface TrackingState {
  status: SessionStatus
  route: RouteSettings | null
  simMinutesElapsed: number
  breadcrumbs: Breadcrumb[]
  lastCheckInMinute: number | null
  movementMode: MovementMode
  alert: AlertInfo | null
  contacts: Contact[]
  messages: ChatMessage[]
}

type Action =
  | { type: 'ADD_CONTACT'; contact: Contact }
  | { type: 'UPDATE_CONTACT'; contact: Contact }
  | { type: 'REMOVE_CONTACT'; id: string }
  | { type: 'START_ROUTE'; route: RouteSettings }
  | { type: 'ADD_BREADCRUMB'; breadcrumb: Breadcrumb; simMinutesElapsed: number }
  | { type: 'CHECK_IN' }
  | { type: 'SET_MOVEMENT_MODE'; mode: MovementMode }
  | { type: 'TRIGGER_ALERT'; alert: AlertInfo }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'RESOLVE_ALERT' }
  | { type: 'RESET_SESSION' }

const initialState: TrackingState = {
  status: 'idle',
  route: null,
  simMinutesElapsed: 0,
  breadcrumbs: [],
  lastCheckInMinute: null,
  movementMode: 'normal',
  alert: null,
  contacts: [],
  messages: [],
}

function systemMessage(text: string, timestamp: number): ChatMessage {
  return {
    id: crypto.randomUUID(),
    author: 'system',
    authorLabel: '시스템',
    text,
    timestamp,
  }
}

function reducer(state: TrackingState, action: Action): TrackingState {
  switch (action.type) {
    case 'ADD_CONTACT':
      return { ...state, contacts: [...state.contacts, action.contact] }
    case 'UPDATE_CONTACT':
      return {
        ...state,
        contacts: state.contacts.map((c) => (c.id === action.contact.id ? action.contact : c)),
      }
    case 'REMOVE_CONTACT':
      return { ...state, contacts: state.contacts.filter((c) => c.id !== action.id) }
    case 'START_ROUTE':
      return {
        ...state,
        status: 'active',
        route: action.route,
        simMinutesElapsed: 0,
        breadcrumbs: [{ coord: action.route.origin, timestamp: 0 }],
        lastCheckInMinute: 0,
        movementMode: 'normal',
        alert: null,
        messages: [
          systemMessage(
            `${action.route.destinationLabel}(으)로 이동을 시작했어요. 예상 소요 ${action.route.etaMinutes}분.`,
            0,
          ),
        ],
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
    case 'SET_MOVEMENT_MODE':
      return { ...state, movementMode: action.mode }
    case 'TRIGGER_ALERT':
      return {
        ...state,
        status: 'alert',
        alert: action.alert,
        messages: [...state.messages, systemMessage(action.alert.message, state.simMinutesElapsed)],
      }
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] }
    case 'RESOLVE_ALERT':
      return {
        ...state,
        status: 'resolved',
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            author: 'user',
            authorLabel: '나',
            text: '나 괜찮아, 오탐이었어!',
            timestamp: state.simMinutesElapsed,
          },
          systemMessage('상태가 해제되었습니다. 모두에게 알림이 전송되었어요.', state.simMinutesElapsed),
        ],
      }
    case 'RESET_SESSION':
      return {
        ...state,
        status: 'idle',
        route: null,
        simMinutesElapsed: 0,
        breadcrumbs: [],
        lastCheckInMinute: null,
        movementMode: 'normal',
        alert: null,
        messages: [],
      }
    default:
      return state
  }
}

const CONTACTS_STORAGE_KEY = 'crumbtrail.contacts'

interface TrackingContextValue extends TrackingState {
  addContact: (contact: Omit<Contact, 'id'>) => void
  updateContact: (contact: Contact) => void
  removeContact: (id: string) => void
  startRoute: (route: RouteSettings) => void
  checkIn: () => void
  setMovementMode: (mode: MovementMode) => void
  postMessage: (text: string, meta?: { author: string; authorLabel: string }) => void
  resolveAlert: () => void
  resetSession: () => void
}

const TrackingContext = createContext<TrackingContextValue | null>(null)

function loadStoredContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function TrackingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => ({
    ...init,
    contacts: loadStoredContacts(),
  }))
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  })

  useEffect(() => {
    localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(state.contacts))
  }, [state.contacts])

  // Deadman-switch engine: every tick, advance the simulated position and
  // evaluate the four anomaly conditions from CLAUDE.md against it.
  useEffect(() => {
    if (state.status !== 'active') return

    const interval = setInterval(() => {
      const current = stateRef.current
      const route = current.route
      if (!route || current.status !== 'active') return

      const elapsed = current.simMinutesElapsed + SIM_MINUTES_PER_TICK
      const progress = Math.min(1, elapsed / route.etaMinutes)
      const base = interpolate(route.origin, route.destination, progress)
      const lastCoord = current.breadcrumbs[current.breadcrumbs.length - 1].coord

      let coord = base
      if (current.movementMode === 'stopped') {
        coord = lastCoord
      } else if (current.movementMode === 'deviating') {
        coord = { lat: base.lat + 0.004, lng: base.lng + 0.004 }
      }

      dispatch({
        type: 'ADD_BREADCRUMB',
        breadcrumb: { coord, timestamp: elapsed },
        simMinutesElapsed: elapsed,
      })

      let stillMinutes = distanceMeters(coord, lastCoord) < STILL_EPSILON_METERS ? SIM_MINUTES_PER_TICK : 0
      if (stillMinutes > 0) {
        for (let i = current.breadcrumbs.length - 1; i >= 1; i--) {
          const a = current.breadcrumbs[i].coord
          const b = current.breadcrumbs[i - 1].coord
          if (distanceMeters(a, b) < STILL_EPSILON_METERS) {
            stillMinutes += SIM_MINUTES_PER_TICK
          } else {
            break
          }
        }
      }

      const deviationM = distanceToRouteMeters(coord, route.origin, route.destination)

      if (deviationM > route.deviationThresholdMeters) {
        dispatch({
          type: 'TRIGGER_ALERT',
          alert: {
            reason: 'deviation',
            triggeredAt: elapsed,
            message: `경로에서 약 ${Math.round(deviationM)}m 벗어났어요. 등록된 지인에게 알림을 보냈어요.`,
          },
        })
        return
      }

      if (stillMinutes >= route.stillnessThresholdMinutes) {
        dispatch({
          type: 'TRIGGER_ALERT',
          alert: {
            reason: 'stillness',
            triggeredAt: elapsed,
            message: `${route.stillnessThresholdMinutes}분 이상 위치 신호가 멈췄어요. 등록된 지인에게 알림을 보냈어요.`,
          },
        })
        return
      }

      if (elapsed - (current.lastCheckInMinute ?? 0) >= route.checkInIntervalMinutes) {
        dispatch({
          type: 'TRIGGER_ALERT',
          alert: {
            reason: 'missed-checkin',
            triggeredAt: elapsed,
            message: `${route.checkInIntervalMinutes}분 동안 체크인이 없었어요. 등록된 지인에게 알림을 보냈어요.`,
          },
        })
        return
      }

      if (elapsed > route.etaMinutes + route.stillnessThresholdMinutes) {
        dispatch({
          type: 'TRIGGER_ALERT',
          alert: {
            reason: 'overdue',
            triggeredAt: elapsed,
            message: `예상 도착 시간(${route.etaMinutes}분)이 지났는데 도착 신호가 없어요. 등록된 지인에게 알림을 보냈어요.`,
          },
        })
      }
    }, TICK_MS)

    return () => clearInterval(interval)
  }, [state.status])

  const addContact = useCallback((contact: Omit<Contact, 'id'>) => {
    dispatch({ type: 'ADD_CONTACT', contact: { ...contact, id: crypto.randomUUID() } })
  }, [])

  const updateContact = useCallback((contact: Contact) => {
    dispatch({ type: 'UPDATE_CONTACT', contact })
  }, [])

  const removeContact = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_CONTACT', id })
  }, [])

  const startRoute = useCallback((route: RouteSettings) => {
    dispatch({ type: 'START_ROUTE', route })
  }, [])

  const checkIn = useCallback(() => {
    dispatch({ type: 'CHECK_IN' })
  }, [])

  const setMovementMode = useCallback((mode: MovementMode) => {
    dispatch({ type: 'SET_MOVEMENT_MODE', mode })
  }, [])

  const postMessage = useCallback((text: string, meta?: { author: string; authorLabel: string }) => {
    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: crypto.randomUUID(),
        author: meta?.author ?? 'user',
        authorLabel: meta?.authorLabel ?? '나',
        text,
        timestamp: stateRef.current.simMinutesElapsed,
      },
    })
  }, [])

  const resolveAlert = useCallback(() => {
    dispatch({ type: 'RESOLVE_ALERT' })
  }, [])

  const resetSession = useCallback(() => {
    dispatch({ type: 'RESET_SESSION' })
  }, [])

  const value = useMemo<TrackingContextValue>(
    () => ({
      ...state,
      addContact,
      updateContact,
      removeContact,
      startRoute,
      checkIn,
      setMovementMode,
      postMessage,
      resolveAlert,
      resetSession,
    }),
    [state, addContact, updateContact, removeContact, startRoute, checkIn, setMovementMode, postMessage, resolveAlert, resetSession],
  )

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>
}

export function useTracking() {
  const ctx = useContext(TrackingContext)
  if (!ctx) throw new Error('useTracking must be used within a TrackingProvider')
  return ctx
}
