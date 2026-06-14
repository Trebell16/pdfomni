import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const activeCanvasRenders = new WeakMap()
const documentCache = new WeakMap()
const MAX_CACHED_DOCUMENTS = 2
const PDF_LOAD_TIMEOUT_MS = 30000
const cachedDocumentOrder = []
let thumbnailQueue = Promise.resolve()

// Helper: copy the buffer so pdf.js doesn't detach the original
function copyBuffer(buf) {
  if (buf instanceof ArrayBuffer) {
    return buf.slice(0)
  }
  if (buf instanceof Uint8Array) {
    return buf.slice().buffer
  }
  // If it's already a typed array with a buffer
  if (buf?.buffer instanceof ArrayBuffer) {
    return buf.buffer.slice(0)
  }
  return buf
}

function documentParams(pdfBytes, options = {}) {
  const params = { data: copyBuffer(pdfBytes) }
  if (options.password) params.password = options.password
  return params
}

function loadPdfDocument(loadingTask) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      try {
        loadingTask.destroy()
      } catch (_) {
        // The timeout error below is the useful failure for callers.
      }
      reject(new Error('PDF engine timed out while opening this file. Please refresh and try again.'))
    }, PDF_LOAD_TIMEOUT_MS)
  })

  return Promise.race([loadingTask.promise, timeout])
    .finally(() => window.clearTimeout(timeoutId))
}

async function getCachedPdfDocument(pdfBytes, options = {}) {
  if (!(pdfBytes instanceof Uint8Array)) {
    return loadPdfDocument(pdfjsLib.getDocument(documentParams(pdfBytes, options)))
  }

  let entry = documentCache.get(pdfBytes)
  const passwordKey = options.password || '__default__'

  if (!entry) {
    entry = {}
    documentCache.set(pdfBytes, entry)
  }

  if (!entry[passwordKey]) {
    const loadingTask = pdfjsLib.getDocument(documentParams(pdfBytes, options))
    const cached = {
      loadingTask,
      promise: null,
      bytes: pdfBytes,
      passwordKey,
    }
    cached.promise = loadPdfDocument(loadingTask).catch((error) => {
      if (entry[passwordKey] === cached) delete entry[passwordKey]
      const orderIndex = cachedDocumentOrder.indexOf(cached)
      if (orderIndex >= 0) cachedDocumentOrder.splice(orderIndex, 1)
      throw error
    })
    entry[passwordKey] = cached
    cachedDocumentOrder.push(cached)
    while (cachedDocumentOrder.length > MAX_CACHED_DOCUMENTS) {
      const stale = cachedDocumentOrder.shift()
      if (!stale) continue
      try {
        stale.loadingTask.destroy()
      } catch (_) {
        // Ignore cleanup failures when evicting cached documents.
      }
    }
  }

  return entry[passwordKey].promise
}

export function cleanupPdfDocument(pdfBytes, options = {}) {
  if (!(pdfBytes instanceof Uint8Array)) return
  const entry = documentCache.get(pdfBytes)
  if (!entry) return
  const passwordKey = options.password || '__default__'
  const cached = entry[passwordKey]
  if (!cached) return

  try {
    cached.loadingTask.destroy()
  } catch (_) {
    // Ignore cleanup failures during explicit document release.
  }
  delete entry[passwordKey]
}

function paintCanvasBackground(ctx, viewport, format) {
  if (format === 'image/jpeg') {
    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, viewport.width, viewport.height)
    ctx.restore()
  }
}

/**
 * Render a single PDF page to a canvas element
 */
export async function renderPageToCanvas(pdfBytes, pageNum, canvas, scale = 1.5) {
  const inFlightRender = activeCanvasRenders.get(canvas)
  if (inFlightRender) {
    try {
      inFlightRender.cancel()
      await inFlightRender.promise.catch(() => {})
    } catch (_) {
      // Ignore cancellation failures; a fresh render starts below.
    }
  }

  const pdf = await getCachedPdfDocument(pdfBytes)
  const page = await pdf.getPage(pageNum)
  const dpr = window.devicePixelRatio || 1
  const viewport = page.getViewport({ scale: scale * dpr })
  
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.width = `${viewport.width / dpr}px`
  canvas.style.height = `${viewport.height / dpr}px`
  
  const ctx = canvas.getContext('2d')
  const renderTask = page.render({ canvasContext: ctx, viewport })
  activeCanvasRenders.set(canvas, renderTask)
  try {
    await renderTask.promise
  } finally {
    if (activeCanvasRenders.get(canvas) === renderTask) {
      activeCanvasRenders.delete(canvas)
    }
  }
  
  return { width: viewport.width / dpr, height: viewport.height / dpr }
}

