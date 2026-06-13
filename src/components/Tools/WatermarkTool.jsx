import { useState, useRef, useCallback, useEffect } from 'react'
import { Droplets, Download } from 'lucide-react'
import FileDropZone from '../Common/FileDropZone'
import ProgressBar from '../Common/ProgressBar'
import PageNavigator from '../Common/PageNavigator'
import { useAppStore } from '../../store/appStore'
import { readFileAsArrayBuffer, parsePageRanges } from '../../utils/fileHelpers'
import { downloadBlob } from '../../utils/download'
import * as pdfEngine from '../../engine/pdfEngine'
import * as pdfRenderer from '../../engine/pdfRenderer'

export default function WatermarkTool() {
  const { addToast } = useAppStore()
  const [pdfBytes, setPdfBytes] = useState(null)
  const [fileName, setFileName] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)

  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL')
  const [wmFontSize, setWmFontSize] = useState(60)
  const [wmOpacity, setWmOpacity] = useState(0.15)
  const [wmRotation, setWmRotation] = useState(-45)
  const [wmColor, setWmColor] = useState('#808080')
  const [wmX, setWmX] = useState(50)
  const [wmY, setWmY] = useState(50)
  const [applyMode, setApplyMode] = useState('all')
  const [pageRange, setPageRange] = useState('')
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

  const drawWatermarkPreview = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!watermarkText) return

    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)
    const { width, height, scale } = pageDims.current
    ctx.globalAlpha = wmOpacity
    ctx.fillStyle = wmColor
    ctx.font = `700 ${wmFontSize * scale}px Helvetica, Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.translate(width * wmX / 100, height * wmY / 100)
    ctx.rotate((wmRotation * Math.PI) / 180)
    ctx.fillText(watermarkText, 0, 0)
    ctx.restore()
  }, [watermarkText, wmFontSize, wmOpacity, wmRotation, wmColor, wmX, wmY])

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
        if (cancelled) return
        pageDims.current = { ...dims, scale: renderScale }
        if (overlayRef.current) {
          const dpr = window.devicePixelRatio || 1
          overlayRef.current.width = dims.width * dpr
          overlayRef.current.height = dims.height * dpr
          overlayRef.current.style.width = `${dims.width}px`
          overlayRef.current.style.height = `${dims.height}px`
        }
        drawWatermarkPreview()
      } catch (err) {
        if (cancelled || /Rendering cancelled/i.test(err?.message || '')) return
        addToast({ type: 'error', message: `Render failed: ${err.message}` })
      }
    }

    render()
    return () => {
      cancelled = true
    }
  }, [pdfBytes, currentPage, drawWatermarkPreview, maxPageWidth, addToast])

  useEffect(() => {
    drawWatermarkPreview()
  }, [drawWatermarkPreview])

  const hexToRgbNorm = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
    } : { r: 0.5, g: 0.5, b: 0.5 }
  }

  const handleApply = async () => {
    if (!pdfBytes || !watermarkText) return
    try {
      setProcessing(true)
      let pages = null
      if (applyMode === 'range' && pageRange.trim()) {
        pages = parsePageRanges(pageRange, pageCount)
      }

      const result = await pdfEngine.addWatermark(pdfBytes, {
        text: watermarkText,
        fontSize: wmFontSize,
        opacity: wmOpacity,
        rotation: wmRotation,
        color: hexToRgbNorm(wmColor),
        pages,
        xPercent: wmX,
        yPercent: wmY,
      })

      const outName = fileName.replace('.pdf', '_watermarked.pdf')
      downloadBlob(result, outName)
      addToast({ type: 'success', message: 'Watermarked PDF downloaded!' })
    } catch (err) {
      addToast({ type: 'error', message: `Watermark failed: ${err.message}` })
    } finally {
      setProcessing(false)
    }
  }

  if (!pdfBytes) {
    return (
      <div id="watermark-tool">
        <FileDropZone onFiles={handleFile} accept=".pdf" multiple={false} label="Drop your PDF here" id="watermark-dropzone" />
        {loading && <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>}
      </div>
    )
  }

  return (
    <div id="watermark-tool">
      <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div className="card" style={{ flex: '0 0 340px' }}>
          <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
            <Droplets size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Watermark Settings
          </h3>

          <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="input-label">Text</label>
            <input className="input" value={watermarkText} onChange={e => setWatermarkText(e.target.value)} placeholder="Watermark text" id="wm-text" />
          </div>

          <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="input-label">Font Size: {wmFontSize}px</label>
            <input type="range" min="12" max="280" value={wmFontSize} onChange={e => setWmFontSize(Number(e.target.value))} style={{ width: '100%' }} id="wm-fontsize" />
          </div>

          <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="input-label">Opacity: {Math.round(wmOpacity * 100)}%</label>
            <input type="range" min="0.01" max="1" step="0.01" value={wmOpacity} onChange={e => setWmOpacity(Number(e.target.value))} style={{ width: '100%' }} id="wm-opacity" />
          </div>

          <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="input-label">Rotation: {wmRotation}°</label>
            <input type="range" min="-180" max="180" value={wmRotation} onChange={e => setWmRotation(Number(e.target.value))} style={{ width: '100%' }} id="wm-rotation" />
          </div>

          <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="input-label">Horizontal Position: {wmX}%</label>
            <input type="range" min="0" max="100" value={wmX} onChange={e => setWmX(Number(e.target.value))} style={{ width: '100%' }} id="wm-x" />
          </div>

          <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="input-label">Vertical Position: {wmY}%</label>
            <input type="range" min="0" max="100" value={wmY} onChange={e => setWmY(Number(e.target.value))} style={{ width: '100%' }} id="wm-y" />
          </div>

          <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="input-label">Color</label>
            <input
              type="color"
              value={wmColor}
              onChange={e => setWmColor(e.target.value)}
              style={{ width: '100%', height: 36, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
              id="wm-color"
            />
          </div>

          <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="input-label">Apply to</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className={`btn btn-sm ${applyMode === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setApplyMode('all')}>All Pages</button>
              <button className={`btn btn-sm ${applyMode === 'range' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setApplyMode('range')}>Select Pages</button>
            </div>
          </div>

          {applyMode === 'range' && (
            <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
              <label className="input-label">Pages (e.g. 1-3, 5)</label>
              <input className="input" value={pageRange} onChange={e => setPageRange(e.target.value)} placeholder="1-3, 5, 7" id="wm-pages" />
            </div>
          )}

          {processing && <ProgressBar progress={80} message="Applying watermark..." />}

          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleApply} disabled={processing || !watermarkText} id="wm-apply">
            {processing ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <Download size={16} />}
            Apply & Download
          </button>
        </div>

        <div style={{ flex: '1 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {fileName} - {pageCount} page{pageCount === 1 ? '' : 's'}
            </div>
            <PageNavigator currentPage={currentPage} pageCount={pageCount} onChange={setCurrentPage} compact idPrefix="watermark-page" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div className="pdf-preview-container">
              <div className="pdf-preview-wrapper" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
                <canvas ref={canvasRef} style={{ display: 'block' }} />
                <canvas ref={overlayRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  bottom: 10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(17, 24, 39, 0.8)',
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--text-xs)',
                  color: '#ffffff',
                }}>
                  Preview - Page {currentPage}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
