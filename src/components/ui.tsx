import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Icon, PieMark } from './Icon'

/* ---------- top bar ---------- */

interface TopBarProps {
  back?: boolean | string
  title?: string
  right?: ReactNode
  wordmark?: boolean
}

export function TopBar({ back, title, right, wordmark }: TopBarProps) {
  const nav = useNavigate()
  return (
    <div className="topbar pad">
      {back ? (
        <button
          type="button"
          className="icon-btn"
          aria-label="back"
          onClick={() => (typeof back === 'string' ? nav(back) : window.history.length > 1 ? nav(-1) : nav('/'))}
        >
          <Icon name="back" />
        </button>
      ) : wordmark ? (
        <span className="row gap-8">
          <PieMark />
          <span className="wordmark">pie</span>
        </span>
      ) : (
        <span style={{ width: 40 }} />
      )}
      {title ? <div className="mid">{title}</div> : <div className="mid" />}
      {right ?? <span style={{ width: 40 }} />}
    </div>
  )
}

/* ---------- sheet ---------- */

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title ?? 'sheet'}>
        <div className="sheet-inner">
          <div className="sheet-handle" />
          {title && (
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 className="h2">{title}</h2>
              <button type="button" className="icon-btn" aria-label="close" onClick={onClose}>
                <Icon name="x" />
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </>,
    document.body,
  )
}

/* ---------- toast ---------- */

interface ToastCtx {
  toast: (text: string, icon?: string) => void
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<{ text: string; icon?: string; key: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const toast = useCallback((text: string, icon?: string) => {
    window.clearTimeout(timer.current)
    setItem({ text, icon, key: Date.now() })
    timer.current = window.setTimeout(() => setItem(null), 2600)
  }, [])
  const value = useMemo(() => ({ toast }), [toast])
  return (
    <ToastContext.Provider value={value}>
      {children}
      {item && (
        <div className="toast-wrap" aria-live="polite">
          <div className="toast" key={item.key}>
            {item.icon && <Icon name={item.icon} size={16} strokeWidth={2.4} />}
            {item.text}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext).toast
}

/* ---------- small bits ---------- */

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
  )
}

export function Checkbox({ on }: { on: boolean }) {
  return (
    <span className={`check ${on ? 'on' : ''}`} aria-hidden="true">
      <Icon name="check" size={14} strokeWidth={3} />
    </span>
  )
}

export function Sparks({ count = 14 }: { count?: number }) {
  const items = Array.from({ length: count }, (_, i) => ({
    deg: Math.round(i * (360 / count) + (i % 2 ? 9 : -6)),
    size: i % 3 === 0 ? 8 : 5,
    color: i % 4 === 0 ? '#FFF8E7' : '#D0F08B',
    delay: (i % 3) * 40,
  }))
  return (
    <div className="sparks" aria-hidden="true">
      {items.map((s, i) => (
        <span key={i} className="spark" style={{ transform: `rotate(${s.deg}deg)` }}>
          <i style={{ width: s.size, height: s.size, background: s.color, animationDelay: `${s.delay}ms` }} />
        </span>
      ))}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
      <span className="eyebrow">{children}</span>
      {right}
    </div>
  )
}
