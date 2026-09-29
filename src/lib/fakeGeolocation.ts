// 테스트용 가짜 GPS. navigator.geolocation을 감싸서, 조이스틱 모드가 켜져 있으면 실제 GPS 대신
// 조이스틱으로 움직인 위치를 돌려준다. 앱 코드는 평소처럼 navigator.geolocation만 쓰면 된다.
// 켜고 끄기는 계정 메뉴의 '조이스틱' 스위치, 상태는 localStorage에 저장한다.
import { useSyncExternalStore } from 'react'
import type { Coordinate } from '../types'

const ENABLED_KEY = 'crumbtrail.joystick'
const DEFAULT_POSITION: Coordinate = { lat: 37.5666, lng: 126.9784 } // 서울시청
// 실제 GPS처럼 가만히 있어도 주기적으로 위치를 보낸다(장시간 정지 판정이 GPS 콜백에서 일어나므로)
const IDLE_TICK_MS = 1000

interface Watcher {
  success: PositionCallback
  error?: PositionErrorCallback | null
  options?: PositionOptions
  realId: number | null
}

const real = typeof navigator !== 'undefined' ? navigator.geolocation : undefined
const watchers = new Map<number, Watcher>()
const listeners = new Set<(coord: Coordinate) => void>()
const toggleListeners = new Set<() => void>()
let nextId = 1
let position: Coordinate | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null

let enabled = (() => {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
})()

function toPosition(coord: Coordinate): GeolocationPosition {
  const coords = {
    latitude: coord.lat,
    longitude: coord.lng,
    accuracy: 5,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  }
  const timestamp = Date.now()
  return {
    coords: { ...coords, toJSON: () => coords },
    timestamp,
    toJSON: () => ({ coords, timestamp }),
  } as GeolocationPosition
}

// 조이스틱을 처음 켤 때는 실제 위치에서 시작한다. 못 받으면 서울시청.
function ensurePosition(): Promise<Coordinate> {
  if (position) return Promise.resolve(position)
  return new Promise((resolve) => {
    const done = (coord: Coordinate) => {
      position ??= coord
      resolve(position)
    }
    if (!real) return done(DEFAULT_POSITION)
    real.getCurrentPosition(
      (pos) => done({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => done(DEFAULT_POSITION),
      { timeout: 5000, maximumAge: 60000 },
    )
  })
}

function emit() {
  if (!position) return
  const pos = toPosition(position)
  watchers.forEach((w) => w.success(pos))
  listeners.forEach((listener) => listener(position!))
}

function startRealWatch(w: Watcher) {
  if (real && w.realId === null) w.realId = real.watchPosition(w.success, w.error, w.options)
}

function stopRealWatch(w: Watcher) {
  if (real && w.realId !== null) real.clearWatch(w.realId)
  w.realId = null
}

function syncTicker() {
  const shouldTick = enabled && watchers.size > 0
  if (shouldTick && !tickTimer) tickTimer = setInterval(emit, IDLE_TICK_MS)
  if (!shouldTick && tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

const fake: Geolocation = {
  getCurrentPosition(success, error, options) {
    if (!enabled) {
      if (real) real.getCurrentPosition(success, error, options)
      return
    }
    void ensurePosition().then((coord) => success(toPosition(coord)))
  },
  watchPosition(success, error, options) {
    const id = nextId++
    const w: Watcher = { success, error, options, realId: null }
    watchers.set(id, w)
    if (enabled) void ensurePosition().then(() => watchers.has(id) && success(toPosition(position!)))
    else startRealWatch(w)
    syncTicker()
    return id
  },
  clearWatch(id) {
    const w = watchers.get(id)
    if (!w) return
    stopRealWatch(w)
    watchers.delete(id)
    syncTicker()
  },
}

export function installFakeGeolocation() {
  if (!real) return
  Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true })
}

function subscribeToggle(listener: () => void) {
  toggleListeners.add(listener)
  return () => {
    toggleListeners.delete(listener)
  }
}

export function useJoystickEnabled() {
  return useSyncExternalStore(subscribeToggle, () => enabled)
}

export function setJoystickEnabled(next: boolean) {
  if (next === enabled) return
  enabled = next
  try {
    localStorage.setItem(ENABLED_KEY, next ? '1' : '0')
  } catch {
    // 저장 못 하면 새로고침 때 꺼질 뿐이다
  }
  // 이미 돌고 있는 추적(watchPosition)도 바로 전환한다
  watchers.forEach((w) => (next ? stopRealWatch(w) : startRealWatch(w)))
  syncTicker()
  toggleListeners.forEach((listener) => listener())
  if (next) void ensurePosition().then(emit)
}

// 동쪽으로 eastMeters, 북쪽으로 northMeters 만큼 옮기고 바로 알린다
export function moveBy(eastMeters: number, northMeters: number, notify = true) {
  if (!position) return
  const metersPerDegLat = 111320
  const metersPerDegLng = metersPerDegLat * Math.cos((position.lat * Math.PI) / 180)
  position = {
    lat: position.lat + northMeters / metersPerDegLat,
    lng: position.lng + eastMeters / metersPerDegLng,
  }
  if (notify) emit()
}

// 대기 화면처럼 watchPosition 없이 위치를 보여주는 곳에서 조이스틱 이동을 따라가기 위한 구독
export function onFakeMove(listener: (coord: Coordinate) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