/**
 * Generate thumbnail for a page
 */
export async function generateThumbnail(pdfBytes, pageNum, maxWidth = 200) {
  const queuedTask = thumbnailQueue.catch(() => {}).then(async () => {
    const pdf = await getCachedPdfDocument(pdfBytes)
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1 })
    const scale = maxWidth / viewport.width
    const scaledViewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = scaledViewport.width
    canvas.height = scaledViewport.height

    const ctx = canvas.getContext('2d')
    paintCanvasBackground(ctx, scaledViewport, 'image/jpeg')
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise

    return canvas.toDataURL('image/jpeg', 0.8)
  })

  thumbnailQueue = queuedTask.then(() => undefined, () => undefined)
  return queuedTask
}

/**
 * Generate thumbnails for all pages
 */
export async function generateAllThumbnails(pdfBytes, maxWidth = 200, onProgress) {
  const pdf = await getCachedPdfDocument(pdfBytes)
  const thumbnails = []
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const scale = maxWidth / viewport.width
    const scaledViewport = page.getViewport({ scale })
    
    const canvas = document.createElement('canvas')
    canvas.width = scaledViewport.width
    canvas.height = scaledViewport.height
    
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise
    
    thumbnails.push({
      pageNum: i,
      dataUrl: canvas.toDataURL('image/jpeg', 0.8),
      width: scaledViewport.width,
      height: scaledViewport.height,
    })
    
    if (onProgress) onProgress(i, pdf.numPages)
  }
  
  return thumbnails
}

/**
 * Extract text from a PDF page
 */
export async function extractPageText(pdfBytes, pageNum) {
  const pdf = await getCachedPdfDocument(pdfBytes)
  const page = await pdf.getPage(pageNum)
  const textContent = await page.getTextContent()
  
  return textContent.items
    .map(item => item.str)
    .join(' ')
}

/**
 * Get raw text items from PDF.js with precise positions and widths.
 * Each item: { str, x, y, width, height, fontSize, fontName }
 * Used by the redaction engine for content-stream surgery.
 */
export async function getRawTextItems(pdfBytes, pageNum) {
  const pdf = await getCachedPdfDocument(pdfBytes)
  const page = await pdf.getPage(pageNum)
  const textContent = await page.getTextContent()
  return textContent.items
    .filter(item => item.str != null)
    .map(item => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width || 0,
      height: Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 12,
      fontSize: Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 12,
      fontName: item.fontName || '',
      hasEOL: !!item.hasEOL,
    }))
}

/**
 * Extract all text from PDF
 */
export async function extractAllText(pdfBytes, onProgress) {
  const pdf = await getCachedPdfDocument(pdfBytes)
  const pages = []
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const text = textContent.items.map(item => item.str).join(' ')
    pages.push({ pageNum: i, text })
    if (onProgress) onProgress(i, pdf.numPages)
  }
  
  return pages
}

/**
 * Render page to image blob
 */
export async function renderPageToBlob(pdfBytes, pageNum, scale = 2, format = 'image/jpeg', quality = 0.92, options = {}) {
  const pdf = await getCachedPdfDocument(pdfBytes, options)
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  
  const ctx = canvas.getContext('2d')
  paintCanvasBackground(ctx, viewport, format)
  await page.render({ canvasContext: ctx, viewport }).promise
  
  return new Promise((resolve) => {
    canvas.toBlob(resolve, format, quality)
  })
}

/**
 * Get PDF page count without loading full document
 */
export async function getPageCount(pdfBytes) {
  const pdf = await getCachedPdfDocument(pdfBytes)
  return pdf.numPages
}

export async function getPageCountWithPassword(pdfBytes, password) {
  const pdf = await getCachedPdfDocument(pdfBytes, { password })
  return pdf.numPages
}

/**
 * Extract structured text blocks with bounding boxes from a PDF page
 * Returns positioned text items for editing
 */
