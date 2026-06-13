import { useState, useCallback, useMemo } from 'react'
import { Download, Upload, FileText, Loader2, Lock, Unlock, Stamp, Hash, Minimize2, Image as ImageIcon, FileSearch } from 'lucide-react'
import JSZip from 'jszip'
import FileDropZone from '../Common/FileDropZone'
import ProgressBar from '../Common/ProgressBar'
import { useAppStore } from '../../store/appStore'
import { readFileAsArrayBuffer, formatFileSize } from '../../utils/fileHelpers'
import { downloadFile } from '../../utils/download'
import * as pdfEngine from '../../engine/pdfEngine'
import * as pdfRenderer from '../../engine/pdfRenderer'
import { recognizePage } from '../../engine/ocrEngine'

const OPERATIONS = [
  { id: 'compress', label: 'Compress PDF', icon: Minimize2 },
  { id: 'page-numbers', label: 'Page Numbers', icon: Hash },
  { id: 'pdf-to-image', label: 'PDF to Image', icon: ImageIcon },
  { id: 'pdf-to-text', label: 'PDF to Text', icon: FileSearch },
  { id: 'protect', label: 'Protect PDF', icon: Lock },
  { id: 'unlock', label: 'Unlock PDF', icon: Unlock },
  { id: 'watermark', label: 'Watermark PDF', icon: Stamp },
]

