import { useState, useRef, useCallback, useEffect } from 'react'
import { Crop, Download, RotateCcw } from 'lucide-react'
import FileDropZone from '../Common/FileDropZone'
import ProgressBar from '../Common/ProgressBar'
import PageNavigator from '../Common/PageNavigator'
import { useAppStore } from '../../store/appStore'
import { readFileAsArrayBuffer } from '../../utils/fileHelpers'
import { downloadBlob } from '../../utils/download'
import * as pdfEngine from '../../engine/pdfEngine'
import * as pdfRenderer from '../../engine/pdfRenderer'

export default function CropTool() {
  const { addToast } = useAppStore()
  const [pdfBytes, setPdfBytes] = useState(null)
  const [fileName, setFileName] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [applyToAll, setApplyToAll] = useState(true)
  const [maxPageWidth, setMaxPageWidth] = useState(595)

  // Crop box in PDF coordinates
  const [cropX, setCropX] = useState(0)
  const [cropY, setCropY] = useState(0)
  const [cropW, setCropW] = useState(0)
  const [cropH, setCropH] = useState(0)
  const [pageCropBoxes, setPageCropBoxes] = useState({})

  // Visual dragging
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragMode, setDragMode] = useState('draw')

  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const pageDims = useRef({ width: 0, height: 0, scale: 1.5 })
  const pageSize = useRef({ pdfW: 0, pdfH: 0 })

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
        const p = info.pages[0]
        pageSize.current = { pdfW: p.width, pdfH: p.height }
        setCropX(0)
        setCropY(0)
        setCropW(Math.round(p.width))
        setCropH(Math.round(p.height))
        setPageCropBoxes({})
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
        let previewCrop = { x: cropX, y: cropY, width: cropW, height: cropH }
        if (!applyToAll) {
          const saved = pageCropBoxes[currentPage]
          if (saved) {
            previewCrop = saved
            setCropX(saved.x)
            setCropY(saved.y)
            setCropW(saved.width)
            setCropH(saved.height)
          }
        }

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
        const info = await pdfEngine.getPDFInfo(pdfBytes)
        if (info.pages[currentPage - 1]) {
          const p = info.pages[currentPage - 1]
          pageSize.current = { pdfW: p.width, pdfH: p.height }
          if (!applyToAll && !pageCropBoxes[currentPage]) {
            previewCrop = { x: 0, y: 0, width: Math.round(p.width), height: Math.round(p.height) }
            setCropX(previewCrop.x)
            setCropY(previewCrop.y)
            setCropW(previewCrop.width)
            setCropH(previewCrop.height)
          }
        }
        requestAnimationFrame(() => redrawOverlayWithBox(previewCrop))
      } catch (err) {
        if (cancelled || /Rendering cancelled/i.test(err?.message || '')) return
        addToast({ type: 'error', message: `Render failed: ${err.message}` })
      }
    }
    render()
    return () => { cancelled = true }
  }, [pdfBytes, currentPage, maxPageWidth])

  const setCropBox = useCallback((box) => {
    const next = {
      x: Math.round(Math.max(0, box.x)),
      y: Math.round(Math.max(0, box.y)),
      width: Math.round(Math.max(10, box.width)),
      height: Math.round(Math.max(10, box.height)),
    }
    setCropX(next.x)
    setCropY(next.y)
    setCropW(next.width)
    setCropH(next.height)
    if (!applyToAll) {
      setPageCropBoxes(prev => ({ ...prev, [currentPage]: next }))
    }
  }, [applyToAll, currentPage])

  useEffect(() => {
    if (!pdfBytes || applyToAll) return
    const saved = pageCropBoxes[currentPage]
    if (saved) {
      setCropX(saved.x)
      setCropY(saved.y)
      setCropW(saved.width)
      setCropH(saved.height)
    } else if (pageSize.current.pdfW && pageSize.current.pdfH) {
      setCropX(0)
      setCropY(0)
      setCropW(Math.round(pageSize.current.pdfW))
      setCropH(Math.round(pageSize.current.pdfH))
    }
  }, [currentPage, applyToAll, pdfBytes])

  const redrawOverlayWithBox = useCallback((box) => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height, scale } = pageDims.current
    const dpr = window.devicePixelRatio || 1

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    // Dim areas outside crop
    const activeBox = box || { x: cropX, y: cropY, width: cropW, height: cropH }
    const cx = activeBox.x * scale
    const cy = (pageSize.current.pdfH - activeBox.y - activeBox.height) * scale
    const cw = activeBox.width * scale
    const ch = activeBox.height * scale

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(0, 0, width, height)
    ctx.clearRect(cx, cy, cw, ch)

    // Crop border
    ctx.strokeStyle = '#a855f7'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.strokeRect(cx, cy, cw, ch)
    ctx.setLineDash([])

    // Corner handles
    ctx.fillStyle = '#a855f7'
    const handles = [
      [cx, cy], [cx + cw, cy],
      [cx, cy + ch], [cx + cw, cy + ch],
    ]
    for (const [hx, hy] of handles) {
      ctx.fillRect(hx - 4, hy - 4, 8, 8)
    }
    ctx.restore()
  }, [cropX, cropY, cropW, cropH])

  useEffect(() => {
    redrawOverlayWithBox()
  }, [cropX, cropY, cropW, cropH, redrawOverlayWithBox])

  const getCanvasCoords = (e) => {
    const rect = overlayRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const hitTestCrop = (coords) => {
    const { scale } = pageDims.current
    const cx = cropX * scale
    const cy = (pageSize.current.pdfH - cropY - cropH) * scale
    const cw = cropW * scale
    const ch = cropH * scale
    const isFullPageCrop =
      Math.abs(cropX) < 1 &&
      Math.abs(cropY) < 1 &&
      Math.abs(cropW - pageSize.current.pdfW) < 2 &&
      Math.abs(cropH - pageSize.current.pdfH) < 2
    const handles = [
      ['nw', cx, cy],
      ['ne', cx + cw, cy],
      ['sw', cx, cy + ch],
      ['se', cx + cw, cy + ch],
    ]
    for (const [name, hx, hy] of handles) {
      if (Math.abs(coords.x - hx) <= 10 && Math.abs(coords.y - hy) <= 10) return name
    }
    if (isFullPageCrop) return 'draw'
    if (coords.x >= cx && coords.x <= cx + cw && coords.y >= cy && coords.y <= cy + ch) return 'move'
    return 'draw'
  }

  const handleMouseDown = (e) => {
    const coords = getCanvasCoords(e)
    const mode = hitTestCrop(coords)
    setIsDragging(true)
    setDragMode(mode)
    setDragStart({
      ...coords,
      crop: { x: cropX, y: cropY, width: cropW, height: cropH },
    })
  }

  const handleMouseMove = (e) => {
    if (!isDragging || !dragStart) return
    const coords = getCanvasCoords(e)
    const { scale } = pageDims.current
    const { pdfW, pdfH } = pageSize.current
    const dx = (coords.x - dragStart.x) / scale
    const dy = (coords.y - dragStart.y) / scale
    const start = dragStart.crop

    if (dragMode === 'move') {
      setCropBox({
        ...start,
        x: Math.min(Math.max(0, start.x + dx), Math.max(0, pdfW - start.width)),
        y: Math.min(Math.max(0, start.y - dy), Math.max(0, pdfH - start.height)),
      })
      return
    }

    if (dragMode !== 'draw') {
      let x = start.x
      let y = start.y
      let width = start.width
      let height = start.height
      if (dragMode.includes('e')) width = Math.min(pdfW - x, Math.max(10, start.width + dx))
      if (dragMode.includes('w')) {
        const nextX = Math.max(0, Math.min(start.x + dx, start.x + start.width - 10))
        width = start.x + start.width - nextX
        x = nextX
      }
      if (dragMode.includes('n')) {
        height = Math.min(pdfH - y, Math.max(10, start.height - dy))
      }
      if (dragMode.includes('s')) {
        const nextY = Math.max(0, Math.min(start.y - dy, start.y + start.height - 10))
        height = start.y + start.height - nextY
        y = nextY
      }
      setCropBox({ x, y, width, height })
      return
    }

    const x1 = Math.max(0, Math.min(dragStart.x, coords.x) / scale)
    const y1canvas = Math.max(0, Math.min(dragStart.y, coords.y))
    const x2 = Math.min(pdfW, Math.max(dragStart.x, coords.x) / scale)
    const y2canvas = Math.min(pageDims.current.height, Math.max(dragStart.y, coords.y))
    setCropBox({
      x: x1,
      y: Math.max(0, pdfH - (y2canvas / scale)),
      width: x2 - x1,
      height: (y2canvas - y1canvas) / scale,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDragStart(null)
    setDragMode('draw')
  }

  const handleReset = () => {
    setCropBox({ x: 0, y: 0, width: pageSize.current.pdfW, height: pageSize.current.pdfH })
  }

  const handleApply = async () => {
    if (!pdfBytes) return
    try {
      setProcessing(true)
      const cropBox = { x: cropX, y: cropY, width: cropW, height: cropH }
      let result

      if (applyToAll) {
        result = await pdfEngine.cropPages(pdfBytes, cropBox, null)
      } else {
        const info = await pdfEngine.getPDFInfo(pdfBytes)
        const perPageCropBoxes = info.pages.map((page, pageIndex) => {
          const saved = pageCropBoxes[pageIndex + 1]
          return saved || {
            x: 0,
            y: 0,
            width: Math.round(page.width),
            height: Math.round(page.height),
          }
        })
        result = await pdfEngine.cropPages(pdfBytes, perPageCropBoxes, info.pages.map((_, idx) => idx))
      }

      const outName = fileName.replace('.pdf', '_cropped.pdf')
      downloadBlob(result, outName)
      addToast({ type: 'success', message: 'Cropped PDF downloaded!' })
    } catch (err) {
      addToast({ type: 'error', message: `Crop failed: ${err.message}` })
    } finally {
      setProcessing(false)
    }
  }

  if (!pdfBytes) {
    return (
      <div id="crop-tool" className="animate-fade-in-up">
        <FileDropZone onFiles={handleFile} accept=".pdf" multiple={false} label="Drop your PDF here" id="crop-dropzone" />
        {loading && <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>}
      </div>
    )
  }

  return (
    <div id="crop-tool" className="animate-fade-in-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {fileName} - {pageCount} page{pageCount === 1 ? '' : 's'}
        </div>
        <PageNavigator currentPage={currentPage} pageCount={pageCount} onChange={setCurrentPage} compact idPrefix="crop-page" />
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div className="input-group" style={{ width: 100 }}>
            <label className="input-label">X (pt)</label>
            <input className="input" type="number" value={cropX} onChange={e => setCropBox({ x: Number(e.target.value), y: cropY, width: cropW, height: cropH })} min={0} id="crop-x" />
          </div>
          <div className="input-group" style={{ width: 100 }}>
            <label className="input-label">Y (pt)</label>
            <input className="input" type="number" value={cropY} onChange={e => setCropBox({ x: cropX, y: Number(e.target.value), width: cropW, height: cropH })} min={0} id="crop-y" />
          </div>
          <div className="input-group" style={{ width: 100 }}>
            <label className="input-label">Width (pt)</label>
            <input className="input" type="number" value={cropW} onChange={e => setCropBox({ x: cropX, y: cropY, width: Number(e.target.value), height: cropH })} min={10} id="crop-w" />
          </div>
          <div className="input-group" style={{ width: 100 }}>
            <label className="input-label">Height (pt)</label>
            <input className="input" type="number" value={cropH} onChange={e => setCropBox({ x: cropX, y: cropY, width: cropW, height: Number(e.target.value) })} min={10} id="crop-h" />
          </div>
          <div className="input-group">
            <label className="input-label">Apply to</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className={`btn btn-sm ${applyToAll ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setApplyToAll(true)}>All Pages</button>
              <button className={`btn btn-sm ${!applyToAll ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setApplyToAll(false)}>Current Page</button>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleReset} id="crop-reset"><RotateCcw size={14} /> Reset</button>
          <button className="btn btn-primary" onClick={handleApply} disabled={processing} id="crop-apply">
            {processing ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Download size={14} />}
            Crop & Download
          </button>
        </div>
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
            onMouseLeave={() => { if (isDragging) handleMouseUp() }}
          />
        </div>
      </div>
    </div>
  )
}
