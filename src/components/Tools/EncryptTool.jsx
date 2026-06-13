import { useState, useCallback } from 'react'
import { Lock, Download, Eye, EyeOff } from 'lucide-react'
import FileDropZone from '../Common/FileDropZone'
import { useAppStore } from '../../store/appStore'
import { readFileAsArrayBuffer, formatFileSize } from '../../utils/fileHelpers'
import { downloadBlob } from '../../utils/download'
import * as pdfEngine from '../../engine/pdfEngine'

export default function EncryptTool() {
  const { addToast } = useAppStore()
  const [pdfBytes, setPdfBytes] = useState(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleFile = useCallback(async (files) => {
    const file = files[0]
    if (!file) return
    try {
      setLoading(true)
      const bytes = await readFileAsArrayBuffer(file)
      setPdfBytes(bytes)
      setFileName(file.name)
      setFileSize(file.size)
    } catch (err) {
      addToast({ type: 'error', message: `Failed to load PDF: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  const passwordsMatch = password === confirmPassword && password.length > 0
  const passwordError = confirmPassword.length > 0 && password !== confirmPassword

  const handleEncrypt = async () => {
    if (!pdfBytes || !passwordsMatch) return
    try {
      setProcessing(true)
      const result = await pdfEngine.encryptPDF(pdfBytes, password, password)
      const outName = fileName.replace('.pdf', '_encrypted.pdf')
      downloadBlob(result, outName)
      addToast({ type: 'success', message: 'Encrypted PDF downloaded!' })
    } catch (err) {
      addToast({ type: 'error', message: `Encryption failed: ${err.message}` })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div id="encrypt-tool">
      {!pdfBytes ? (
        <>
          <FileDropZone onFiles={handleFile} accept=".pdf" multiple={false} label="Drop your PDF here" id="encrypt-dropzone" />
          {loading && <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>}
        </>
      ) : (
        <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
              {/* File info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <Lock size={20} style={{ color: 'var(--color-accent)' }} />
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{fileName}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{formatFileSize(fileSize)}</div>
                </div>
              </div>

              {/* Password fields */}
              <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                <label className="input-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter password"
                    id="encrypt-password"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: 'var(--space-6)' }}>
                <label className="input-label">Confirm Password</label>
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  style={passwordError ? { borderColor: 'var(--color-red)' } : {}}
                  id="encrypt-confirm"
                />
                {passwordError && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-red)' }}>Passwords do not match</span>
                )}
              </div>

              <div className="tool-action-row">
                <button className="btn btn-secondary" onClick={() => { setPdfBytes(null); setPassword(''); setConfirmPassword('') }}>
                  Choose Different File
                </button>
                <button className="btn btn-primary" onClick={handleEncrypt} disabled={processing || !passwordsMatch} id="encrypt-apply">
                  {processing ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Download size={14} />}
                  Protect & Download
                </button>
              </div>
        </div>
      )}
    </div>
  )
}