export default function BatchTool() {
  const [files, setFiles] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [batchOp, setBatchOp] = useState('compress')
  const [targetPercent, setTargetPercent] = useState(65)
  const [password, setPassword] = useState('')
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL')
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.15)
  const [watermarkRotation, setWatermarkRotation] = useState(-45)
  const [watermarkX, setWatermarkX] = useState(50)
  const [watermarkY, setWatermarkY] = useState(50)
  const addToast = useAppStore((s) => s.addToast)

  const selectedFiles = useMemo(
    () => files.filter((file) => selectedIds.has(file.id)),
    [files, selectedIds]
  )

  const handleFiles = useCallback((newFiles) => {
    const newEntries = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      loading: true,
      fileObject: file,
      pageCount: 0,
      bytes: null,
    }))

    setFiles((prev) => [...prev, ...newEntries])
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const entry of newEntries) next.add(entry.id)
      return next
    })

    // Read files and compute page counts concurrently in the background
    newEntries.forEach(async (entry) => {
      try {
        const bytes = await readFileAsArrayBuffer(entry.fileObject, false)
        const pageCount = await pdfRenderer.getPageCount(bytes)
        setFiles((prev) =>
          prev.map((f) => (f.id === entry.id ? { ...f, bytes, pageCount, loading: false } : f))
        )
      } catch (err) {
        addToast({ type: 'error', message: `Failed to load ${entry.name}: ${err.message}` })
        setFiles((prev) => prev.filter((f) => f.id !== entry.id))
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(entry.id)
          return next
        })
      }
    })
  }, [addToast])

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds((prev) => (
      prev.size === files.length ? new Set() : new Set(files.map((file) => file.id))
    ))
  }

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((file) => file.id !== id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const fileBaseName = (filename) => filename.replace(/\.pdf$/i, '')

  const buildTextOutput = async (pdfBytes) => {
    const pages = await pdfRenderer.extractAllText(pdfBytes)
    const textBlockCount = pages.reduce((sum, page) => (
      sum + page.text.split(/\s{2,}|\n+/).filter((part) => part.trim().length > 0).length
    ), 0)

    const finalPages = []
    if (textBlockCount < 5) {
      for (let index = 1; index <= pages.length; index++) {
        const image = await pdfRenderer.renderPageToDataUrl(pdfBytes, index, 2, 'image/png')
        const result = await recognizePage(image.dataUrl, 'eng')
        finalPages.push({ pageNum: index, text: result.text.trim() })
      }
    } else {
      finalPages.push(...pages)
    }

    return finalPages
      .map((page) => `--- Page ${page.pageNum} ---\n${page.text}`)
      .join('\n\n')
  }

  const runBatchOperation = async () => {
    if (selectedFiles.length === 0) {
      addToast({ type: 'warning', message: 'Select at least one PDF first.' })
      return
    }

    if ((batchOp === 'protect' || batchOp === 'unlock') && !password.trim()) {
      addToast({ type: 'error', message: 'Enter a password for this batch operation.' })
      return
    }

    setProcessing(true)
    setProgress(0)

    try {
      const megaZip = new JSZip()

      for (let index = 0; index < selectedFiles.length; index++) {
        const file = selectedFiles[index]
        setProgress(Math.round((index / selectedFiles.length) * 100))
        setProgressMsg(`Processing ${file.name} (${index + 1}/${selectedFiles.length})`)

        if (batchOp === 'compress') {
          const targetBytes = Math.max(1024, Math.round(file.size * (targetPercent / 100)))
          const output = await pdfEngine.compressPDF(file.bytes, { targetBytes })
          megaZip.file(`${fileBaseName(file.name)}-compressed.pdf`, output)
        }

        if (batchOp === 'page-numbers') {
          const output = await pdfEngine.addPageNumbers(file.bytes, {
            position: 'bottom-center',
            startNumber: 1,
          })
          megaZip.file(`${fileBaseName(file.name)}-numbered.pdf`, output)
        }

        if (batchOp === 'pdf-to-image') {
          const nestedZip = new JSZip()
          for (let pageNum = 1; pageNum <= file.pageCount; pageNum++) {
            const blob = await pdfRenderer.renderPageToBlob(file.bytes, pageNum, 2, 'image/png', 0.95)
            nestedZip.file(`page-${pageNum}.png`, await blob.arrayBuffer())
          }
          const nestedBytes = await nestedZip.generateAsync({ type: 'uint8array' })
          megaZip.file(`${fileBaseName(file.name)}-images.zip`, nestedBytes)
        }

        if (batchOp === 'pdf-to-text') {
          const text = await buildTextOutput(file.bytes)
          megaZip.file(`${fileBaseName(file.name)}.txt`, text)
        }

        if (batchOp === 'protect') {
          const output = await pdfEngine.encryptPDF(file.bytes, password, password)
          megaZip.file(`${fileBaseName(file.name)}-protected.pdf`, output)
        }

        if (batchOp === 'unlock') {
          const output = await pdfEngine.decryptPDF(file.bytes, password)
          megaZip.file(`${fileBaseName(file.name)}-unlocked.pdf`, output)
        }

        if (batchOp === 'watermark') {
          const output = await pdfEngine.addWatermark(file.bytes, {
            text: watermarkText,
            opacity: watermarkOpacity,
            rotation: watermarkRotation,
            xPercent: watermarkX,
            yPercent: watermarkY,
          })
          megaZip.file(`${fileBaseName(file.name)}-watermarked.pdf`, output)
        }
      }

      setProgress(100)
      setProgressMsg('Packaging outputs...')
      const blob = await megaZip.generateAsync({ type: 'blob' })
      const downloaded = await downloadFile(blob, 'pdfomni-batch-output.zip')
      if (!downloaded) return
      addToast({ type: 'success', message: `Batch output ready for ${selectedFiles.length} PDF(s).` })
    } catch (err) {
      console.error('Batch processing failed:', err)
      addToast({ type: 'error', message: `Batch failed: ${err.message}` })
    } finally {
      setProcessing(false)
    }
  }

  if (files.length === 0) {
    return (
      <div className="animate-fade-in-up">
        <FileDropZone
          onFiles={handleFiles}
          accept=".pdf"
          multiple
          label="Drop PDF files for batch processing"
          sublabel="Upload multiple files to process them together"
          id="batch-dropzone"
        />
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up" id="batch-tool">
      <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="input-group" style={{ minWidth: 220 }}>
            <label className="input-label">Batch Operation</label>
            <select className="select" value={batchOp} onChange={(e) => setBatchOp(e.target.value)}>
              {OPERATIONS.map((operation) => (
                <option key={operation.id} value={operation.id}>{operation.label}</option>
              ))}
            </select>
          </div>

          {batchOp === 'compress' && (
            <div className="input-group" style={{ minWidth: 260, flex: 1 }}>
              <label className="input-label">Target Size: {targetPercent}% of original</label>
              <input type="range" min="15" max="95" step="5" value={targetPercent} onChange={(e) => setTargetPercent(Number(e.target.value))} />
            </div>
          )}

          {(batchOp === 'protect' || batchOp === 'unlock') && (
            <div className="input-group" style={{ minWidth: 260, flex: 1 }}>
              <label className="input-label">
                {batchOp === 'protect'
                  ? 'Password for all output PDFs'
                  : 'Password shared by all uploaded PDFs'}
              </label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" />
            </div>
          )}

          {batchOp === 'watermark' && (
            <>
              <div className="input-group" style={{ minWidth: 220 }}>
                <label className="input-label">Watermark Text</label>
                <input className="input" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} />
              </div>
              <div className="input-group" style={{ minWidth: 180 }}>
                <label className="input-label">Opacity: {Math.round(watermarkOpacity * 100)}%</label>
                <input type="range" min="0.05" max="1" step="0.05" value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(Number(e.target.value))} />
              </div>
              <div className="input-group" style={{ minWidth: 180 }}>
                <label className="input-label">Rotation: {watermarkRotation}°</label>
                <input type="range" min="-180" max="180" value={watermarkRotation} onChange={(e) => setWatermarkRotation(Number(e.target.value))} />
              </div>
              <div className="input-group" style={{ minWidth: 180 }}>
                <label className="input-label">X Position: {watermarkX}%</label>
                <input type="range" min="0" max="100" value={watermarkX} onChange={(e) => setWatermarkX(Number(e.target.value))} />
              </div>
              <div className="input-group" style={{ minWidth: 180 }}>
                <label className="input-label">Y Position: {watermarkY}%</label>
                <input type="range" min="0" max="100" value={watermarkY} onChange={(e) => setWatermarkY(Number(e.target.value))} />
              </div>
            </>
          )}
        </div>

        {processing && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <ProgressBar progress={progress} message={progressMsg} />
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
          <button className="btn btn-secondary btn-sm" onClick={selectAll}>
            {selectedIds.size === files.length ? 'Deselect All' : 'Select All'}
          </button>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {files.length} file(s) - {selectedFiles.length} selected
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.pdf'
              input.multiple = true
              input.onchange = (event) => handleFiles(Array.from(event.target.files || []))
              input.click()
            }}
          >
            <Upload size={14} /> Add More
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {files.map((file) => (
            <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)', background: selectedIds.has(file.id) ? 'var(--color-accent-dim)' : 'transparent' }}>
              <input type="checkbox" checked={selectedIds.has(file.id)} onChange={() => toggleSelect(file.id)} disabled={file.loading} />
              <FileText size={16} style={{ color: 'var(--color-accent)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  {formatFileSize(file.size)} - {file.loading ? 'loading page count...' : `${file.pageCount} page${file.pageCount === 1 ? '' : 's'}`}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => removeFile(file.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button className="btn btn-primary btn-lg" onClick={runBatchOperation} disabled={processing || selectedFiles.length === 0 || selectedFiles.some(f => f.loading)}>
          {processing ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          Run Batch & Download ZIP
        </button>
      </div>
    </div>
  )
}
