import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// window.confirm 대신 쓰는 앱 자체 확인창. `if (!(await confirm({...}))) return` 처럼 쓴다.
export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  // 되돌리기 어려운 동작(삭제, 중단 등)은 확인 버튼을 빨갛게
  danger?: boolean
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>(
    (next) =>
      new Promise((resolve) => {
        // 이미 떠 있는 확인창이 있으면 취소로 닫고 새 것을 띄운다
        resolveRef.current?.(false)
        resolveRef.current = resolve
        setOptions(next)
      }),
    [],
  )

  const close = useCallback((ok: boolean) => {
    resolveRef.current?.(ok)
    resolveRef.current = null
    setOptions(null)
  }, [])

  useEffect(() => {
    if (!options) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [options, close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div className="confirm-overlay" onClick={() => close(false)}>
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <strong id="confirm-title" className="confirm-title">
              {options.title}
            </strong>
            {options.message && <p className="confirm-message">{options.message}</p>}
            <div className="confirm-actions">
              <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
                {options.cancelLabel ?? '취소'}
              </button>
              <button
                type="button"
                className={`btn ${options.danger ? 'btn-danger-solid' : 'btn-primary'}`}
                onClick={() => close(true)}
                autoFocus
              >
                {options.confirmLabel ?? '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm must be used within ConfirmProvider')
  return confirm
}
