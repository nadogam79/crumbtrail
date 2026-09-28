import type { ReactNode } from 'react'

interface ModalProps {
  onClose: () => void
  children: ReactNode
  // 내용이 작은 모달은 넓은 화면에서 폭을 좁힌다
  compact?: boolean
}

export function Modal({ onClose, children, compact }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={compact ? 'modal-content modal-compact' : 'modal-content'} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
