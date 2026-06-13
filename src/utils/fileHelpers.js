import { useAppStore } from '../store/appStore'

export const MAX_FILE_SIZE_MB = 500
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date instanceof Date ? date : new Date(date))
}

export function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase()
}

export function isValidPDF(file) {
  return file.type === 'application/pdf' || getFileExtension(file.name) === 'pdf'
}

export function isValidImage(file) {
  return file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(getFileExtension(file.name))
}

export function readFileAsArrayBuffer(file, updateActivePdf = true) {
  return new Promise((resolve, reject) => {
    if (file?.size > MAX_FILE_SIZE_BYTES) {
      reject(new Error(`PDFOmni supports files up to ${MAX_FILE_SIZE_MB} MB.`))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result)
      if (updateActivePdf && file && file.name && file.name.toLowerCase().endsWith('.pdf')) {
        setTimeout(() => {
          try {
            useAppStore.getState().setActivePdf({
              name: file.name,
              pdfBytes: bytes,
              pageCount: 0
            })
          } catch (e) {
            console.error('Error setting active PDF in store:', e)
          }
        }, 0)
      }
      resolve(bytes)
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (file?.size > MAX_FILE_SIZE_BYTES) {
      reject(new Error(`PDFOmni supports files up to ${MAX_FILE_SIZE_MB} MB.`))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    if (file?.size > MAX_FILE_SIZE_BYTES) {
      reject(new Error(`PDFOmni supports files up to ${MAX_FILE_SIZE_MB} MB.`))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function parsePageRanges(input, totalPages) {
  // Parse "1-3, 5, 7-9" into [0, 1, 2, 4, 6, 7, 8] (0-indexed)
  const pages = new Set()
  const parts = input.split(',').map(s => s.trim()).filter(Boolean)
  
  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(n => parseInt(n.trim()))
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
          pages.add(i - 1)
        }
      }
    } else {
      const num = parseInt(part)
      if (!isNaN(num) && num >= 1 && num <= totalPages) {
        pages.add(num - 1)
      }
    }
  }
  
  return Array.from(pages).sort((a, b) => a - b)
}

export function generateId() {
  return crypto.randomUUID()
}