export async function getTextBlocks(pdfBytes, pageNum) {
  const pdf = await getCachedPdfDocument(pdfBytes)
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale: 1.0 })
  const textContent = await page.getTextContent()

  const items = textContent.items
    .filter(item => item.str && item.str.trim().length > 0)
    .map(item => {
      // transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const tx = item.transform[4]
      const ty = item.transform[5]
      const fontSize = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 12
      const fontName = item.fontName || 'Helvetica'

      // PDF coords: origin bottom-left. Convert ty to top-down for canvas
      const canvasY = viewport.height - ty

      return {
        str: item.str,
        x: tx,
        y: ty, // PDF coords (bottom-left origin)
        canvasX: tx,
        canvasY: canvasY - fontSize, // top-left of text in canvas coords
        width: item.width || (item.str.length * fontSize * 0.6),
        height: fontSize * 1.2,
        fontSize,
        fontName,
        transform: item.transform,
      }
    })

  // Group items into editable blocks using both baseline alignment and
  // horizontal gap heuristics so tables/cells don't collapse into a whole row.
  const tolerance = 3
  const lines = []
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x) // top to bottom, left to right

  for (const item of sorted) {
    let addedToLine = false
    for (const line of lines) {
      if (Math.abs(line.y - item.y) <= tolerance) {
        const lastItem = line.items[line.items.length - 1]
        const horizontalGap = item.x - (lastItem.x + lastItem.width)
        const sameBlockThreshold = Math.max(lastItem.fontSize, item.fontSize) * 0.9

        if (horizontalGap <= sameBlockThreshold) {
          line.items.push(item)
          line.text += item.str
          line.width = Math.max(line.x + line.width, item.x + item.width) - Math.min(line.x, item.x)
          line.x = Math.min(line.x, item.x)
          addedToLine = true
          break
        }
      }
    }
    if (!addedToLine) {
      lines.push({
        text: item.str,
        x: item.x,
        y: item.y,
        canvasX: item.canvasX,
        canvasY: item.canvasY,
        width: item.width,
        height: item.height,
        fontSize: item.fontSize,
        fontName: item.fontName,
        items: [item],
      })
    }
  }

  // Sort lines by reading order (top to bottom)
  lines.sort((a, b) => b.y - a.y)

  // Re-build text for each line from sorted items
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x)
    const rebuilt = []
    for (let i = 0; i < line.items.length; i++) {
      const current = line.items[i]
      const previous = line.items[i - 1]
      if (previous) {
        const previousRight = previous.x + previous.width
        const gap = current.x - previousRight
        const fontGapThreshold = Math.max(previous.fontSize, current.fontSize) * 0.2
        if (gap > fontGapThreshold && !/^[,.;:!?)]/.test(current.str)) {
          rebuilt.push(' ')
        }
      }
      rebuilt.push(current.str)
    }
    line.text = rebuilt.join('')
  }

  return {
    lines,
    pageWidth: viewport.width,
    pageHeight: viewport.height,
    hasText: items.length > 0,
    itemCount: items.length,
  }
}

/**
 * Render a page to a data URL (for OCR input)
 */
export async function renderPageToDataUrl(pdfBytes, pageNum, scale = 2.0, format = 'image/png', quality = 0.92, options = {}) {
  const pdf = await getCachedPdfDocument(pdfBytes, options)
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height

  const ctx = canvas.getContext('2d')
  paintCanvasBackground(ctx, viewport, format)
  await page.render({ canvasContext: ctx, viewport }).promise

  return {
    dataUrl: canvas.toDataURL(format, quality),
    width: viewport.width,
    height: viewport.height,
    pageWidth: viewport.width / scale,
    pageHeight: viewport.height / scale,
  }
}

export async function renderPageToDataUrlWithPassword(pdfBytes, pageNum, password, scale = 2.0, format = 'image/jpeg', quality = 0.92) {
  return renderPageToDataUrl(pdfBytes, pageNum, scale, format, quality, { password })
}

/**
 * Helper to convert PDF.js image object to a Data URL
 */
