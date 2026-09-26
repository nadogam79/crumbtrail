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
import { distanceMeters, distanceToRouteMeters } from '../lib/geo'

const STILL_EPSILON_METERS = 5

interface TrackingState {
  status: SessionStatus
  route: RouteSettings | null
  simMinutesElapsed: number
  breadcrumbs: Breadcrumb[]
  lastCheckInMinute: number | null
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

  // Deadman-switch engine: on every real GPS fix, record it as a breadcrumb and
  // evaluate the four anomaly conditions from CLAUDE.md against real elapsed time.
  useEffect(() => {
    if (state.status !== 'active') return
    if (!navigator.geolocation) return

    const startedAt = Date.now()
    let lastMovedAtMinute = 0

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const current = stateRef.current
        const route = current.route
        if (!route || current.status !== 'active') return

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

        const stillMinutes = elapsed - lastMovedAtMinute

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
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
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
      postMessage,
      resolveAlert,
      resetSession,
    }),
    [state, addContact, updateContact, removeContact, startRoute, checkIn, postMessage, resolveAlert, resetSession],
  )

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>
}

export function useTracking() {
  const ctx = useContext(TrackingContext)
  if (!ctx) throw new Error('useTracking must be used within a TrackingProvider')
  return ctx
}
