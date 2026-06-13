import { useEffect, useRef, useState } from 'react'
import { generateThumbnail } from '../../engine/pdfRenderer'

export default function PageThumbnail({ 
  pdfBytes, 
  pageNum, 
  selected = false,
  onClick,
  label,
  showLabel = true,
  maxWidth = 160,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  overlay,
  rotation = 0,
  id,
}) {
  const [thumbUrl, setThumbUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [shouldLoad, setShouldLoad] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting)
        setShouldLoad(visible)
        if (!visible) setThumbUrl(null)
      },
      { rootMargin: '220px' }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!pdfBytes || !shouldLoad) return
    let cancelled = false
    setLoading(true)
    
    generateThumbnail(pdfBytes, pageNum, maxWidth)
      .then(url => {
        if (!cancelled) {
          setThumbUrl(url)
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error(`Thumbnail render failed for page ${pageNum}:`, err)
        if (!cancelled) {
          setThumbUrl(null)
          setLoading(false)
        }
      })
    
    return () => { cancelled = true }
  }, [pdfBytes, pageNum, maxWidth, shouldLoad])

  return (
    <div
      ref={containerRef}
      className={`thumbnail ${selected ? 'selected' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      id={id}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        outline: selected ? '2px solid var(--color-accent)' : 'none',
        outlineOffset: '2px',
        maxWidth: `${maxWidth}px`,
        width: '100%',
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {loading ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'var(--color-bg-tertiary)',
        }}>
          <div className="spinner" />
        </div>
      ) : thumbUrl ? (
        <img 
          src={thumbUrl} 
          alt={`Page ${pageNum}`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            transition: 'transform var(--transition-fast)',
          }}
        />
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-xs)',
        }}>
          Failed
        </div>
      )}
      
      {overlay}
      
      {showLabel && (
        <div className="thumbnail-label">
          {label || `Page ${pageNum}`}
        </div>
      )}
    </div>
  )
}