function imgObjToDataUrl(imgObj) {
  if (!imgObj) return null
  try {
    if (imgObj instanceof HTMLImageElement || imgObj instanceof HTMLCanvasElement || imgObj instanceof Image) {
      const canvas = document.createElement('canvas')
      canvas.width = imgObj.width
      canvas.height = imgObj.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(imgObj, 0, 0)
      return canvas.toDataURL('image/png')
    }
    
    if (imgObj.data && imgObj.width && imgObj.height) {
      const canvas = document.createElement('canvas')
      canvas.width = imgObj.width
      canvas.height = imgObj.height
      const ctx = canvas.getContext('2d')
      
      const imgData = ctx.createImageData(imgObj.width, imgObj.height)
      const data = imgData.data
      const srcData = imgObj.data
      
      if (srcData.length === imgObj.width * imgObj.height * 4) {
        data.set(srcData)
      } else if (srcData.length === imgObj.width * imgObj.height * 3) {
        let j = 0
        for (let i = 0; i < srcData.length; i += 3) {
          data[j] = srcData[i]
          data[j+1] = srcData[i+1]
          data[j+2] = srcData[i+2]
          data[j+3] = 255
          j += 4
        }
      } else if (srcData.length === imgObj.width * imgObj.height) {
        let j = 0
        for (let i = 0; i < srcData.length; i++) {
          const val = srcData[i]
          data[j] = val
          data[j+1] = val
          data[j+2] = val
          data[j+3] = 255
          j += 4
        }
      } else {
        for (let i = 0, j = 0; i < srcData.length && j < data.length; i++, j++) {
          data[j] = srcData[i]
        }
      }
      
      ctx.putImageData(imgData, 0, 0)
      return canvas.toDataURL('image/png')
    }
  } catch (err) {
    console.error('Error converting image object to data url:', err)
  }
  return null
}

/**
 * Get native images embedded on a PDF page with coordinates and source URL
 */
export async function getPageImages(pdfBytes, pageNum) {
  try {
    const pdf = await getCachedPdfDocument(pdfBytes)
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.0 })
    
    // Trigger operator list parsing
    const ops = await page.getOperatorList()
    const fnArray = ops.fnArray
    const argsArray = ops.argsArray
    
    // Trigger dummy render to load image objs asynchronously into page.objs
    const dummyCanvas = document.createElement('canvas')
    dummyCanvas.width = 1
    dummyCanvas.height = 1
    const dummyCtx = dummyCanvas.getContext('2d')
    await page.render({
      canvasContext: dummyCtx,
      viewport: page.getViewport({ scale: 0.05 })
    }).promise
    
    const images = []
    const ctmStack = []
    let currentCtm = [1, 0, 0, 1, 0, 0] // Identity
    
    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i]
      const args = argsArray[i]
      
      if (fn === pdfjsLib.OPS.save) {
        ctmStack.push([...currentCtm])
      } else if (fn === pdfjsLib.OPS.restore) {
        if (ctmStack.length > 0) {
          currentCtm = ctmStack.pop()
        }
      } else if (fn === pdfjsLib.OPS.transform) {
        const [a1, b1, c1, d1, e1, f1] = args
        const [a0, b0, c0, d0, e0, f0] = currentCtm
        currentCtm = [
          a0 * a1 + c0 * b1,
          b0 * a1 + d0 * b1,
          a0 * c1 + c0 * d1,
          b0 * c1 + d0 * d1,
          a0 * e1 + c0 * f1 + e0,
          b0 * e1 + d0 * f1 + f0
        ]
      } else if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject) {
        const imgName = args[0]
        let imgObj = null
        try {
          imgObj = page.objs.get(imgName)
        } catch (err) {
          console.warn('Failed to resolve image obj:', imgName, err)
        }
        
        const dataUrl = imgObjToDataUrl(imgObj)
        if (dataUrl) {
          const [a, b, c, d, e, f] = currentCtm
          const w = Math.sqrt(a * a + b * b)
          const h = Math.sqrt(c * c + d * d)
          const x = e
          const y = f
          
          // PDF coordinates have origin at bottom-left
          // For canvas: top-down, so canvasY = pageHeight - y - height
          const canvasY = viewport.height - y - h
          
          images.push({
            id: imgName,
            src: dataUrl,
            x, // PDF coords
            y, // PDF coords
            width: w,
            height: h,
            canvasX: x,
            canvasY: canvasY
          })
        }
      }
    }
    
    return images
  } catch (err) {
    console.error('Error getting page images:', err)
    return []
  }
}
