import { PDFDocument, StandardFonts, rgb, degrees, PageSizes, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'
import jsPDF from 'jspdf'
import {
  renderPageToDataUrl,
  renderPageToDataUrlWithPassword,
  getPageCountWithPassword,
  getRawTextItems,
} from './pdfRenderer'
import { isEncryptedPdfBytes, normalizePdfForRewrite } from '../utils/qpdfNormalize'

function markPdfOmniDocument(doc) {
  try {
    doc.setProducer?.('PDFOmni pdf-lib')
    doc.setCreator?.('PDFOmni')
  } catch {
    // Metadata tagging is best-effort; never block a PDF operation on it.
  }
  return doc
}

async function savePdfOmniDocument(doc, options) {
  markPdfOmniDocument(doc)
  return await doc.save(options)
}

export function isEncryptedPdf(pdfBytes) {
  return isEncryptedPdfBytes(pdfBytes)
}

async function loadPdfForRewrite(pdfBytes) {
  const normalizedBytes = await normalizePdfForRewrite(pdfBytes)
  return await PDFDocument.load(normalizedBytes, { ignoreEncryption: false, updateMetadata: false })
}

async function appendPdfBytesToDocument(targetDoc, sourceBytes) {
  const source = await loadPdfForRewrite(sourceBytes)
  const indices = source.getPageIndices()
  const chunkSize = 5

  for (let start = 0; start < indices.length; start += chunkSize) {
    const chunk = indices.slice(start, start + chunkSize)
    const pages = await targetDoc.copyPages(source, chunk)
    pages.forEach((page, idx) => {
      try {
        const sourcePage = source.getPage(chunk[idx])
        const { width, height } = sourcePage.getSize()
        page.setSize(width, height)
        page.setMediaBox(0, 0, width, height)
        page.setCropBox(0, 0, width, height)
        page.setRotation(sourcePage.getRotation())
        const userUnit = sourcePage.node.get(PDFName.of('UserUnit'))
        if (userUnit) page.node.set(PDFName.of('UserUnit'), userUnit)
      } catch {
        // Keep merging robust for PDFs with unusual page dictionaries.
      }
      targetDoc.addPage(page)
    })
  }
}

/**
 * PDFOmni Core Engine — All PDF manipulation using pdf-lib
 * Runs in main thread or Web Worker context
 */

// ─── Merge ───
export async function mergePDFs(pdfBytesArray) {
  const merged = await PDFDocument.create()
  for (const bytes of pdfBytesArray) {
    await appendPdfBytesToDocument(merged, bytes)
  }
  return await savePdfOmniDocument(merged)
}

export async function mergePDFFiles(files, onProgress) {
  const merged = await PDFDocument.create()
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length)
    const bytes = await files[i].arrayBuffer()
    await appendPdfBytesToDocument(merged, bytes)
  }
  onProgress?.(files.length, files.length)
  return await savePdfOmniDocument(merged)
}

// ─── Split ───
export async function splitPDF(pdfBytes, ranges) {
  // ranges: array of { start, end } (1-indexed, inclusive)
  const source = await loadPdfForRewrite(pdfBytes)
  const results = []
  
  for (const range of ranges) {
    const newDoc = await PDFDocument.create()
    const indices = []
    for (let i = range.start - 1; i < Math.min(range.end, source.getPageCount()); i++) {
      indices.push(i)
    }
    const pages = await newDoc.copyPages(source, indices)
    pages.forEach(p => newDoc.addPage(p))
    results.push({
      name: `pages_${range.start}-${range.end}.pdf`,
      bytes: await savePdfOmniDocument(newDoc)
    })
  }
  
  return results
}

// ─── Split into individual pages ───
export async function splitIntoPages(pdfBytes) {
  const source = await loadPdfForRewrite(pdfBytes)
  const results = []
  
  for (let i = 0; i < source.getPageCount(); i++) {
    const newDoc = await PDFDocument.create()
    const [page] = await newDoc.copyPages(source, [i])
    newDoc.addPage(page)
    results.push({
      name: `page_${i + 1}.pdf`,
      bytes: await savePdfOmniDocument(newDoc)
    })
  }
  
  return results
}

// ─── Extract pages by indices ───
export async function extractPages(pdfBytes, pageIndices) {
  const source = await loadPdfForRewrite(pdfBytes)
  const newDoc = await PDFDocument.create()
  const pages = await newDoc.copyPages(source, pageIndices)
  pages.forEach(p => newDoc.addPage(p))
  return await savePdfOmniDocument(newDoc)
}

// ─── Remove pages ───
export async function removePages(pdfBytes, pageIndicesToRemove) {
  const source = await loadPdfForRewrite(pdfBytes)
  const allIndices = source.getPageIndices()
  const keepIndices = allIndices.filter(i => !pageIndicesToRemove.includes(i))
  const newDoc = await PDFDocument.create()
  const pages = await newDoc.copyPages(source, keepIndices)
  pages.forEach(p => newDoc.addPage(p))
  return await savePdfOmniDocument(newDoc)
}

// ─── Reorder pages ───
export async function reorderPages(pdfBytes, newOrder) {
  // newOrder: array of 0-indexed page numbers in desired order
  const source = await loadPdfForRewrite(pdfBytes)
  const newDoc = await PDFDocument.create()
  const pages = await newDoc.copyPages(source, newOrder)
  pages.forEach(p => newDoc.addPage(p))
  return await savePdfOmniDocument(newDoc)
}

// ─── Rotate pages ───
export async function rotatePages(pdfBytes, rotations) {
  // rotations: { pageIndex: degrees } or array of { index, degrees }
  const doc = await loadPdfForRewrite(pdfBytes)
  
  if (Array.isArray(rotations)) {
    for (const { index, degrees: deg } of rotations) {
      const page = doc.getPage(index)
      const current = page.getRotation().angle
      page.setRotation(degrees(current + deg))
    }
  } else {
    for (const [index, deg] of Object.entries(rotations)) {
      const page = doc.getPage(parseInt(index))
      const current = page.getRotation().angle
      page.setRotation(degrees(current + deg))
    }
  }
  
  return await savePdfOmniDocument(doc)
}

