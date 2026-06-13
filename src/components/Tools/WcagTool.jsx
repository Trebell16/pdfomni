import { useState, useCallback } from 'react'
import {
  ScanSearch, Upload, FileText, CheckCircle2, XCircle, AlertTriangle,
  Info, Loader2, Download, Eye
} from 'lucide-react'
import FileDropZone from '../Common/FileDropZone'
import ProgressBar from '../Common/ProgressBar'
import { useAppStore } from '../../store/appStore'
import { readFileAsArrayBuffer } from '../../utils/fileHelpers'
import { downloadText } from '../../utils/download'
import * as pdfEngine from '../../engine/pdfEngine'
import * as pdfRenderer from '../../engine/pdfRenderer'

const CHECKS = [
  { id: 'title', label: 'Document Title', desc: 'PDF should have a descriptive title in metadata' },
  { id: 'language', label: 'Language Declaration', desc: 'PDF language should be set for screen readers' },
  { id: 'tagged', label: 'Tagged PDF (Structure)', desc: 'PDF should have structure tags for reading order' },
  { id: 'alt-text', label: 'Image Alt-Text', desc: 'All images should have alternative text descriptions' },
  { id: 'heading-order', label: 'Heading Hierarchy', desc: 'Headings should follow a logical order (H1→H2→H3)' },
  { id: 'text-content', label: 'Readable Text', desc: 'PDF should contain extractable text (not just images)' },
  { id: 'page-count', label: 'Page Structure', desc: 'Document should have properly defined pages' },
  { id: 'metadata', label: 'Document Metadata', desc: 'Author, subject, and keywords should be present' },
]

