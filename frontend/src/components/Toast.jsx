import { useState, useCallback, createContext, useContext, useEffect } from 'react'
import './Toast.css'

const ToastContext = createContext(null)

export function useToast() {
  return useContext(ToastContext)
}

let _id = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'success') => {
    const id = ++_id
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon">
              {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
