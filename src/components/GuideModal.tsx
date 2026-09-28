import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { GUIDE } from '../content/guide'
import { hideGuideForToday } from '../lib/guidePreference'
import { Modal } from './Modal'

// 이 거리 이상 끌어야 다음/이전 카드로 넘어간다
const SWIPE_THRESHOLD_PX = 50

export function GuideModal({ onClose }: { onClose: () => void }) {
  const [hideToday, setHideToday] = useState(false)
  const [index, setIndex] = useState(0)
  // 스와이프 중 손가락을 따라 움직인 거리. null이면 드래그 중이 아님
  const [dragX, setDragX] = useState<number | null>(null)
  const dragStart = useRef<{ x: number; y: number; id: number } | null>(null)

  const lastIndex = GUIDE.steps.length - 1
  const isLast = index === lastIndex

  const close = () => {
    if (hideToday) hideGuideForToday()
    onClose()
  }

  const goTo = (next: number) => setIndex(Math.max(0, Math.min(lastIndex, next)))

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(lastIndex, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lastIndex])

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current
    if (!start || start.id !== e.pointerId) return
    const dx = e.clientX - start.x
    // 세로 스크롤 의도면 가로 드래그로 잡지 않는다
    if (dragX === null && Math.abs(e.clientY - start.y) > Math.abs(dx)) {
      dragStart.current = null
      return
    }
    if (dragX === null) e.currentTarget.setPointerCapture(e.pointerId)
    // 양 끝에서는 저항감을 줘서 더 넘어갈 수 없음을 알린다
    const atEdge = (index === 0 && dx > 0) || (isLast && dx < 0)
    setDragX(atEdge ? dx / 3 : dx)
  }

  const handlePointerEnd = () => {
    if (dragX !== null) {
      if (dragX <= -SWIPE_THRESHOLD_PX) goTo(index + 1)
      else if (dragX >= SWIPE_THRESHOLD_PX) goTo(index - 1)
    }
    dragStart.current = null
    setDragX(null)
  }

  const trackStyle: CSSProperties = {
    transform: `translateX(calc(${-index * 100}% + ${dragX ?? 0}px))`,
    transition: dragX === null ? undefined : 'none',
  }

  return (
    <Modal onClose={close} compact>
      <div className="guide">
        <div className="guide-head">
          <span className="guide-eyebrow">{GUIDE.title}</span>
          <p className="guide-intro">{GUIDE.intro}</p>
        </div>

        <div
          className="guide-viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <ol className="guide-track" style={trackStyle}>
            {GUIDE.steps.map((step, i) => (
              <li key={step.title} className="guide-card" aria-hidden={i !== index}>
                <div className="guide-card-box">
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                  {i === lastIndex && GUIDE.note && <p className="guide-note">{GUIDE.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="guide-controls">
          <button type="button" className="btn btn-secondary" onClick={() => goTo(index - 1)} disabled={index === 0}>
            이전
          </button>
          <div className="guide-dots" role="tablist">
            {GUIDE.steps.map((step, i) => (
              <button
                key={step.title}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1}단계: ${step.title}`}
                className={i === index ? 'guide-dot active' : 'guide-dot'}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
          {isLast ? (
            <button type="button" className="btn btn-primary" onClick={close}>
              시작하기
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => goTo(index + 1)}>
              다음
            </button>
          )}
        </div>

        <div className="guide-footer">
          <label className="guide-hide">
            <input type="checkbox" checked={hideToday} onChange={(e) => setHideToday(e.target.checked)} />
            오늘 하루 보지 않기
          </label>
          <button type="button" className="btn-text" onClick={close}>
            닫기
          </button>
        </div>
      </div>
    </Modal>
  )
}