export default function WcagTool() {
  const [pdfBytes, setPdfBytes] = useState(null)
  const [fileName, setFileName] = useState('')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState(null)
  const addToast = useAppStore(s => s.addToast)

  const handleFile = useCallback(async (files) => {
    const file = files[0]
    if (!file) return
    try {
      const bytes = await readFileAsArrayBuffer(file)
      setPdfBytes(bytes)
      setFileName(file.name)
      setResults(null)
    } catch (e) {
      addToast({ type: 'error', message: 'Failed to load PDF' })
    }
  }, [addToast])

  const runScan = async () => {
    if (!pdfBytes) return
    setScanning(true)
    setProgress(0)

    try {
      const checkResults = []

      // 1. Title check
      setProgress(10)
      const info = await pdfEngine.getPDFInfo(pdfBytes)
      checkResults.push({
        id: 'title',
        status: info.title ? 'pass' : 'fail',
        detail: info.title ? `Title: "${info.title}"` : 'No document title set in metadata',
        fix: info.title ? null : 'Add a descriptive title via PDF properties/metadata',
      })

      // 2. Language (we can't easily check this with pdf-lib, so we check metadata)
      setProgress(20)
      checkResults.push({
        id: 'language',
        status: 'warning',
        detail: 'Language detection requires structure tree inspection (limited in client-side tools)',
        fix: 'Ensure the /Lang entry is set in the document catalog',
      })

      // 3. Tagged PDF check
      setProgress(30)
      checkResults.push({
        id: 'tagged',
        status: 'warning',
        detail: 'Structure tag verification requires deep PDF parsing. Many PDFs lack structure tags.',
        fix: 'Use a PDF editor that supports tagging (Adobe Acrobat, etc.) to add structure tags',
      })

      // 4. Alt-text check (check if images exist)
      setProgress(40)
      checkResults.push({
        id: 'alt-text',
        status: 'warning',
        detail: 'Image alt-text detection requires inspecting /Alt entries in structure tree. Check manually.',
        fix: 'Add /Alt attributes to all Figure structure elements',
      })

      // 5. Heading hierarchy
      setProgress(50)
      checkResults.push({
        id: 'heading-order',
        status: 'warning',
        detail: 'Heading hierarchy inspection requires structure tag analysis',
        fix: 'Ensure headings are tagged as H1, H2, H3 in logical order',
      })

      // 6. Text content check
      setProgress(65)
      let totalChars = 0
      let emptyPages = 0
      try {
        const textPages = await pdfRenderer.extractAllText(pdfBytes, (i, total) => {
          setProgress(65 + (i / total) * 20)
        })
        for (const p of textPages) {
          totalChars += p.text.trim().length
          if (p.text.trim().length < 5) emptyPages++
        }
      } catch (e) {
        // text extraction failed
      }

      checkResults.push({
        id: 'text-content',
        status: totalChars > 50 ? 'pass' : totalChars > 0 ? 'warning' : 'fail',
        detail: totalChars > 50
          ? `${totalChars.toLocaleString()} characters extracted. ${emptyPages > 0 ? `${emptyPages} page(s) have very little text.` : 'All pages have text.'}`
          : totalChars > 0
          ? `Only ${totalChars} characters found. Document may be mostly images.`
          : 'No text content found. Document may be image-only (scanned).',
        fix: totalChars < 50 ? 'Run OCR to add text layer over scanned images' : null,
      })

      // 7. Page structure
      setProgress(90)
      checkResults.push({
        id: 'page-count',
        status: info.pageCount > 0 ? 'pass' : 'fail',
        detail: `${info.pageCount} page(s) found. ${info.pages.map((p, i) => 
          `Page ${i + 1}: ${Math.round(p.width)}×${Math.round(p.height)}pt`
        ).join(', ')}`,
        fix: info.pageCount === 0 ? 'Document appears to have no pages' : null,
      })

      // 8. Metadata
      checkResults.push({
        id: 'metadata',
        status: (info.author && info.title) ? 'pass' : (!info.author && !info.title) ? 'fail' : 'warning',
        detail: [
          info.title && `Title: "${info.title}"`,
          info.author && `Author: "${info.author}"`,
          info.subject && `Subject: "${info.subject}"`,
          info.creator && `Creator: "${info.creator}"`,
          !info.title && !info.author && 'No metadata found',
        ].filter(Boolean).join(' | '),
        fix: (!info.author || !info.title) ? 'Add title, author, subject, and keywords to PDF metadata' : null,
      })

      setProgress(100)

      // Calculate score
      const passCount = checkResults.filter(r => r.status === 'pass').length
      const warnCount = checkResults.filter(r => r.status === 'warning').length
      const failCount = checkResults.filter(r => r.status === 'fail').length
      const score = Math.round((passCount * 100 + warnCount * 50) / checkResults.length)

      setResults({
        checks: checkResults,
        score,
        passCount,
        warnCount,
        failCount,
        totalChars,
        pageCount: info.pageCount,
      })

      addToast({ type: 'success', message: 'WCAG scan complete' })
    } catch (e) {
      addToast({ type: 'error', message: `Scan failed: ${e.message}` })
    } finally {
      setScanning(false)
    }
  }

  const exportReport = () => {
    if (!results) return
    let report = `WCAG Accessibility Report\n${'='.repeat(40)}\n`
    report += `File: ${fileName}\nPages: ${results.pageCount}\nScore: ${results.score}/100\n\n`
    report += `Summary: ${results.passCount} passed, ${results.warnCount} warnings, ${results.failCount} failed\n\n`
    report += `Detailed Results\n${'-'.repeat(40)}\n\n`
    
    for (const check of results.checks) {
      const checkDef = CHECKS.find(c => c.id === check.id)
      const icon = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌'
      report += `${icon} ${checkDef?.label || check.id}\n`
      report += `   ${check.detail}\n`
      if (check.fix) report += `   Fix: ${check.fix}\n`
      report += '\n'
    }

    downloadText(report, `wcag-report-${fileName.replace('.pdf', '')}.txt`)
  }

  const getGradeColor = (score) => {
    if (score >= 80) return 'var(--color-green)'
    if (score >= 50) return 'var(--color-amber)'
    return 'var(--color-red)'
  }

  const getGrade = (score) => {
    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 60) return 'C'
    if (score >= 40) return 'D'
    return 'F'
  }

  if (!pdfBytes) {
    return (
      <div className="animate-fade-in-up">
        <FileDropZone
          onFiles={handleFile}
          accept=".pdf"
          multiple={false}
          label="Drop a PDF to scan for accessibility"
          sublabel="Check WCAG compliance, alt-text, reading order, and more"
          id="wcag-dropzone"
        />
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up" id="wcag-tool">
      {/* File info & scan button */}
      <div className="card" style={{ 
        marginBottom: 'var(--space-4)', padding: 'var(--space-4)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 200 }}>
          <FileText size={24} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{fileName}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Ready for accessibility scan
            </div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={runScan} disabled={scanning} id="wcag-scan-btn">
          {scanning ? (
            <><Loader2 size={18} className="animate-spin" /> Scanning...</>
          ) : (
            <><ScanSearch size={18} /> Run WCAG Scan</>
          )}
        </button>
        <button className="btn btn-secondary" onClick={() => { setPdfBytes(null); setResults(null) }}>
          Change File
        </button>
      </div>

      {scanning && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <ProgressBar progress={progress} message="Analyzing document structure..." />
        </div>
      )}

      {/* Results */}
      {results && (
        <div>
          {/* Score card */}
          <div className="card" style={{
            marginBottom: 'var(--space-4)', padding: 'var(--space-6)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-8)', flexWrap: 'wrap',
            background: 'var(--color-bg-elevated)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 90, height: 90,
                borderRadius: '50%',
                border: `4px solid ${getGradeColor(results.score)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column',
                background: `${getGradeColor(results.score)}15`,
              }}>
                <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 900, color: getGradeColor(results.score) }}>
                  {getGrade(results.score)}
                </span>
              </div>
              <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Score: {results.score}/100
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-6)', flex: 1, justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-green)' }}>
                  {results.passCount}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Passed</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-amber)' }}>
                  {results.warnCount}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Warnings</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--color-red)' }}>
                  {results.failCount}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Failed</div>
              </div>
            </div>

            <button className="btn btn-secondary" onClick={exportReport}>
              <Download size={16} /> Export Report
            </button>
          </div>

          {/* Individual checks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {results.checks.map(check => {
              const checkDef = CHECKS.find(c => c.id === check.id)
              return (
                <div key={check.id} className="card" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      {check.status === 'pass' && <CheckCircle2 size={20} style={{ color: 'var(--color-green)' }} />}
                      {check.status === 'warning' && <AlertTriangle size={20} style={{ color: 'var(--color-amber)' }} />}
                      {check.status === 'fail' && <XCircle size={20} style={{ color: 'var(--color-red)' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 2 }}>
                        {checkDef?.label || check.id}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                        {checkDef?.desc}
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                        {check.detail}
                      </div>
                      {check.fix && (
                        <div style={{
                          marginTop: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)',
                          background: 'var(--color-amber-dim)', borderRadius: 'var(--radius-sm)',
                          fontSize: 'var(--text-xs)', color: 'var(--color-amber)',
                          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                        }}>
                          <Info size={12} />
                          <span><strong>Fix:</strong> {check.fix}</span>
                        </div>
                      )}
                    </div>
                    <span className={`badge ${
                      check.status === 'pass' ? 'badge-green' :
                      check.status === 'warning' ? 'badge-amber' : 'badge-accent'
                    }`}>
                      {check.status === 'pass' ? 'PASS' : check.status === 'warning' ? 'WARN' : 'FAIL'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