// ─── Add page numbers ───
export async function addPageNumbers(pdfBytes, options = {}) {
  const {
    position = 'bottom-center', // bottom-left, bottom-center, bottom-right, top-left, top-center, top-right
    startNumber = 1,
    fontSize = 11,
    margin = 40,
    format = '{n}', // {n} = page num, {total} = total pages
    color = { r: 0.4, g: 0.4, b: 0.4 },
    skipFirst = false,
  } = options
  
  const doc = await loadPdfForRewrite(pdfBytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const totalPages = doc.getPageCount()
  
  for (let i = 0; i < totalPages; i++) {
    if (skipFirst && i === 0) continue
    
    const page = doc.getPage(i)
    const { width, height } = page.getSize()
    const pageNum = startNumber + (skipFirst ? i - 1 : i)
    
    let text = format.replace('{n}', pageNum).replace('{total}', totalPages)
    const textWidth = font.widthOfTextAtSize(text, fontSize)
    
    let x, y
    
    if (position.includes('bottom')) {
      y = margin
    } else {
      y = height - margin
    }
    
    if (position.includes('left')) {
      x = margin
    } else if (position.includes('right')) {
      x = width - margin - textWidth
    } else {
      x = (width - textWidth) / 2
    }
    
    page.drawText(text, {
      x, y,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
    })
  }
  
  return await savePdfOmniDocument(doc)
}

// ─── Add watermark ───
export async function addWatermark(pdfBytes, options = {}) {
  const {
    text = 'WATERMARK',
    fontSize = 60,
    opacity = 0.15,
    rotation = -45,
    color = { r: 0.5, g: 0.5, b: 0.5 },
    pages = null, // null = all pages, or array of indices
    xPercent = 50,
    yPercent = 50,
  } = options
  
  const doc = await loadPdfForRewrite(pdfBytes)
  const pageIndices = pages || doc.getPageIndices()

  const colorString = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`
  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')
  measureCtx.font = `700 ${fontSize}px Helvetica, Arial, sans-serif`
  const textWidth = Math.ceil(measureCtx.measureText(text).width)
  const textHeight = Math.ceil(fontSize * 1.1)
  const padding = Math.max(24, Math.round(fontSize * 0.8))
  const baseWidth = textWidth + padding * 2
  const baseHeight = textHeight + padding * 2
  const radians = rotation * (Math.PI / 180)
  const rotatedWidth = Math.ceil(
    Math.abs(baseWidth * Math.cos(radians)) + Math.abs(baseHeight * Math.sin(radians))
  )
  const rotatedHeight = Math.ceil(
    Math.abs(baseWidth * Math.sin(radians)) + Math.abs(baseHeight * Math.cos(radians))
  )
  const pixelScale = 2
  const watermarkCanvas = document.createElement('canvas')
  watermarkCanvas.width = Math.max(1, rotatedWidth * pixelScale)
  watermarkCanvas.height = Math.max(1, rotatedHeight * pixelScale)
  const watermarkCtx = watermarkCanvas.getContext('2d')
  watermarkCtx.scale(pixelScale, pixelScale)
  watermarkCtx.translate(rotatedWidth / 2, rotatedHeight / 2)
  watermarkCtx.rotate(radians)
  watermarkCtx.globalAlpha = opacity
  watermarkCtx.fillStyle = colorString
  watermarkCtx.font = `700 ${fontSize}px Helvetica, Arial, sans-serif`
  watermarkCtx.textAlign = 'center'
  watermarkCtx.textBaseline = 'middle'
  watermarkCtx.fillText(text, 0, 0)
  const watermarkBytes = await fetch(watermarkCanvas.toDataURL('image/png')).then((r) => r.arrayBuffer())
  const watermarkImage = await doc.embedPng(watermarkBytes)
  
  for (const i of pageIndices) {
    const page = doc.getPage(i)
    const { width, height } = page.getSize()
    const x = (width * xPercent / 100) - (rotatedWidth / 2)
    const y = height - (height * yPercent / 100) - (rotatedHeight / 2)

    page.drawImage(watermarkImage, {
      x,
      y,
      width: rotatedWidth,
      height: rotatedHeight,
    })
  }
  
  return await savePdfOmniDocument(doc)
}

// --- Compression helpers ---

function compressionSettingsForTarget(pct) {
  const originalDim = Number.POSITIVE_INFINITY;
  const qualityRamp = pct >= 75
    ? [0.99, 0.98, 0.965, 0.95, 0.93, 0.9, 0.86, 0.82]
    : pct >= 50
      ? [0.99, 0.97, 0.95, 0.93, 0.9, 0.86, 0.82, 0.77, 0.72]
      : pct >= 30
        ? [0.98, 0.95, 0.92, 0.88, 0.84, 0.78, 0.72, 0.65, 0.58, 0.5]
        : [0.94, 0.9, 0.86, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4, 0.32];

  const downsampleRamp = pct >= 75
    ? [4200, 3600, 3200, 2800, 2400]
    : pct >= 50
      ? [4200, 3600, 3200, 2800, 2400, 2000, 1700, 1400]
      : pct >= 30
        ? [3600, 3000, 2600, 2200, 1800, 1500, 1200, 950]
        : [2800, 2400, 2000, 1700, 1400, 1150, 900, 700, 520];

  const settings = qualityRamp.map((quality) => ({ quality, maxDim: originalDim, includeNonJpeg: false }));
  const baseQuality = Math.min(0.96, Math.max(0.42, qualityRamp[Math.floor(qualityRamp.length * 0.65)] ?? 0.75));
  for (const maxDim of downsampleRamp) {
    settings.push({ quality: Math.min(0.98, baseQuality + 0.08), maxDim, includeNonJpeg: false });
    settings.push({ quality: baseQuality, maxDim, includeNonJpeg: false });
  }
  if (pct < 35) {
    for (const maxDim of downsampleRamp.slice(2)) {
      settings.push({ quality: Math.max(0.48, baseQuality), maxDim, includeNonJpeg: true });
    }
  }
  return settings;
}

function chooseClosestCompressedCandidate(candidates, targetSize) {
  const usableUnder = candidates
    .filter((candidate) => candidate.bytes.length <= targetSize * 1.01)
    .sort((a, b) => b.bytes.length - a.bytes.length)[0];
  if (usableUnder) return usableUnder.bytes;

  return candidates
    .slice()
    .sort((a, b) => Math.abs(a.bytes.length - targetSize) - Math.abs(b.bytes.length - targetSize))[0]?.bytes;
}

const MAX_COMPRESSION_CANVAS_PIXELS = 24_000_000;

async function recompressImage(imageBytes, mimeType, jpegQuality, maxDim) {
  try {
    const arr = imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength);
    const blob = new Blob([arr], { type: mimeType });

    let bitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      return null;
    }

    let w = bitmap.width;
    let h = bitmap.height;
    if (w === 0 || h === 0) {
      bitmap.close();
      return null;
    }

    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    if (w * h > MAX_COMPRESSION_CANVAS_PIXELS) {
      const ratio = Math.sqrt(MAX_COMPRESSION_CANVAS_PIXELS / (w * h));
      w = Math.max(1, Math.round(w * ratio));
      h = Math.max(1, Math.round(h * ratio));
    }

    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!canvas) {
      bitmap.close();
      return null;
    }
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }

    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    let outBlob;
    if (canvas.convertToBlob) {
      outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });
    } else {
      outBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', jpegQuality));
    }
    const arrayBuffer = await outBlob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch {
    return null;
  }
}

function detectMime(bytes) {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x47) return 'image/webp';
  return null;
}

function collectImageStreams(pdfDoc) {
  const results = [];
  for (const [, pdfObject] of pdfDoc.context.enumerateIndirectObjects()) {
    if (!(pdfObject instanceof PDFRawStream)) continue;

    const dict = pdfObject.dict;
    const subtype = dict.get(PDFName.of('Subtype'));
    if (!subtype || subtype.toString() !== '/Image') continue;

    const rawBytes = pdfObject.contents;
    const filterVal = dict.get(PDFName.of('Filter'));
    const filterStr = filterVal?.toString() ?? '';

    if (filterStr.includes('CCITTFaxDecode') || filterStr.includes('JBIG2Decode')) {
      continue;
    }

    let mime;
    const isJpeg = filterStr.includes('DCTDecode') || filterStr.includes('JPXDecode');
    if (isJpeg) {
      mime = 'image/jpeg';
    } else {
      mime = detectMime(rawBytes) ?? 'image/png';
    }

    results.push({ stream: pdfObject, bytes: rawBytes, mime, isJpeg });
  }
  return results;
}

function setStreamContents(stream, newBytes) {
  stream.contents = newBytes;
}

// ─── Compress (Iterative image compression) ───
export async function compressPDF(pdfBytes, quality = 0.6) {
  pdfBytes = await normalizePdfForRewrite(pdfBytes)

  let targetPct = 65;
  if (typeof quality === 'number') {
    targetPct = Math.round(quality * 100);
  } else if (quality && typeof quality.targetBytes === 'number') {
    targetPct = Math.round((quality.targetBytes / pdfBytes.byteLength) * 100);
  }
  targetPct = Math.min(90, Math.max(15, targetPct));

  const originalSize = pdfBytes.byteLength;
  const targetSize = originalSize * (targetPct / 100);

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch (err) {
    const msg = String(err).toLowerCase();
    if (msg.includes('encrypt') || msg.includes('password')) throw new Error('PASSWORD_PROTECTED', { cause: err });
    throw new Error('CORRUPTED_PDF', { cause: err });
  }

  // Strip metadata & unused objects
  try {
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');

    const catalog = pdfDoc.catalog;
    if (catalog.has(PDFName.of('Metadata'))) catalog.delete(PDFName.of('Metadata'));

    for (const page of pdfDoc.getPages()) {
      const node = page.node;
      if (node.has(PDFName.of('Thumb')))     node.delete(PDFName.of('Thumb'));
      if (node.has(PDFName.of('PieceInfo'))) node.delete(PDFName.of('PieceInfo'));
    }
  } catch { /* best effort */ }

  const saveAndMeasure = async () => {
    return savePdfOmniDocument(pdfDoc, { useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  };

  let currentBytes = await saveAndMeasure();
  if (currentBytes.length <= targetSize) {
    return currentBytes;
  }

  const baselineBytes = currentBytes;
  const settings = compressionSettingsForTarget(targetPct);
  const candidates = [{ bytes: currentBytes }];
  let iteration = 0;
  const passes = [{ pass: 0, size: currentBytes.length }];

  while (iteration < settings.length && currentBytes.length > targetSize * 1.01) {
    const { quality: jpegQuality, maxDim, includeNonJpeg } = settings[iteration];

    try {
      pdfDoc = await PDFDocument.load(baselineBytes, { updateMetadata: false });
    } catch {
      break;
    }

    const imageStreams = collectImageStreams(pdfDoc);
    for (const { stream, bytes, mime, isJpeg } of imageStreams) {
      if (!isJpeg && !includeNonJpeg) continue;
      const recompressed = await recompressImage(bytes, mime, jpegQuality, maxDim);
      if (recompressed && recompressed.length < bytes.length * 0.985) {
        try {
          stream.dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
          stream.dict.delete(PDFName.of('DecodeParms'));
          setStreamContents(stream, recompressed);
        } catch { /* skip */ }
      }
    }

    try {
      currentBytes = await saveAndMeasure();
    } catch {
      break;
    }

    passes.push({ pass: iteration + 1, size: currentBytes.length });
    candidates.push({ bytes: currentBytes });
    if (currentBytes.length <= targetSize * 1.01 && currentBytes.length >= targetSize * 0.95) break;

    iteration++;
  }

  currentBytes = chooseClosestCompressedCandidate(candidates, targetSize) ?? currentBytes;

  try {
    pdfDoc = await PDFDocument.load(currentBytes, { updateMetadata: false });
    currentBytes = await savePdfOmniDocument(pdfDoc, { useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  } catch { /* keep previous */ }

  return currentBytes;
}

// ─── Encrypt ───
export async function encryptPDF(pdfBytes, userPassword, ownerPassword) {
  if (!userPassword) throw new Error('Password is required.')
  const info = await getPDFInfo(pdfBytes)
  if (info.error || info.pageCount === 0) throw new Error(info.error || 'Could not read PDF pages.')

  let pdf = null
  for (let i = 0; i < info.pageCount; i++) {
    const pageInfo = info.pages[i]
    const orientation = pageInfo.width > pageInfo.height ? 'l' : 'p'
    const data = await renderPageToDataUrl(pdfBytes, i + 1, 2, 'image/jpeg', 0.9)
    if (!pdf) {
      pdf = new jsPDF({
        orientation,
        unit: 'pt',
        format: [pageInfo.width, pageInfo.height],
        compress: true,
        encryption: {
          userPassword,
          ownerPassword: ownerPassword || userPassword,
          userPermissions: [],
        },
      })
    } else {
      pdf.addPage([pageInfo.width, pageInfo.height], orientation)
    }
    pdf.setPage(i + 1)
    pdf.addImage(data.dataUrl, 'JPEG', 0, 0, pageInfo.width, pageInfo.height)
  }

  return new Uint8Array(pdf.output('arraybuffer'))
}

export async function decryptPDF(pdfBytes, password = '') {
  try {
    const doc = await PDFDocument.load(pdfBytes)
    return await savePdfOmniDocument(doc, { useObjectStreams: true, addDefaultPage: false })
  } catch {
    // Encrypted PDFs are rendered locally with PDF.js and rebuilt without encryption.
  }

  const pageCount = await getPageCountWithPassword(pdfBytes, password)
  const sourceInfo = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
    .then((doc) => doc.getPages().map((page) => page.getSize()))
    .catch(() => [])

  const out = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    const size = sourceInfo[i] || { width: 612, height: 792 }
    const rendered = await renderPageToDataUrlWithPassword(pdfBytes, i + 1, password, 2, 'image/jpeg', 0.9)
    const imageBytes = await fetch(rendered.dataUrl).then((r) => r.arrayBuffer())
    const image = await out.embedJpg(imageBytes)
    const page = out.addPage([size.width, size.height])
    page.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height })
  }

  return await savePdfOmniDocument(out, { useObjectStreams: true, addDefaultPage: false })
}

// ─── Add text annotation ───
export async function addTextToPDF(pdfBytes, annotations) {
  // annotations: [{ pageIndex, x, y, text, fontSize, color, fontName }]
  const doc = await loadPdfForRewrite(pdfBytes)
  
  for (const ann of annotations) {
    const page = doc.getPage(ann.pageIndex)
    const font = await doc.embedFont(
      StandardFonts[ann.fontName] || StandardFonts.Helvetica
    )
    
    page.drawText(ann.text, {
      x: ann.x,
      y: ann.y,
      size: ann.fontSize || 14,
      font,
      color: rgb(
        (ann.color?.r ?? 0) / 255,
        (ann.color?.g ?? 0) / 255,
        (ann.color?.b ?? 0) / 255
      ),
    })
  }
  
  return await savePdfOmniDocument(doc)
}

// ─── Add image to PDF ───
export async function addImageToPDF(pdfBytes, imageBytes, options) {
  const { pageIndex = 0, x, y, width, height, type = 'png' } = options
  const doc = await loadPdfForRewrite(pdfBytes)
  
  let image
  if (type === 'png') {
    image = await doc.embedPng(imageBytes)
  } else {
    image = await doc.embedJpg(imageBytes)
  }
  
  const page = doc.getPage(pageIndex)
  const dims = image.scale(1)
  
  page.drawImage(image, {
    x: x ?? 50,
    y: y ?? 50,
    width: width ?? dims.width,
    height: height ?? dims.height,
  })
  
  return await savePdfOmniDocument(doc)
}

// ─── Crop pages ───
export async function cropPages(pdfBytes, cropBox, pageIndices) {
  const doc = await loadPdfForRewrite(pdfBytes)
  const indices = pageIndices || doc.getPageIndices()

  for (const i of indices) {
    const page = doc.getPage(i)
    const pageSpecificBox = Array.isArray(cropBox)
      ? cropBox[i]
      : cropBox?.[i] || cropBox

    if (!pageSpecificBox) continue

    page.setCropBox(
      pageSpecificBox.x,
      pageSpecificBox.y,
      pageSpecificBox.width,
      pageSpecificBox.height
    )
  }
  
  return await savePdfOmniDocument(doc)
}

// ─── Get PDF info ───
export async function getPDFInfo(pdfBytes) {
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
    const pages = []
    for (let i = 0; i < doc.getPageCount(); i++) {
      const page = doc.getPage(i)
      const { width, height } = page.getSize()
      pages.push({ width, height, rotation: page.getRotation().angle })
    }
    
    return {
      pageCount: doc.getPageCount(),
      title: doc.getTitle() || '',
      author: doc.getAuthor() || '',
      subject: doc.getSubject() || '',
      creator: doc.getCreator() || '',
      pages,
    }
  } catch (e) {
    return { error: e.message, pageCount: 0, pages: [] }
  }
}

// ─── Create PDF from images ───
export async function imagesToPDF(images, options = {}) {
  const { pageSize = 'image', fitToPage = false } = options
  const doc = await PDFDocument.create()
  
  for (const img of images) {
    let embedded
    
    if (img.type === 'image/png' || img.name?.endsWith('.png')) {
      embedded = await doc.embedPng(img.bytes)
    } else {
      embedded = await doc.embedJpg(img.bytes)
    }

    let pw, ph
    if (pageSize === 'image') {
      const targetArea = 1920 * 1080
      const currentArea = embedded.width * embedded.height
      const scaleDown = currentArea > targetArea ? Math.sqrt(targetArea / currentArea) : 1
      pw = Math.max(1, Math.round(embedded.width * scaleDown))
      ph = Math.max(1, Math.round(embedded.height * scaleDown))
    } else {
      ;[pw, ph] = PageSizes[pageSize] || PageSizes.A4
    }

    const page = doc.addPage([pw, ph])
    
    if (fitToPage) {
      const scale = Math.min(pw / embedded.width, ph / embedded.height)
      const w = embedded.width * scale
      const h = embedded.height * scale
      page.drawImage(embedded, {
        x: (pw - w) / 2,
        y: (ph - h) / 2,
        width: w,
        height: h,
      })
    } else {
      const scale = Math.min(1, pw / embedded.width, ph / embedded.height)
      const w = embedded.width * scale
      const h = embedded.height * scale
      page.drawImage(embedded, {
        x: 0,
        y: ph - h,
        width: w,
        height: h,
      })
    }
  }
  
  return await savePdfOmniDocument(doc)
}

// ─── Draw shapes on PDF ───
export async function drawShapeOnPDF(pdfBytes, shape) {
  const doc = await loadPdfForRewrite(pdfBytes)
  const page = doc.getPage(shape.pageIndex || 0)
  
  const color = rgb(
    (shape.color?.r ?? 0) / 255,
    (shape.color?.g ?? 0) / 255,
    (shape.color?.b ?? 0) / 255
  )
  
  switch (shape.type) {
    case 'rectangle':
      page.drawRectangle({
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        borderColor: color,
        borderWidth: shape.borderWidth || 2,
        opacity: shape.opacity ?? 1,
        color: shape.fill ? color : undefined,
      })
      break
    case 'circle':
      page.drawCircle({
        x: shape.x + shape.radius,
        y: shape.y + shape.radius,
        size: shape.radius,
        borderColor: color,
        borderWidth: shape.borderWidth || 2,
        opacity: shape.opacity ?? 1,
        color: shape.fill ? color : undefined,
      })
      break
    case 'line':
      page.drawLine({
        start: { x: shape.x1, y: shape.y1 },
        end: { x: shape.x2, y: shape.y2 },
        thickness: shape.thickness || 2,
        color,
        opacity: shape.opacity ?? 1,
      })
      break
  }
  
  return await savePdfOmniDocument(doc)
}

// ─── Content Stream Redaction Helpers ───

function _mulMat(m1, m2) {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ]
}

/**
 * Proper AABB overlap test between a text span and a redaction rectangle.
 * textX, textY = bottom-left of text (baseline for y), textW = estimated width,
 * effH = effective font height in page coordinates.
 * Requires the text BASELINE to fall within the redaction rect vertically
 * (with a small tolerance for descenders) to avoid catching adjacent lines.
 */
function _textHitsRedaction(textX, textY, textW, effH, redactions) {
  for (const r of redactions) {
    // Horizontal: compute actual overlap between [textX, textX+textW] and [r.x, r.x+r.width]
    const overlapLeft  = Math.max(textX, r.x)
    const overlapRight = Math.min(textX + textW, r.x + r.width)
    const hOverlap = overlapRight - overlapLeft
    // Require at least 30% of the text span to be inside the redaction.
    // This prevents false positives from glyph-width estimation errors.
    if (hOverlap < textW * 0.3 && hOverlap < r.width * 0.3) continue
    // Vertical: baseline must sit inside the redaction rect (small descender tolerance)
    if (textY >= r.y - effH * 0.15 && textY <= r.y + r.height) {
      return true
    }
  }
  return false
}

/**
 * Tokenize a decompressed PDF content stream string into tokens.
 * Handles: numbers, string literals, hex strings, names, arrays, keywords/operators.
 */
function _tokenize(str) {
  const tokens = []
  let i = 0
  const len = str.length
  while (i < len) {
    const ch = str.charCodeAt(i)
    // Whitespace
    if (ch === 0 || ch === 9 || ch === 10 || ch === 12 || ch === 13 || ch === 32) { i++; continue }
    // Comment
    if (ch === 37) { while (i < len && str.charCodeAt(i) !== 10 && str.charCodeAt(i) !== 13) i++; continue }
    // String literal (...)
    if (ch === 40) {
      let depth = 1, start = i; i++
      while (i < len && depth > 0) {
        const c = str.charCodeAt(i)
        if (c === 92) { i += 2; continue } // backslash escape
        if (c === 40) depth++
        if (c === 41) depth--
        i++
      }
      tokens.push({ t: 's', v: str.slice(start, i) }); continue
    }
    // Hex string <...>
    if (ch === 60 && (i + 1 >= len || str.charCodeAt(i + 1) !== 60)) {
      const start = i; i++
      while (i < len && str.charCodeAt(i) !== 62) i++
      i++ // skip >
      tokens.push({ t: 'h', v: str.slice(start, i) }); continue
    }
    // Dict << and >>
    if (ch === 60 && i + 1 < len && str.charCodeAt(i + 1) === 60) { tokens.push({ t: 'p', v: '<<' }); i += 2; continue }
    if (ch === 62 && i + 1 < len && str.charCodeAt(i + 1) === 62) { tokens.push({ t: 'p', v: '>>' }); i += 2; continue }
    // Array [ ]
    if (ch === 91) { tokens.push({ t: 'p', v: '[' }); i++; continue }
    if (ch === 93) { tokens.push({ t: 'p', v: ']' }); i++; continue }
    // Name /...
    if (ch === 47) {
      let name = '/'; i++
      while (i < len) {
        const c = str.charCodeAt(i)
        if (c <= 32 || c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37) break
        name += str[i]; i++
      }
      tokens.push({ t: 'n', v: name }); continue
    }
    // Regular token (number or keyword)
    let word = ''
    while (i < len) {
      const c = str.charCodeAt(i)
      if (c <= 32 || c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37) break
      word += str[i]; i++
    }
    if (word.length > 0) {
      tokens.push({ t: /^[+-]?(\d+\.?\d*|\.\d+)$/.test(word) ? '#' : 'k', v: word })
    }
  }
  return tokens
}

const _ALL_OPS = new Set([
  'b','B','b*','B*','BDC','BI','BMC','BT','BX','c','cm','CS','cs','d','d0','d1','Do',
  'DP','EMC','ET','EX','f','F','f*','G','g','gs','h','i','j','J','K','k','l','m','M',
  'MP','n','q','Q','re','RG','rg','ri','s','S','SC','sc','SCN','scn','sh','T*','Tc',
  'Td','TD','Tf','Tj','TJ','TL','Tm','Tr','Ts','Tw','Tz','v','w','W','W*','y',"'",'"',
])

/**
 * Estimate the number of logical characters in a PDF string token.
 * For string literals (...) count raw bytes minus parens.
 * For hex strings <...> try CID (4 hex/char) first, fall back to 2 hex/char.
 */
function _estimateCharCount(tok) {
  if (tok.t === 's') return Math.max(tok.v.length - 2, 0)
  // hex string: if length-2 is divisible by 4 assume CID (2 bytes/char)
  const hexLen = tok.v.length - 2 // strip < >
  return hexLen % 4 === 0 ? hexLen / 4 : hexLen / 2
}

function _visibleCharCount(str) {
  return Array.from(str || '').length
}

function _literalStringUnits(rawContent) {
  const units = []
  for (let i = 0; i < rawContent.length; i++) {
    if (rawContent[i] !== '\\') {
      units.push(rawContent[i])
      continue
    }

    let unit = rawContent[i]
    i++
    if (i >= rawContent.length) {
      units.push(unit)
      break
    }

    const next = rawContent[i]
    unit += next

    if (/[0-7]/.test(next)) {
      for (let j = 0; j < 2 && i + 1 < rawContent.length && /[0-7]/.test(rawContent[i + 1]); j++) {
        i++
        unit += rawContent[i]
      }
    } else if (next === '\r' && rawContent[i + 1] === '\n') {
      i++
      unit += rawContent[i]
    }

    units.push(unit)
  }
  return units
}

function _stringTokenUnits(strTok, visibleCountHint = 0) {
  const rawContent = strTok.v.slice(1, -1)
  if (strTok.t === 's') return _literalStringUnits(rawContent)

  const cleanHex = rawContent.replace(/\s+/g, '')
  const rawByteCount = cleanHex.length / 2
  const bytesPerChar = visibleCountHint > 0 && rawByteCount >= visibleCountHint * 1.5 ? 2 : 1
  const unitSize = bytesPerChar * 2
  const units = []
  for (let i = 0; i < cleanHex.length; i += unitSize) {
    units.push(cleanHex.slice(i, i + unitSize))
  }
  return units
}

function _makeStringPart(strTok, units) {
  if (!units.length) return ''
  return strTok.t === 'h' ? `<${units.join('')}>` : `(${units.join('')})`
}

function _baselineHitsRedaction(y, effH, r) {
  return y >= r.y - effH * 0.15 && y <= r.y + r.height
}

function _addRedactionRangesForSpan(ranges, spanX, spanY, spanW, effH, unitStart, unitCount, redactions) {
  if (unitCount <= 0 || spanW <= 0) return

  const spanRight = spanX + spanW
  const unitW = spanW / unitCount
  for (const r of redactions) {
    if (!_baselineHitsRedaction(spanY, effH, r)) continue

    const overlapLeft = Math.max(spanX, r.x)
    const overlapRight = Math.min(spanRight, r.x + r.width)
    if (overlapRight <= overlapLeft) continue

    const start = Math.max(0, Math.floor((overlapLeft - spanX) / unitW))
    const end = Math.min(unitCount, Math.ceil((overlapRight - spanX) / unitW))
    if (end > start) {
      ranges.push({
        start: unitStart + start,
        end: unitStart + end,
        width: (end - start) * unitW,
      })
    }
  }
}

function _mergeRedactionRanges(ranges) {
  const sorted = ranges
    .filter(r => r.end > r.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const merged = []

  for (const r of sorted) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) {
      const addedUnits = Math.max(0, r.end - Math.max(last.end, r.start))
      const unitWidth = r.end > r.start ? r.width / (r.end - r.start) : 0
      last.end = Math.max(last.end, r.end)
      last.width += addedUnits * unitWidth
    } else {
      merged.push({ ...r })
    }
  }

  return merged
}

function _buildSplitString(strTok, ranges, hScale, units) {
  const merged = _mergeRedactionRanges(ranges)
  if (!merged.length) return null

  const parts = []
  let cursor = 0
  for (const r of merged) {
    if (r.start > cursor) {
      const kept = _makeStringPart(strTok, units.slice(cursor, r.start))
      if (kept) parts.push(kept)
    }

    if (r.end > r.start && hScale > 0) {
      parts.push(String(Math.round(-(r.width / hScale) * 1000)))
    }
    cursor = Math.max(cursor, r.end)
  }

  if (cursor < units.length) {
    const kept = _makeStringPart(strTok, units.slice(cursor))
    if (kept) parts.push(kept)
  }

  const hasVisibleText = parts.some(part => part.startsWith('(') || part.startsWith('<'))
  if (!hasVisibleText) return 'BLANK_ALL'
  return `[ ${parts.join(' ')} ]`
}

/**
 * Process a decompressed PDF content stream string and blank out text strings
 * whose positions fall within any of the given redaction rectangles.
 *
 * Tracks CTM (cm, q, Q) and text state (BT, ET, Tm, Td, TD, T*, Tf, TL)
 * to calculate each text-showing operator's position in page coordinates.
 *
 * For TJ arrays, each string element is checked individually with its own
 * estimated x-position, so only the words actually under the redaction box
 * are removed — neighbouring text on the same line is preserved.
 */
function _blankRedactedText(streamStr, redactions, textItems = null) {
  const tokens = _tokenize(streamStr)
  const ctmStack = []
  let ctm = [1, 0, 0, 1, 0, 0]
  let tm = [1, 0, 0, 1, 0, 0]
  let tlm = [1, 0, 0, 1, 0, 0]
  let fontSize = 12
  let leading = 0
  let inText = false

  // Collect operand indices; when an operator keyword is found, decide
  // whether to blank the preceding string/hexstring operands.
  const opndIdxs = []

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.t !== 'k' || !_ALL_OPS.has(tok.v)) {
      opndIdxs.push(i)
      continue
    }
    // It's an operator keyword
    const op = tok.v
    const nums = () => opndIdxs.map(j => tokens[j]).filter(t => t.t === '#').map(t => parseFloat(t.v))

    // ── Graphics state ──
    if (op === 'q') ctmStack.push([...ctm])
    if (op === 'Q' && ctmStack.length) ctm = ctmStack.pop()
    if (op === 'cm') { const n = nums(); if (n.length === 6) ctm = _mulMat(n, ctm) }

    // ── Text state ──
    if (op === 'BT') { inText = true; tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0] }
    if (op === 'ET') inText = false
    if (op === 'Tf') { const n = nums(); if (n.length) fontSize = Math.abs(n[n.length - 1]) }
    if (op === 'TL') { const n = nums(); if (n.length) leading = n[0] }
    if (op === 'Tm') { const n = nums(); if (n.length === 6) { tm = [...n]; tlm = [...n] } }
    if (op === 'Td' || op === 'TD') {
      const n = nums()
      if (n.length >= 2) {
        if (op === 'TD') leading = -n[1]
        const m = [1, 0, 0, 1, n[0], n[1]]
        tlm = _mulMat(m, tlm); tm = [...tlm]
      }
    }
    if (op === 'T*') { const m = [1, 0, 0, 1, 0, -leading]; tlm = _mulMat(m, tlm); tm = [...tlm] }

    // ── Shared helper: attempt to split a string token at PDF.js text-item
    //    boundaries, returning a TJ-style array string with blanked items
    //    and kerning values. Returns null if splitting is not possible. ──
    const _trySplitString = (strTok, posX, posY, tokenWidth, effH, hScale) => {
      const fallbackUnits = _stringTokenUnits(strTok)
      const fallbackWidth = tokenWidth > 0 ? tokenWidth : fallbackUnits.length * (hScale * 0.55)

      const splitWithFallbackGeometry = () => {
        const fallbackRanges = []
        _addRedactionRangesForSpan(
          fallbackRanges,
          posX,
          posY,
          fallbackWidth,
          effH,
          0,
          fallbackUnits.length,
          redactions
        )
        return _buildSplitString(strTok, fallbackRanges, hScale, fallbackUnits)
      }

      if (!textItems || textItems.length === 0) return splitWithFallbackGeometry()
      const yTol = effH * 0.5
      const tokenRight = posX + fallbackWidth
      const lineItems = textItems.filter(it =>
        Math.abs(it.y - posY) < yTol &&
        it.str.length > 0 &&
        it.x + it.width >= posX - effH &&
        it.x <= tokenRight + effH
      ).sort((a, b) => a.x - b.x)
      if (lineItems.length === 0) return splitWithFallbackGeometry()

      const pdfJsCharCount = lineItems.reduce((s, it) => s + _visibleCharCount(it.str), 0)
      const units = _stringTokenUnits(strTok, pdfJsCharCount)
      const lineWidth = lineItems.reduce((s, it) => s + (it.width || 0), 0)
      if (pdfJsCharCount > units.length * 1.25 && fallbackWidth < lineWidth * 0.8) {
        return splitWithFallbackGeometry()
      }
      const ranges = []
      let unitOffset = 0
      let visibleOffset = 0

      for (const it of lineItems) {
        const visibleChars = _visibleCharCount(it.str)
        const nextVisibleOffset = visibleOffset + visibleChars
        const nextUnitOffset = pdfJsCharCount > 0
          ? Math.round((nextVisibleOffset / pdfJsCharCount) * units.length)
          : unitOffset + visibleChars
        const itemUnits = Math.max(0, nextUnitOffset - unitOffset)

        _addRedactionRangesForSpan(
          ranges,
          it.x,
          it.y,
          it.width || ((itemUnits / Math.max(units.length, 1)) * fallbackWidth),
          effH,
          unitOffset,
          itemUnits,
          redactions
        )

        visibleOffset = nextVisibleOffset
        unitOffset = nextUnitOffset
      }

      if (unitOffset < units.length) {
        const unitCount = units.length - unitOffset
        _addRedactionRangesForSpan(
          ranges,
          posX + (fallbackWidth * unitOffset / Math.max(units.length, 1)),
          posY,
          fallbackWidth * unitCount / Math.max(units.length, 1),
          effH,
          unitOffset,
          unitCount,
          redactions
        )
      }

      return _buildSplitString(strTok, ranges, hScale, units)
    }

    // ── TJ (array of strings + kerning): process per-element ──
    if (inText && op === 'TJ') {
      const pos = _mulMat(tm, ctm)
      let curX = pos[4]
      const curY = pos[5]
      const hScale = fontSize * Math.abs(tm[0] || 1)
      const effH   = fontSize * Math.abs(tm[3] || 1)
      const avgGlyphW = hScale * 0.55

      // Check if ANY element in this TJ needs splitting via PDF.js
      let needsRewrite = false
      const newArrayParts = [] // Will hold the rebuilt TJ array pieces

      for (const j of opndIdxs) {
        const t = tokens[j]
        if (t.t === 'p') continue // skip [ ]
        if (t.t === '#') {
          curX -= parseFloat(t.v) / 1000 * hScale
          newArrayParts.push(t.v)
          continue
        }
        if (t.t === 's' || t.t === 'h') {
          const cc = _estimateCharCount(t)
          const estW = cc * avgGlyphW
          if (_textHitsRedaction(curX, curY, estW, effH, redactions)) {
            // Try PDF.js text-item splitting for this element
            const split = _trySplitString(t, curX, curY, estW, effH, hScale)
            if (split === 'BLANK_ALL') {
              // Entire line redacted — blank this element
              newArrayParts.push(t.t === 's' ? '()' : '<>')
              needsRewrite = true
            } else if (split) {
              // Partial split — splice the inner TJ array (strip outer [])
              const inner = split.slice(1, -1).trim() // strip [ ]
              newArrayParts.push(inner)
              needsRewrite = true
            } else {
              // No PDF.js data — blank the whole element (fallback)
              newArrayParts.push(t.t === 's' ? '()' : '<>')
              needsRewrite = true
            }
          } else {
            newArrayParts.push(t.v) // keep as-is
          }
          curX += estW
        }
      }

      if (needsRewrite) {
        // Replace all operand tokens with a single raw TJ array
        const newArray = '[ ' + newArrayParts.join(' ') + ' ]'
        // Blank out all operand tokens except the first
        for (let k = 0; k < opndIdxs.length; k++) {
          tokens[opndIdxs[k]].v = k === 0 ? newArray : ''
          tokens[opndIdxs[k]].t = 'p'
        }
      }
      opndIdxs.length = 0
      continue
    }

    // ── Tj, ', " (single string): use PDF.js text items for precise splitting ──
    if (inText && (op === 'Tj' || op === "'" || op === '"')) {
      if (op === "'" || op === '"') {
        const m = [1, 0, 0, 1, 0, -leading]; tlm = _mulMat(m, tlm); tm = [...tlm]
      }
      const pos = _mulMat(tm, ctm)
      const effH = fontSize * Math.abs(tm[3] || 1)
      const strIdx = opndIdxs.find(j => tokens[j].t === 's' || tokens[j].t === 'h')
      if (strIdx !== undefined) {
        const strTok = tokens[strIdx]
        const hScale = fontSize * Math.abs(tm[0] || 1)
        const avgGlyphW = hScale * 0.55
        const totalW = _estimateCharCount(strTok) * avgGlyphW

        if (_textHitsRedaction(pos[4], pos[5], totalW, effH, redactions)) {
          const split = _trySplitString(strTok, pos[4], pos[5], totalW, effH, hScale)
          if (split === 'BLANK_ALL') {
            strTok.v = strTok.t === 's' ? '()' : '<>'
          } else if (split) {
            strTok.v = split
            strTok.t = 'p'
            tokens[i].v = 'TJ' // change Tj → TJ
          } else {
            // Fallback: blank entire string
            strTok.v = strTok.t === 's' ? '()' : '<>'
          }
        }
      }
    }

    // Handle inline images: skip binary data between ID and EI
    if (op === 'BI') {
      let idIdx = i + 1
      while (idIdx < tokens.length && !(tokens[idIdx].t === 'k' && tokens[idIdx].v === 'ID')) idIdx++
      let eiIdx = idIdx + 1
      while (eiIdx < tokens.length && !(tokens[eiIdx].t === 'k' && tokens[eiIdx].v === 'EI')) eiIdx++
      i = eiIdx
    }

    opndIdxs.length = 0
  }

  // Serialize tokens back — join with spaces
  const parts = []
  for (const t of tokens) parts.push(t.v)
  return parts.join(' ')
}

/**
 * Decompress a FlateDecode PDF stream using the browser's DecompressionStream API.
 * Tries zlib (deflate) first, then raw deflate as fallback.
 * Returns null if decompression fails.
 */
async function _decompressFlate(data) {
  for (const fmt of ['deflate', 'raw']) {
    try {
      const ds = new DecompressionStream(fmt)
      const result = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer()
      return new Uint8Array(result)
    } catch { /* try next format */ }
  }
  return null
}

// ─── Redact PDF ───

export async function redactPDF(pdfBytes, redactions = []) {
  if (!redactions.length) return pdfBytes

  const doc = await loadPdfForRewrite(pdfBytes)

  // Group redactions by page index
  const byPage = new Map()
  for (const redaction of redactions) {
    const pageIndex = redaction.pageIndex ?? redaction.page ?? 0
    if (!byPage.has(pageIndex)) byPage.set(pageIndex, [])
    byPage.get(pageIndex).push(redaction)
  }

  for (let i = 0; i < doc.getPageCount(); i++) {
    const pageRedactions = byPage.get(i)

    if (!pageRedactions || pageRedactions.length === 0) continue

    const page = doc.getPage(i)

    // ── Content stream surgery: remove text in redacted areas ──
    // 1. Get the page's content stream reference(s)
    const contentsEntry = page.node.get(PDFName.of('Contents'))
    if (contentsEntry) {
      const streamRefs = []
      if (typeof contentsEntry.size === 'function') {
        // PDFArray — multiple content streams
        for (let j = 0; j < contentsEntry.size(); j++) streamRefs.push(contentsEntry.get(j))
      } else {
        streamRefs.push(contentsEntry)
      }

      // 2. Process each content stream in place. Keeping the stream boundaries
      // preserves graphics-state structure that downstream editors rely on for
      // image and text-object detection.
      for (const ref of streamRefs) {
        const stream = doc.context.lookup(ref)
        if (!stream || !stream.contents) continue
        const filter = stream.dict?.get?.(PDFName.of('Filter'))
        const filterStr = filter?.toString?.() || ''
        let rawBytes
        if (!filterStr || filterStr === 'Identity') {
          rawBytes = stream.contents
        } else if (filterStr === '/FlateDecode' || filterStr === 'FlateDecode') {
          rawBytes = await _decompressFlate(stream.contents)
          if (!rawBytes) continue
        } else {
          continue // unsupported filter
        }

        const streamStr = new TextDecoder('latin1').decode(rawBytes)
        if (!streamStr) continue

        try {
          // Get precise text positions from PDF.js for Tj string splitting
          let textItems = null
          try {
            textItems = await getRawTextItems(pdfBytes, i + 1) // 1-indexed page number
          } catch { /* fall back to estimated widths */ }
          const modified = _blankRedactedText(streamStr, pageRedactions, textItems)
          const newBytes = new Uint8Array(modified.length)
          for (let j = 0; j < modified.length; j++) newBytes[j] = modified.charCodeAt(j) & 0xFF

          stream.contents = newBytes
          stream.dict.set(PDFName.of('Length'), PDFNumber.of(newBytes.length))
          stream.dict.delete(PDFName.of('Filter'))
          stream.dict.delete(PDFName.of('DecodeParms'))
        } catch (err) {
          console.warn('Content stream redaction failed for one stream, keeping stream visual-only:', err)
        }
      }
    }

    // ── Draw black rectangles over redacted areas (visual coverage) ──
    for (const r of pageRedactions) {
      page.drawRectangle({
        x: r.x, y: r.y, width: r.width, height: r.height,
        color: rgb(0, 0, 0), borderWidth: 0,
      })
    }
  }

  return await savePdfOmniDocument(doc, { useObjectStreams: false, addDefaultPage: false })
}

// ─── Replace text in a region (white-out + redraw) ───
export async function replaceTextInRegion(pdfBytes, pageIndex, region, newText, options = {}) {
  const {
    fontSize = 12,
    fontName = 'Helvetica',
    color = { r: 0, g: 0, b: 0 },
  } = options

  const doc = await loadPdfForRewrite(pdfBytes)
  const page = doc.getPage(pageIndex)

  // White-out the old text region
  page.drawRectangle({
    x: region.x - 1,
    y: region.y - 1,
    width: region.width + 2,
    height: region.height + 2,
    color: rgb(1, 1, 1), // white
    borderWidth: 0,
  })

  // Draw new text at the same position
  const fontKey = StandardFonts[fontName] || StandardFonts.Helvetica
  const font = await doc.embedFont(fontKey)
  
  // Handle multi-line text
  const textLines = newText.split('\n')
  const lineHeight = fontSize * 1.2
  
  for (let i = 0; i < textLines.length; i++) {
    page.drawText(textLines[i], {
      x: region.x,
      y: region.y + region.height - fontSize - (i * lineHeight),
      size: fontSize,
      font,
      color: rgb(color.r / 255, color.g / 255, color.b / 255),
    })
  }

  return await savePdfOmniDocument(doc)
}

// ─── Add invisible OCR text layer ───
export async function addOcrTextLayer(pdfBytes, pageIndex, ocrWords, imageSize) {
  const doc = await loadPdfForRewrite(pdfBytes)
  const page = doc.getPage(pageIndex)
  const { width: pageW, height: pageH } = page.getSize()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  // Scale factors from OCR image coords to PDF coords
  const scaleX = pageW / (imageSize?.width || pageW)
  const scaleY = pageH / (imageSize?.height || pageH)

  for (const word of ocrWords) {
    if (!word.text || word.text.trim().length === 0) continue
    
    const bbox = word.bbox
    const x = bbox.x0 * scaleX
    const h = (bbox.y1 - bbox.y0) * scaleY
    // PDF y is from bottom, OCR y is from top
    const y = pageH - (bbox.y1 * scaleY)
    
    const estFontSize = Math.max(4, Math.min(h * 0.85, 72))

    try {
      page.drawText(word.text, {
        x,
        y,
        size: estFontSize,
        font,
        color: rgb(0, 0, 0),
        opacity: 0.01, // Nearly invisible but selectable
      })
    } catch {
      // Skip words that cause encoding errors
    }
  }

  return await savePdfOmniDocument(doc)
}

// ─── Replace or add image on a page ───
export async function replaceImageInPage(pdfBytes, pageIndex, newImageBytes, imageType = 'png', placement = {}) {
  const doc = await loadPdfForRewrite(pdfBytes)
  const page = doc.getPage(pageIndex)
  const { width: pageW, height: pageH } = page.getSize()

  // White out old area if requested
  if (placement.whiteOut) {
    page.drawRectangle({
      x: placement.x || 0,
      y: placement.y || 0,
      width: placement.width || pageW,
      height: placement.height || pageH,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    })
  }

  // Embed the new image
  let image
  if (imageType === 'png') {
    image = await doc.embedPng(newImageBytes)
  } else {
    image = await doc.embedJpg(newImageBytes)
  }

  const dims = image.scale(1)
  const x = placement.x ?? 0
  const y = placement.y ?? 0
  const w = placement.width ?? dims.width
  const h = placement.height ?? dims.height

  page.drawImage(image, { x, y, width: w, height: h })

  return await savePdfOmniDocument(doc)
}

// ─── Apply unified list of edits to a page ───
export async function applyPageEdits(pdfBytes, pageIndex, edits) {
  const { textEdits = [], addedTexts = [], addedImages = [] } = edits
  const doc = await loadPdfForRewrite(pdfBytes)
  const page = doc.getPage(pageIndex)

  // 1. Process Text Edits (Replacing or moving native text)
  for (const edit of textEdits) {
    // White out original region (if available)
    if (edit.originalRegion) {
      page.drawRectangle({
        x: edit.originalRegion.x - 1,
        y: edit.originalRegion.y - 1,
        width: edit.originalRegion.width + 2,
        height: edit.originalRegion.height + 2,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      })
    }

    if (edit.delete) continue

    // Embed font
    const fontKey = StandardFonts[edit.fontName] || StandardFonts.Helvetica
    const font = await doc.embedFont(fontKey)
    
    // Draw text at target coords
    const textLines = edit.text.split('\n')
    const fontSize = edit.fontSize || 12
    const lineHeight = fontSize * (edit.lineHeight || 1.2)
    
    const color = edit.color || { r: 0, g: 0, b: 0 }

    // Draw border if requested
    if (edit.borderColor && edit.borderWidth) {
      const blockW = edit.width || (edit.originalRegion ? edit.originalRegion.width : 100)
      const blockH = textLines.length * lineHeight
      page.drawRectangle({
        x: edit.x - 4,
        y: edit.y - 4,
        width: blockW + 8,
        height: blockH + 8,
        borderColor: rgb(edit.borderColor.r / 255, edit.borderColor.g / 255, edit.borderColor.b / 255),
        borderWidth: edit.borderWidth,
        opacity: edit.opacity !== undefined ? edit.opacity : 1,
      })
    }

    for (let i = 0; i < textLines.length; i++) {
      const lineText = textLines[i]
      let drawX = edit.x
      if (edit.align === 'center' || edit.align === 'right') {
        const textWidth = font.widthOfTextAtSize(lineText, fontSize)
        const blockW = edit.width || (edit.originalRegion ? edit.originalRegion.width : 100)
        if (edit.align === 'center') {
          drawX = edit.x + (blockW - textWidth) / 2
        } else if (edit.align === 'right') {
          drawX = edit.x + (blockW - textWidth)
        }
      }

      const lineY = edit.y + (edit.originalRegion ? edit.originalRegion.height : fontSize) - fontSize - (i * lineHeight)
      const lineTextWidth = font.widthOfTextAtSize(lineText, fontSize)

      // Draw background color (highlight)
      if (edit.backgroundColor) {
        page.drawRectangle({
          x: drawX - 2,
          y: lineY - 2,
          width: lineTextWidth + 4,
          height: fontSize + 4,
          color: rgb(edit.backgroundColor.r / 255, edit.backgroundColor.g / 255, edit.backgroundColor.b / 255),
          opacity: edit.backgroundColorOpacity !== undefined ? edit.backgroundColorOpacity : 1,
        })
      }

      page.drawText(lineText, {
        x: drawX,
        y: lineY,
        size: fontSize,
        font,
        color: rgb(color.r / 255, color.g / 255, color.b / 255),
        rotate: edit.rotate ? degrees(edit.rotate) : undefined,
        opacity: edit.opacity !== undefined ? edit.opacity : 1,
      })

      // Draw underline
      if (edit.underline) {
        page.drawLine({
          start: { x: drawX, y: lineY - 2 },
          end: { x: drawX + lineTextWidth, y: lineY - 2 },
          thickness: Math.max(1, fontSize * 0.08),
          color: rgb(color.r / 255, color.g / 255, color.b / 255),
          opacity: edit.opacity !== undefined ? edit.opacity : 1,
        })
      }

      // Draw strikethrough
      if (edit.strikethrough) {
        page.drawLine({
          start: { x: drawX, y: lineY + (fontSize * 0.35) },
          end: { x: drawX + lineTextWidth, y: lineY + (fontSize * 0.35) },
          thickness: Math.max(1, fontSize * 0.08),
          color: rgb(color.r / 255, color.g / 255, color.b / 255),
          opacity: edit.opacity !== undefined ? edit.opacity : 1,
        })
      }
    }
  }

  // Combine addedTexts and addedImages into a single drawing operations list sorted by zIndex
  const drawOps = [
    ...addedTexts.map(t => ({ type: 'text', data: t, zIndex: t.zIndex || 0 })),
    ...addedImages.map(img => ({ type: 'image', data: img, zIndex: img.zIndex || 0 }))
  ]
  drawOps.sort((a, b) => a.zIndex - b.zIndex)

  for (const op of drawOps) {
    if (op.type === 'text') {
      const txt = op.data
      const fontKey = StandardFonts[txt.fontName] || StandardFonts.Helvetica
      const font = await doc.embedFont(fontKey)
      const textLines = txt.text.split('\n')
      const fontSize = txt.fontSize || 14
      const lineHeight = fontSize * (txt.lineHeight || 1.2)
      const color = txt.color || { r: 0, g: 0, b: 0 }

      // Draw border if requested
      if (txt.borderColor && txt.borderWidth) {
        const blockW = txt.width || 100
        const blockH = textLines.length * lineHeight
        page.drawRectangle({
          x: txt.x - 4,
          y: txt.y - blockH + fontSize - 4,
          width: blockW + 8,
          height: blockH + 8,
          borderColor: rgb(txt.borderColor.r / 255, txt.borderColor.g / 255, txt.borderColor.b / 255),
          borderWidth: txt.borderWidth,
          opacity: txt.opacity !== undefined ? txt.opacity : 1,
        })
      }

      for (let i = 0; i < textLines.length; i++) {
        const lineText = textLines[i]
        let drawX = txt.x
        if (txt.align === 'center' || txt.align === 'right') {
          const textWidth = font.widthOfTextAtSize(lineText, fontSize)
          const blockW = txt.width || 100
          if (txt.align === 'center') {
            drawX = txt.x + (blockW - textWidth) / 2
          } else if (txt.align === 'right') {
            drawX = txt.x + (blockW - textWidth)
          }
        }

        const lineY = txt.y - (i * lineHeight)
        const lineTextWidth = font.widthOfTextAtSize(lineText, fontSize)

        // Draw background color (highlight)
        if (txt.backgroundColor) {
          page.drawRectangle({
            x: drawX - 2,
            y: lineY - 2,
            width: lineTextWidth + 4,
            height: fontSize + 4,
            color: rgb(txt.backgroundColor.r / 255, txt.backgroundColor.g / 255, txt.backgroundColor.b / 255),
            opacity: txt.backgroundColorOpacity !== undefined ? txt.backgroundColorOpacity : (txt.opacity !== undefined ? txt.opacity : 1),
          })
        }

        page.drawText(lineText, {
          x: drawX,
          y: lineY,
          size: fontSize,
          font,
          color: rgb(color.r / 255, color.g / 255, color.b / 255),
          rotate: txt.rotate ? degrees(txt.rotate) : undefined,
          opacity: txt.opacity !== undefined ? txt.opacity : 1,
        })

        // Draw underline
        if (txt.underline) {
          page.drawLine({
            start: { x: drawX, y: lineY - 2 },
            end: { x: drawX + lineTextWidth, y: lineY - 2 },
            thickness: Math.max(1, fontSize * 0.08),
            color: rgb(color.r / 255, color.g / 255, color.b / 255),
            opacity: txt.opacity !== undefined ? txt.opacity : 1,
          })
        }

        // Draw strikethrough
        if (txt.strikethrough) {
          page.drawLine({
            start: { x: drawX, y: lineY + (fontSize * 0.35) },
            end: { x: drawX + lineTextWidth, y: lineY + (fontSize * 0.35) },
            thickness: Math.max(1, fontSize * 0.08),
            color: rgb(color.r / 255, color.g / 255, color.b / 255),
            opacity: txt.opacity !== undefined ? txt.opacity : 1,
          })
        }
      }
    } else if (op.type === 'image') {
      const img = op.data
      let embeddedImg
      if (img.type === 'png') {
        embeddedImg = await doc.embedPng(img.bytes)
      } else {
        embeddedImg = await doc.embedJpg(img.bytes)
      }
      page.drawImage(embeddedImg, {
        x: img.x,
        y: img.y,
        width: img.width,
        height: img.height,
        rotate: img.rotate ? degrees(img.rotate) : undefined,
        opacity: img.opacity !== undefined ? img.opacity : 1,
      })
    }
  }

  return await savePdfOmniDocument(doc)
}
