import { useState, useCallback } from 'react'
import { Unlock, Download, Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react'
import FileDropZone from '../Common/FileDropZone'
import { useAppStore } from '../../store/appStore'
import { readFileAsArrayBuffer, formatFileSize } from '../../utils/fileHelpers'
import { downloadBlob } from '../../utils/download'
import * as pdfEngine from '../../engine/pdfEngine'

export default function DecryptTool() {
  const { addToast } = useAppStore()
  const [pdfBytes, setPdfBytes] = useState(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState('') // '' | 'success' | 'error'
  const [statusMsg, setStatusMsg] = useState('')

  const handleFile = useCallback(async (files) => {
    const file = files[0]
    if (!file) return
    try {
      setLoading(true)
      const bytes = await readFileAsArrayBuffer(file)
      setPdfBytes(bytes)
      setFileName(file.name)
      setFileSize(file.size)
      setStatus('')
      setStatusMsg('')

      try {
        await pdfEngine.decryptPDF(bytes, '')
        setStatus('success')
        setStatusMsg('This PDF does not appear to be password-protected. You can download it directly.')
      } catch {
        setStatusMsg('This PDF appears to be password-protected. Enter the password below.')
      }
    } catch (err) {
      addToast({ type: 'error', message: `Failed to load file: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  const handleDecrypt = async () => {
    if (!pdfBytes) return
    try {
      setProcessing(true)
      setStatus('')

      const decrypted = await pdfEngine.decryptPDF(pdfBytes, password)

      const outName = fileName.replace('.pdf', '_unlocked.pdf')
      downloadBlob(decrypted, outName)
      setStatus('success')
      setStatusMsg('PDF unlocked and downloaded successfully!')
      addToast({ type: 'success', message: 'Decrypted PDF downloaded!' })
    } catch (err) {
      setStatus('error')
      setStatusMsg(`Decryption failed: ${err.message}. Please check the password.`)
      addToast({ type: 'error', message: `Decryption failed: ${err.message}` })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div id="decrypt-tool">
      {!pdfBytes ? (
        <>
          <FileDropZone onFiles={handleFile} accept=".pdf" multiple={false} label="Drop your encrypted PDF here" id="decrypt-dropzone" />
          {loading && <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>}
        </>
      ) : (
        <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
              {/* File info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <Unlock size={20} style={{ color: 'var(--color-green)' }} />
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{fileName}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{formatFileSize(fileSize)}</div>
                </div>
              </div>

              {statusMsg && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 'var(--space-4)',
                  padding: 'var(--space-3)',
                  background: status === 'success' ? 'var(--color-green-dim)' : status === 'error' ? 'var(--color-red-dim)' : 'var(--color-amber-dim)',
                  borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                  color: status === 'success' ? 'var(--color-green)' : status === 'error' ? 'var(--color-red)' : 'var(--color-amber)',
                }}>
                  {status === 'success' ? <CheckCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />}
                  <span>{statusMsg}</span>
                </div>
              )}

              {/* Password field */}
              <div className="input-group" style={{ marginBottom: 'var(--space-6)' }}>
                <label className="input-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter PDF password"
                    onKeyDown={e => e.key === 'Enter' && handleDecrypt()}
                    id="decrypt-password"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="tool-action-row">
                <button className="btn btn-secondary" onClick={() => { setPdfBytes(null); setPassword(''); setStatus(''); setStatusMsg('') }}>
                  Choose Different File
                </button>
                <button className="btn btn-primary" onClick={handleDecrypt} disabled={processing} id="decrypt-apply">
                  {processing ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Download size={14} />}
                  Unlock & Download
                </button>
              </div>
        </div>
      )}
    </div>
  )
}
