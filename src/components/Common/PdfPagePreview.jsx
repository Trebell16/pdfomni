import { useEffect, useRef, useState } from 'react'
import { renderPageToCanvas } from '../../engine/pdfRenderer'

export default function PdfPagePreview({ pdfBytes, pageNum, scale = 1.8, id }) {
  const canvasRef = useRef(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!pdfBytes || !canvasRef.current) return
    let cancelled = false
    setLoading(true)
    setError('')

    renderPageToCanvas(pdfBytes, pageNum, canvasRef.current, scale)
      .then(() => {
        if (!cancelled) setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [pdfBytes, pageNum, scale])

  return (
    <div className="pdf-page-preview" id={id}>
      {loading && (
        <div className="pdf-page-preview-status">
          <div className="spinner" />
        </div>
      )}
      {error && <div className="pdf-page-preview-status">Preview failed</div>}
      <canvas ref={canvasRef} style={{ display: error ? 'none' : 'block' }} />
      <div className="pdf-page-preview-label">Page {pageNum}</div>
    </div>
  )
}
