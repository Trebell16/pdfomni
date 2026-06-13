import { useState, useRef, useCallback, useEffect } from 'react'
import { ShieldOff, Download, Trash2, Undo2 } from 'lucide-react'
import FileDropZone from '../Common/FileDropZone'
import ProgressBar from '../Common/ProgressBar'
import PageNavigator from '../Common/PageNavigator'
import { useAppStore } from '../../store/appStore'
import { readFileAsArrayBuffer } from '../../utils/fileHelpers'
import { downloadBlob } from '../../utils/download'
import * as pdfEngine from '../../engine/pdfEngine'
import * as pdfRenderer from '../../engine/pdfRenderer'

export default function RedactTool() {
  const { addToast } = useAppStore()
  const [pdfBytes, setPdfBytes] = useState(null)
  const [fileName, setFileName] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [redactions, setRedactions] = useState([]) // { page, x, y, w, h }
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState(null)
  const [maxPageWidth, setMaxPageWidth] = useState(595)

  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const pageDims = useRef({ width: 0, height: 0, scale: 1.5 })

  const handleFile = useCallback(async (files) => {
    const file = files[0]
    if (!file) return
    try {
      setLoading(true)
      const bytes = await readFileAsArrayBuffer(file)
      setPdfBytes(bytes)
      setFileName(file.name)
      const count = await pdfRenderer.getPageCount(bytes)
      setPageCount(count)
      setCurrentPage(1)
      setRedactions([])
      const info = await pdfEngine.getPDFInfo(bytes)
      if (info.pages.length > 0) {
        const maxWidth = Math.max(...info.pages.map(p => p.width))
        setMaxPageWidth(maxWidth)
      }
    } catch (err) {
      addToast({ type: 'error', message: `Failed to load PDF: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    if (!pdfBytes || !canvasRef.current) return
    let cancelled = false
    const render = async () => {
      try {
        const container = canvasRef.current.closest('.pdf-preview-container') || canvasRef.current.parentElement
        const containerWidth = container ? container.offsetWidth : 800
        const displayWidth = Math.max(300, containerWidth - 32)
        const renderScale = Math.min(2.2, displayWidth / maxPageWidth)

        const dims = await pdfRenderer.renderPageToCanvas(pdfBytes, currentPage, canvasRef.current, renderScale)
        if (cancelled || !dims) return
        pageDims.current = { ...dims, scale: renderScale }
        if (overlayRef.current) {
          const dpr = window.devicePixelRatio || 1
          overlayRef.current.width = dims.width * dpr
          overlayRef.current.height = dims.height * dpr
          overlayRef.current.style.width = `${dims.width}px`
          overlayRef.current.style.height = `${dims.height}px`
        }
        redrawOverlay()
      } catch (err) {
        if (cancelled || /Rendering cancelled/i.test(err?.message || '')) return
        addToast({ type: 'error', message: `Render failed: ${err.message}` })
      }
    }
    render()
    return () => { cancelled = true }
  }, [pdfBytes, currentPage, maxPageWidth])

  const redrawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)
    const pageRedactions = redactions.filter(r => r.page === currentPage)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2
    for (const r of pageRedactions) {
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeRect(r.x, r.y, r.w, r.h)
    }
    ctx.restore()
  }, [redactions, currentPage])

  useEffect(() => {
    redrawOverlay()
  }, [redactions, currentPage, redrawOverlay])

  const getCanvasCoords = (e) => {
    const rect = overlayRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseDown = (e) => {
    const coords = getCanvasCoords(e)
    setIsDrawing(true)
    setDrawStart(coords)
  }

  const handleMouseMove = (e) => {
    if (!isDrawing || !drawStart) return
    const coords = getCanvasCoords(e)
    const ctx = overlayRef.current.getContext('2d')
    ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
    redrawOverlay()
    
    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)
    // Preview
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    const w = coords.x - drawStart.x
    const h = coords.y - drawStart.y
    ctx.fillRect(drawStart.x, drawStart.y, w, h)
    ctx.strokeRect(drawStart.x, drawStart.y, w, h)
    ctx.setLineDash([])
    ctx.restore()
  }

  const handleMouseUp = (e) => {
    if (!isDrawing || !drawStart) return
    const coords = getCanvasCoords(e)
    setIsDrawing(false)
    const w = coords.x - drawStart.x
    const h = coords.y - drawStart.y
    if (Math.abs(w) > 5 && Math.abs(h) > 5) {
      setRedactions(prev => [...prev, {
        page: currentPage,
        x: Math.min(drawStart.x, coords.x),
        y: Math.min(drawStart.y, coords.y),
        w: Math.abs(w),
        h: Math.abs(h),
      }])
    }
    setDrawStart(null)
  }

  const handleUndo = () => {
    setRedactions(prev => {
      const pageReds = prev.filter(r => r.page === currentPage)
      if (pageReds.length === 0) return prev
      const last = pageReds[pageReds.length - 1]
      return prev.filter(r => r !== last)
    })
  }

  const handleClear = () => {
    setRedactions(prev => prev.filter(r => r.page !== currentPage))
  }

  const handleApply = async () => {
    if (!pdfBytes || redactions.length === 0) return
    try {
      setProcessing(true)
      const scale = pageDims.current.scale
      const info = await pdfEngine.getPDFInfo(pdfBytes)
      const mapped = redactions.map((r) => {
        const pageInfo = info.pages[r.page - 1]
        return {
          pageIndex: r.page - 1,
          x: r.x / scale,
          y: pageInfo.height - ((r.y + r.h) / scale),
          width: r.w / scale,
          height: r.h / scale,
        }
      })

      const currentPdfBytes = await pdfEngine.redactPDF(pdfBytes, mapped)

      const outName = fileName.replace('.pdf', '_redacted.pdf')
      downloadBlob(currentPdfBytes, outName)
      addToast({ type: 'success', message: 'Redacted PDF downloaded!' })
    } catch (err) {
      addToast({ type: 'error', message: `Redaction failed: ${err.message}` })
    } finally {
      setProcessing(false)
    }
  }

  if (!pdfBytes) {
    return (
      <div id="redact-tool" className="animate-fade-in-up">
        <FileDropZone onFiles={handleFile} accept=".pdf" multiple={false} label="Drop your PDF here" id="redact-dropzone" />
        {loading && <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>}
      </div>
    )
  }

  const totalRedactions = redactions.length
  const pageRedactions = redactions.filter(r => r.page === currentPage).length

  return (
    <div id="redact-tool" className="animate-fade-in-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {fileName} - {pageCount} page{pageCount === 1 ? '' : 's'}
        </div>
        <PageNavigator currentPage={currentPage} pageCount={pageCount} onChange={setCurrentPage} compact idPrefix="redact-page" />
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          <ShieldOff size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> {pageRedactions} on this page • {totalRedactions} total
        </span>
        <button className="btn btn-ghost btn-sm" onClick={handleUndo} disabled={pageRedactions === 0} id="redact-undo">
          <Undo2 size={14} /> Undo
        </button>
        <button className="btn btn-danger btn-sm" onClick={handleClear} disabled={pageRedactions === 0} id="redact-clear">
          <Trash2 size={14} /> Clear Page
        </button>
        <button className="btn btn-primary" onClick={handleApply} disabled={processing || totalRedactions === 0} id="redact-apply">
          {processing ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Download size={14} />}
          Apply Redaction & Download
        </button>
      </div>

      <div className="pdf-preview-container">
        <div className="pdf-preview-wrapper" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
          <canvas ref={canvasRef} style={{ display: 'block' }} />
          <canvas
            ref={overlayRef}
            style={{ position: 'absolute', top: 0, left: 0, cursor: 'crosshair' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { if (isDrawing) setIsDrawing(false) }}
          />
        </div>
      </div>
    </div>
  )
}
