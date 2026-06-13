import { useState, useCallback } from 'react'
import { Download, Copy, Check, FileText, Trash2 } from 'lucide-react'
import FileDropZone from '../Common/FileDropZone'
import ProgressBar from '../Common/ProgressBar'
import { useAppStore } from '../../store/appStore'
import { readFileAsArrayBuffer, formatFileSize } from '../../utils/fileHelpers'
import { downloadText } from '../../utils/download'
import * as pdfRenderer from '../../engine/pdfRenderer'
import { recognizePage } from '../../engine/ocrEngine'

export default function PdfToTextTool({ toolId, tool }) {
  const [pdfBytes, setPdfBytes] = useState(null)
  const [fileName, setFileName] = useState('')
  const [extractedText, setExtractedText] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const addToast = useAppStore((s) => s.addToast)

  const handleFiles = useCallback(async (files) => {
    const file = files[0]
    if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
      addToast({ type: 'error', message: 'Please upload a PDF file.' })
      return
    }
    setProcessing(true)
    setProgress(0)
    setProgressMsg('Loading PDF...')
    try {
      const bytes = await readFileAsArrayBuffer(file)
      setPdfBytes(bytes)
      setFileName(file.name.replace(/\.pdf$/i, ''))

      setProgressMsg('Extracting text...')
      const pages = await pdfRenderer.extractAllText(bytes, (current, total) => {
        setProgress((current / total) * 100)
        setProgressMsg(`Extracting text from page ${current} of ${total}...`)
      })

      let finalPages = pages
      const textBlockCount = pages.reduce((sum, p) => {
        const blocks = p.text.split(/\s{2,}|\n+/).filter((part) => part.trim().length > 0)
        return sum + blocks.length
      }, 0)

      if (textBlockCount < 5) {
        addToast({ type: 'info', message: 'Low text content detected. Running local OCR...' })
        const ocrPages = []
        for (let i = 1; i <= pages.length; i++) {
          setProgress((i / pages.length) * 100)
          setProgressMsg(`Running OCR on page ${i} of ${pages.length}...`)
          const image = await pdfRenderer.renderPageToDataUrl(bytes, i, 2, 'image/png')
          const result = await recognizePage(image.dataUrl, 'eng')
          ocrPages.push({ pageNum: i, text: result.text.trim() })
        }
        finalPages = ocrPages
      }

      const fullText = finalPages
        .map((p) => `--- Page ${p.pageNum} ---\n${p.text}`)
        .join('\n\n')

      setExtractedText(fullText)
      setPageCount(finalPages.length)
      setProgress(100)
      setProgressMsg('Done!')
      addToast({ type: 'success', message: `Extracted text from ${pages.length} pages!` })
    } catch (err) {
      console.error('Text extraction error:', err)
      addToast({ type: 'error', message: `Failed to extract text: ${err.message}` })
    } finally {
      setProcessing(false)
    }
  }, [addToast])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(extractedText)
      setCopied(true)
      addToast({ type: 'success', message: 'Text copied to clipboard!' })
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      addToast({ type: 'error', message: 'Failed to copy text.' })
    }
  }, [extractedText, addToast])

  const handleDownload = useCallback(() => {
    downloadText(extractedText, `${fileName || 'extracted'}.txt`)
    addToast({ type: 'success', message: 'Text file downloaded!' })
  }, [extractedText, fileName, addToast])

  const handleReset = useCallback(() => {
    setPdfBytes(null)
    setFileName('')
    setExtractedText('')
    setPageCount(0)
    setCopied(false)
  }, [])

  const charCount = extractedText.length
  const wordCount = extractedText.trim() ? extractedText.trim().split(/\s+/).length : 0

  return (
    <div className="animate-fade-in-up" id="pdf-to-text-tool">
      {!pdfBytes ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {processing && <ProgressBar progress={progress} message={progressMsg} />}
          <FileDropZone
            onFiles={handleFiles}
            accept=".pdf"
            multiple={false}
            label="Drop your PDF here to extract text"
            sublabel="or click to browse"
            id="pdf-to-text-dropzone"
            maxFiles={1}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Stats bar */}
          <div className="card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                <span className="badge">{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
                <span className="badge">{charCount.toLocaleString()} characters</span>
                <span className="badge">{wordCount.toLocaleString()} words</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={handleReset} id="pdf2text-reset">
                <Trash2 size={14} />
                New file
              </button>
            </div>
          </div>

          {/* Progress */}
          {processing && <ProgressBar progress={progress} message={progressMsg} />}

          {/* Text area */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-5)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <FileText size={16} />
                Extracted Text
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleCopy}
                  disabled={!extractedText}
                  id="pdf2text-copy"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleDownload}
                  disabled={!extractedText}
                  id="pdf2text-download"
                >
                  <Download size={14} />
                  Download .txt
                </button>
              </div>
            </div>
            <textarea
              value={extractedText}
              readOnly
              style={{
                width: '100%',
                minHeight: '300px',
                maxHeight: '600px',
                padding: 'var(--space-4)',
                border: 'none',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                lineHeight: 1.6,
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
              id="pdf2text-textarea"
            />
          </div>
        </div>
      )}
    </div>
  )
}
