/* eslint-disable react-refresh/only-export-components -- provider and hook are intentionally co-located */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const icons = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info,
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())
  const counter = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    ({ type = 'info', title, message, duration = 4800 }) => {
      counter.current += 1
      const id = counter.current
      setToasts((current) => [...current.slice(-4), { id, type, title, message }])
      const timer = setTimeout(() => dismiss(id), duration)
      timers.current.set(id, timer)
      return id
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      push,
      success: (title, message) => push({ type: 'success', title, message }),
      error: (title, message) => push({ type: 'error', title, message }),
      info: (title, message) => push({ type: 'info', title, message }),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = icons[toast.type] || Info
          return (
            <div
              key={toast.id}
              className={`toast toast--${toast.type}`}
              role={toast.type === 'error' ? 'alert' : 'status'}
            >
              <Icon size={17} className="toast__icon" aria-hidden="true" />
              <div className="grow">
                <div className="toast__title">{toast.title}</div>
                {toast.message ? <div className="toast__message">{toast.message}</div> : null}
              </div>
              <button
                type="button"
                className="toast__close"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
