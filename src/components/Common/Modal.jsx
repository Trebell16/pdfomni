import { X } from 'lucide-react'

export default function Modal({ isOpen, onClose, title, children, footer, maxWidth = 520 }) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose} id="modal-overlay">
      <div
        className="modal"
        style={{ maxWidth }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
