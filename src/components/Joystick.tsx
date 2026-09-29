import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { moveBy } from '../lib/fakeGeolocation'

// 테스트용 조이스틱. 누르고 끄는 방향으로, 끈 거리에 비례한 속도로 가짜 GPS 위치를 옮긴다.
const RADIUS = 44
// 이동 중 위치를 알리는 간격. 매 프레임 보내면 breadcrumb이 너무 많이 쌓인다.
const EMIT_INTERVAL_MS = 300
const SPEEDS = [
  { label: '걷기', mps: 1.4 },
  { label: '뛰기', mps: 5 },
  { label: '빠르게', mps: 30 },
]

export function Joystick() {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const [speedIndex, setSpeedIndex] = useState(1)
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef(knob)
  const dragging = knob.x !== 0 || knob.y !== 0
  const speed = SPEEDS[speedIndex].mps

  // 끄는 동안 매 프레임 위치를 옮기고, 일정 간격으로만 앱에 알린다
  useEffect(() => {
    if (!dragging) return
    let frame = 0
    let last = performance.now()
    let lastEmit = 0
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const { x, y } = knobRef.current
      const shouldEmit = now - lastEmit >= EMIT_INTERVAL_MS
      if (shouldEmit) lastEmit = now
      // 화면 y는 아래가 +라서 북쪽은 -y
      moveBy((x / RADIUS) * speed * dt, (-y / RADIUS) * speed * dt, shouldEmit)
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [dragging, speed])

  const updateKnob = (e: PointerEvent) => {
    const rect = baseRef.current!.getBoundingClientRect()
    let x = e.clientX - (rect.left + rect.width / 2)
    let y = e.clientY - (rect.top + rect.height / 2)
    const dist = Math.hypot(x, y)
    if (dist > RADIUS) {
      x = (x / dist) * RADIUS
      y = (y / dist) * RADIUS
    }
    knobRef.current = { x, y }
    setKnob({ x, y })
  }

  const release = () => {
    knobRef.current = { x: 0, y: 0 }
    setKnob({ x: 0, y: 0 })
    moveBy(0, 0) // 놓은 자리를 바로 알린다
  }

  return (
    <div className="joystick">
      <div
        ref={baseRef}
        className="joystick-base"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          updateKnob(e)
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && updateKnob(e)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <button
        type="button"
        className="joystick-speed"
        onClick={() => setSpeedIndex((i) => (i + 1) % SPEEDS.length)}
        title="이동 속도 바꾸기"
      >
        {SPEEDS[speedIndex].label} {speed}m/s
      </button>
    </div>
  )
}
