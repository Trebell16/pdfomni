import { X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

export default function ToastContainer() {
  const { toasts, removeToast } = useAppStore()

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" id="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type || 'info'}`}>
          <div style={{ flex: 1 }}>
            {toast.title && (
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '2px' }}>
                {toast.title}
              </div>
            )}
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              {toast.message}
            </div>
          </div>
          <button
            className="modal-close"
            onClick={() => removeToast(toast.id)}
            style={{ flexShrink: 0 }}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
