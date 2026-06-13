import { useState, useCallback } from 'react'
import { Download, Image, Check, FileText } from 'lucide-react'
import FileDropZone from '../Common/FileDropZone'
import ProgressBar from '../Common/ProgressBar'
import { useAppStore } from '../../store/appStore'
import { readFileAsArrayBuffer, formatFileSize } from '../../utils/fileHelpers'
import { downloadFile, downloadMultipleAsZip } from '../../utils/download'
import * as pdfRenderer from '../../engine/pdfRenderer'

export default function PdfToImageTool({ toolId, tool }) {
  const [pdfBytes, setPdfBytes] = useState(null)
  const [fileName, setFileName] = useState('')
  const [thumbnails, setThumbnails] = useState([])
  const [selectedPages, setSelectedPages] = useState(new Set())
  const [format, setFormat] = useState('jpeg')
  const [quality, setQuality] = useState(0.92)
  const [processing, setProcessing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const addToast = useAppStore((s) => s.addToast)

  const handleFiles = useCallback(async (files) => {
    const file = files[0]
    if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
      addToast({ type: 'error', message: 'Please upload a PDF file.' })
      return
    }
    setLoading(true)
    setProgress(0)
    setProgressMsg('Loading PDF...')
    try {
      const bytes = await readFileAsArrayBuffer(file)
      setPdfBytes(bytes)
      setFileName(file.name.replace(/\.pdf$/i, ''))

      setProgressMsg('Generating thumbnails...')
      const thumbs = await pdfRenderer.generateAllThumbnails(bytes, 200, (current, total) => {
        setProgress((current / total) * 100)
        setProgressMsg(`Generating thumbnail ${current} of ${total}...`)
      })
      setThumbnails(thumbs)
      setSelectedPages(new Set(thumbs.map((t) => t.pageNum)))
      setProgress(100)
      setProgressMsg('Ready!')
    } catch (err) {
      console.error('PDF load error:', err)
      addToast({ type: 'error', message: `Failed to load PDF: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  const togglePage = useCallback((pageNum) => {
    setSelectedPages((prev) => {
      const next = new Set(prev)
      if (next.has(pageNum)) {
        next.delete(pageNum)
      } else {
        next.add(pageNum)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedPages(new Set(thumbnails.map((t) => t.pageNum)))
  }, [thumbnails])

  const selectNone = useCallback(() => {
    setSelectedPages(new Set())
  }, [])

  const handleExport = useCallback(async () => {
    if (selectedPages.size === 0) {
      addToast({ type: 'error', message: 'Please select at least one page to export.' })
      return
    }
    setProcessing(true)
    setProgress(0)
    setProgressMsg('Exporting images...')
    try {
      const pages = Array.from(selectedPages).sort((a, b) => a - b)
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
      const ext = format === 'png' ? 'png' : 'jpg'

      if (pages.length === 1) {
        setProgressMsg(`Rendering page ${pages[0]}...`)
        const blob = await pdfRenderer.renderPageToBlob(pdfBytes, pages[0], 2, mimeType, quality)
        await downloadFile(blob, `${fileName}_page${pages[0]}.${ext}`)
        setProgress(100)
        setProgressMsg('Done!')
        addToast({ type: 'success', message: 'Image exported successfully!' })
      } else {
        const files = []
        for (let i = 0; i < pages.length; i++) {
          const pageNum = pages[i]
          setProgress(((i + 1) / pages.length) * 90)
          setProgressMsg(`Rendering page ${pageNum} (${i + 1}/${pages.length})...`)
          const blob = await pdfRenderer.renderPageToBlob(pdfBytes, pageNum, 2, mimeType, quality)
          const arrayBuffer = await blob.arrayBuffer()
          files.push({
            name: `${fileName}_page${pageNum}.${ext}`,
            bytes: new Uint8Array(arrayBuffer),
          })
        }
        setProgress(95)
        setProgressMsg('Creating zip file...')
        await downloadMultipleAsZip(files, `${fileName}_images.zip`)
        setProgress(100)
        setProgressMsg('Done!')
        addToast({ type: 'success', message: `Exported ${pages.length} pages as images!` })
      }
    } catch (err) {
      console.error('Export error:', err)
      addToast({ type: 'error', message: `Export failed: ${err.message}` })
    } finally {
      setProcessing(false)
    }
  }, [selectedPages, pdfBytes, fileName, format, quality, addToast])

  const handleReset = useCallback(() => {
    setPdfBytes(null)
    setFileName('')
    setThumbnails([])
    setSelectedPages(new Set())
  }, [])

  if (!pdfBytes) {
    return (
      <div className="animate-fade-in-up" id="pdf-to-image-tool">
        {loading && <ProgressBar progress={progress} message={progressMsg} />}
        <FileDropZone
          onFiles={handleFiles}
          accept=".pdf"
          multiple={false}
          label="Drop your PDF here to convert to images"
          sublabel="or click to browse"
          id="pdf-to-image-dropzone"
          maxFiles={1}
        />
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up" id="pdf-to-image-tool">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Options */}
        <div className="card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'flex-end' }}>
            <div>
              <label className="input-label" htmlFor="pdf2img-format">Format</label>
              <select
                className="select"
                id="pdf2img-format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                disabled={processing}
              >
                <option value="jpeg">JPG</option>
                <option value="png">PNG</option>
              </select>
            </div>
            {format === 'jpeg' && (
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label className="input-label" htmlFor="pdf2img-quality">
                  Quality: {Math.round(quality * 100)}%
                </label>
                <input
                  type="range"
                  id="pdf2img-quality"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={quality}
                  onChange={(e) => setQuality(parseFloat(e.target.value))}
                  disabled={processing}
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <button className="btn btn-ghost btn-sm" onClick={handleReset} disabled={processing}>
              Change PDF
            </button>
          </div>
        </div>

        {/* Page selection */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              {selectedPages.size} of {thumbnails.length} page{thumbnails.length !== 1 ? 's' : ''} selected
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn-ghost btn-sm" onClick={selectAll} disabled={processing} id="pdf2img-select-all">
                Select All
              </button>
              <button className="btn btn-ghost btn-sm" onClick={selectNone} disabled={processing} id="pdf2img-select-none">
                Select None
              </button>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)',
              maxHeight: '500px',
              overflowY: 'auto',
            }}
          >
            {thumbnails.map((thumb) => (
              <div
                key={thumb.pageNum}
                onClick={() => !processing && togglePage(thumb.pageNum)}
                style={{
                  position: 'relative',
                  borderRadius: 'var(--radius-md)',
                  border: '2px solid',
                  borderColor: selectedPages.has(thumb.pageNum)
                    ? 'var(--color-accent)'
                    : 'var(--color-border)',
                  cursor: processing ? 'default' : 'pointer',
                  overflow: 'hidden',
                  transition: 'border-color var(--transition-fast)',
                  opacity: selectedPages.has(thumb.pageNum) ? 1 : 0.5,
                }}
                id={`pdf2img-page-${thumb.pageNum}`}
              >
                <img
                  src={thumb.dataUrl}
                  alt={`Page ${thumb.pageNum}`}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
                <div
                  style={{
                    textAlign: 'center',
                    padding: 'var(--space-1)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Page {thumb.pageNum}
                </div>
                {selectedPages.has(thumb.pageNum) && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 22,
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--color-accent)',
                      borderRadius: '50%',
                      color: '#fff',
                    }}
                  >
                    <Check size={14} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Progress */}
        {processing && <ProgressBar progress={progress} message={progressMsg} />}

        {/* Action */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-3)' }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleExport}
            disabled={processing || selectedPages.size === 0}
            id="pdf2img-export-btn"
          >
            {processing ? (
              <>
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Exporting...
              </>
            ) : (
              <>
                <Image size={20} />
                Export {selectedPages.size} Page{selectedPages.size !== 1 ? 's' : ''} as {format.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
