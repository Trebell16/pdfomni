/**
 * compressionWorker.ts
 * ---------------------
 * Runs entirely in a Web Worker thread so the main UI never freezes.
 * Receives a PDF ArrayBuffer + target percentage, performs multi-stage
 * iterative compression, and posts progress events back to the main thread.
 *
 * Communication protocol:
 *  → { type: 'COMPRESS', payload: { buffer, targetPct, fileName } }
 *  ← { type: 'PROGRESS', payload: { stage, pct, message } }
 *  ← { type: 'ANALYSIS', payload: { pages, images, fonts, originalSize } }
 *  ← { type: 'DONE',     payload: { buffer, originalSize, compressedSize, passes } }
 *  ← { type: 'ERROR',    payload: { message } }
 */

import { PDFDocument, PDFName, PDFRawStream, PDFDict } from 'pdf-lib';
import { normalizePdfForRewrite } from '../utils/qpdfNormalize';

function markPdfOmniDocument(pdfDoc: PDFDocument) {
  try {
    pdfDoc.setProducer('PDFOmni pdf-lib');
    pdfDoc.setCreator('PDFOmni');
  } catch {
    // Metadata tagging is best-effort; never block compression on it.
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkerIncoming {
  type: 'ANALYZE' | 'COMPRESS';
  payload: {
    buffer: ArrayBuffer;
    targetPct: number; // 15 – 90
    fileName: string;
  };
}

interface ProgressPayload { stage: string; pct: number; message: string; }
interface AnalysisPayload { pages: number; images: number; fonts: number; originalSize: number; }
interface PassRecord      { pass: number; size: number; qualityLabel: string; }
interface DonePayload     { buffer: ArrayBuffer; originalSize: number; compressedSize: number; passes: PassRecord[]; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function post(type: string, payload: unknown): void {
  self.postMessage({ type, payload });
}

function progress(stage: string, pct: number, message: string): void {
  post('PROGRESS', { stage, pct, message } as ProgressPayload);
}

function getAnalysis(pdfDoc: PDFDocument, originalSize: number): AnalysisPayload {
  const pages = pdfDoc.getPageCount();
  const imagesList = collectImageStreams(pdfDoc);
  const fontCount = [...pdfDoc.context.enumerateIndirectObjects()]
    .filter(([, o]) => o instanceof PDFDict && o.get(PDFName.of('Type'))?.toString() === '/Font')
    .length;

  return {
    pages,
    images: imagesList.length,
    fonts: fontCount,
    originalSize,
  };
}

async function loadPdfDocument(inputBuffer: ArrayBuffer): Promise<PDFDocument> {
  try {
    const normalizedBytes = await normalizePdfForRewrite(inputBuffer);
    return await PDFDocument.load(normalizedBytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch (err: unknown) {
    const msg = String(err).toLowerCase();
    if (msg.includes('encrypted_pdf_normalize_failed')) throw new Error('ENCRYPTED_PDF_NORMALIZE_FAILED');
    if (msg.includes('encrypt') || msg.includes('password')) throw new Error('PASSWORD_PROTECTED');
    throw new Error('CORRUPTED_PDF');
  }
}

type CompressionSetting = {
  quality: number;
  maxDim: number;
  includeNonJpeg: boolean;
};

const MAX_COMPRESSION_CANVAS_PIXELS = 24_000_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function compressionSettingsForTarget(pct: number): CompressionSetting[] {
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

  const settings: CompressionSetting[] = qualityRamp.map((quality) => ({ quality, maxDim: originalDim, includeNonJpeg: false }));
  const baseQuality = clamp(qualityRamp[Math.floor(qualityRamp.length * 0.65)] ?? 0.75, 0.42, 0.96);
  for (const maxDim of downsampleRamp) {
    settings.push({ quality: clamp(baseQuality + 0.08, 0.28, 0.98), maxDim, includeNonJpeg: false });
    settings.push({ quality: baseQuality, maxDim, includeNonJpeg: false });
  }
  if (pct < 35) {
    for (const maxDim of downsampleRamp.slice(2)) {
      settings.push({ quality: clamp(baseQuality, 0.48, 0.98), maxDim, includeNonJpeg: true });
    }
  }
  return settings;
}

function chooseClosestCompressedCandidate(
  candidates: Array<{ bytes: Uint8Array }>,
  targetSize: number
): Uint8Array | null {
  const usableUnder = candidates
    .filter((candidate) => candidate.bytes.length <= targetSize * 1.01)
    .sort((a, b) => b.bytes.length - a.bytes.length)[0];
  if (usableUnder) return usableUnder.bytes;

  return candidates
    .slice()
    .sort((a, b) => Math.abs(a.bytes.length - targetSize) - Math.abs(b.bytes.length - targetSize))[0]?.bytes ?? null;
}

/** Quality label for UI display */
function qualityLabel(pct: number): string {
  if (pct >= 75) return 'Minimal';
  if (pct >= 50) return 'Low';
  if (pct >= 30) return 'Medium';
  if (pct >= 20) return 'High';
  return 'Maximum Safe';
}

// ─── Image Processing (OffscreenCanvas) ──────────────────────────────────────

/**
 * Recompress a raw image buffer into JPEG at the given quality and max dim.
 * Uses OffscreenCanvas — available in Web Workers (Chrome 69+, Firefox 105+, Safari 16.4+).
 */
async function recompressImage(
  imageBytes: Uint8Array,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  jpegQuality: number,
  maxDim: number
): Promise<Uint8Array | null> {
  try {
    // Uint8Array → Blob
    const arr  = imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength) as ArrayBuffer;
    const blob = new Blob([arr], { type: mimeType });

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      return null; // image format not supported by browser decoder
    }

    let w = bitmap.width;
    let h = bitmap.height;
    if (w === 0 || h === 0) { bitmap.close(); return null; }

    // Downsample if over maxDim
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

    const canvas = new OffscreenCanvas(w, h);
    const ctx    = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return null; }

    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const outBlob     = await canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });
    const arrayBuffer = await outBlob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch {
    return null; // skip this image on any error
  }
}

// ─── PDF Object Helpers ───────────────────────────────────────────────────────

/** Detect MIME type from magic bytes. */
function detectMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
  return null;
}

type ImageEntry = {
  stream: PDFRawStream;
  bytes:  Uint8Array;
  mime:   'image/jpeg' | 'image/png' | 'image/webp';
  isJpeg: boolean;
};

/**
 * Walk all indirect objects in the document and return image XObject streams.
 */
function collectImageStreams(pdfDoc: PDFDocument): ImageEntry[] {
  const results: ImageEntry[] = [];

  for (const [, pdfObject] of pdfDoc.context.enumerateIndirectObjects()) {
    if (!(pdfObject instanceof PDFRawStream)) continue;

    const dict    = pdfObject.dict;
    const subtype = dict.get(PDFName.of('Subtype'));
    if (!subtype || subtype.toString() !== '/Image') continue;

    const rawBytes = pdfObject.contents;
    const filterVal = dict.get(PDFName.of('Filter'));
    const filterStr = filterVal?.toString() ?? '';

    // Only handle JPEG, PNG, and raw/flate encoded images
    if (filterStr.includes('CCITTFaxDecode') || filterStr.includes('JBIG2Decode')) {
      continue; // binary formats we can't re-encode via canvas
    }

    let mime: 'image/jpeg' | 'image/png' | 'image/webp' | null;
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

// ─── Internal helper to mutate raw stream contents ───────────────────────────

/** Directly overwrite the contents of a PDFRawStream (pdf-lib exposes this field). */
function setStreamContents(stream: PDFRawStream, newBytes: Uint8Array): void {
  // pdf-lib stores raw bytes in `contents` — we mutate it directly.
  // This is intentional: we're replacing compressed image data in-place.
  (stream as unknown as { contents: Uint8Array }).contents = newBytes;
}

// ─── Core Compression Function ────────────────────────────────────────────────

async function compressPDF(
  inputBuffer: ArrayBuffer,
  targetPct: number
): Promise<{ buffer: ArrayBuffer; passes: PassRecord[] }> {

  const originalSize = inputBuffer.byteLength;
  const targetSize   = originalSize * (targetPct / 100);

  progress('analysis', 5, 'Loading PDF structure…');

  // ── Stage 0: Load document ──────────────────────────────────────────────────
  let pdfDoc = await loadPdfDocument(inputBuffer);

  // ── Stage 1: Analysis ───────────────────────────────────────────────────────
  progress('analysis', 10, 'Analysing PDF structure…');

  post('ANALYSIS', getAnalysis(pdfDoc, originalSize));

  // ── Stage 2: Metadata strip ─────────────────────────────────────────────────
  progress('metadata', 15, 'Stripping metadata & unused objects…');

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

  // ── Stage 3: Baseline measurement ──────────────────────────────────────────
  progress('baseline', 25, 'Measuring baseline after metadata removal…');

  const passes: PassRecord[] = [];

  async function saveAndMeasure(): Promise<Uint8Array> {
    markPdfOmniDocument(pdfDoc);
    return pdfDoc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  }

  let currentBytes = await saveAndMeasure();
  passes.push({ pass: 0, size: currentBytes.length, qualityLabel: 'Metadata stripped' });

  if (currentBytes.length <= targetSize) {
    return { buffer: currentBytes.buffer as ArrayBuffer, passes };
  }

  // ── Stage 4: Iterative image compression ───────────────────────────────────
  const baselineBytes = currentBytes;
  const settings = compressionSettingsForTarget(targetPct);
  const candidates: Array<{ bytes: Uint8Array }> = [{ bytes: currentBytes }];
  let iteration = 0;

  while (iteration < settings.length && currentBytes.length > targetSize * 1.01) {
    const { quality: jpegQuality, maxDim, includeNonJpeg } = settings[iteration];
    const label       = qualityLabel(targetPct);
    const stagePct    = 30 + (iteration / settings.length) * 52;

    progress(
      'images',
      Math.round(stagePct),
      `Pass ${iteration + 1}: images at quality=${Math.round(jpegQuality * 100)}%, maxDim=${Number.isFinite(maxDim) ? `${maxDim}px` : 'original dimensions'}…`
    );

    try {
      pdfDoc = await PDFDocument.load(baselineBytes, { updateMetadata: false });
    } catch { break; }

    const imageStreams = collectImageStreams(pdfDoc);
    const totalImages  = imageStreams.length;
    let   processed    = 0;

    for (const { stream, bytes, mime, isJpeg } of imageStreams) {
      if (totalImages > 10 && processed % 10 === 0) {
        const subPct = Math.round(stagePct + (processed / totalImages) * 8);
        progress('images', Math.min(subPct, 82), `Image ${processed + 1}/${totalImages}…`);
      }

      if (!isJpeg && !includeNonJpeg) {
        processed++;
        continue;
      }

      const recompressed = await recompressImage(bytes, mime, jpegQuality, maxDim);
      if (recompressed && recompressed.length < bytes.length * 0.985) {
        try {
          stream.dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
          stream.dict.delete(PDFName.of('DecodeParms'));
          setStreamContents(stream, recompressed);
        } catch { /* skip */ }
      }

      processed++;
    }

    progress('saving', 85, `Pass ${iteration + 1}: Saving…`);

    try {
      currentBytes = await saveAndMeasure();
    } catch { break; }

    passes.push({ pass: iteration + 1, size: currentBytes.length, qualityLabel: label });
    candidates.push({ bytes: currentBytes });
    if (currentBytes.length <= targetSize * 1.01 && currentBytes.length >= targetSize * 0.95) break;

    iteration++;
  }

  currentBytes = chooseClosestCompressedCandidate(candidates, targetSize) ?? currentBytes;

  // ── Stage 5: Final object-stream optimisation ───────────────────────────────
  progress('optimising', 88, 'Optimising object streams…');

  try {
    pdfDoc       = await PDFDocument.load(currentBytes, { updateMetadata: false });
    markPdfOmniDocument(pdfDoc);
    currentBytes = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
    passes.push({ pass: iteration + 1, size: currentBytes.length, qualityLabel: 'Object streams' });
  } catch { /* keep previous */ }

  progress('finalizing', 95, 'Finalising PDF…');

  return { buffer: currentBytes.buffer as ArrayBuffer, passes };
}

// ─── Main message handler ─────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerIncoming>) => {
  const { type, payload } = event.data;
  if (type !== 'ANALYZE' && type !== 'COMPRESS') return;

  const { buffer, targetPct } = payload;

  try {
    if (type === 'ANALYZE') {
      progress('analysis', 5, 'Loading PDF structure...');
      const pdfDoc = await loadPdfDocument(buffer);
      post('ANALYSIS', getAnalysis(pdfDoc, buffer.byteLength));
      progress('done', 100, 'Analysis complete!');
      return;
    }

    const { buffer: compressedBuffer, passes } = await compressPDF(buffer, targetPct ?? 50);

    progress('done', 100, 'Compression complete!');

    post('DONE', {
      buffer:         compressedBuffer,
      originalSize:   buffer.byteLength,
      compressedSize: compressedBuffer.byteLength,
      passes,
    } as DonePayload);
  } catch (err: unknown) {
    const msg = String(err);
    let userMessage = 'An unexpected error occurred during compression.';

    if (msg.includes('ENCRYPTED_PDF_NORMALIZE_FAILED')) {
      userMessage = 'This PDF uses encryption or owner permissions and could not be normalized for safe compression. If it has an open password, unlock it first and try again.';
    } else if (msg.includes('PASSWORD_PROTECTED')) {
      userMessage = 'This PDF is password-protected. Please remove the password before compressing.';
    } else if (msg.includes('CORRUPTED_PDF')) {
      userMessage = 'This PDF appears to be corrupted or uses an unsupported format.';
    } else if (msg.toLowerCase().includes('memory') || msg.toLowerCase().includes('out of')) {
      userMessage = 'Insufficient memory. Try a smaller file or close other browser tabs.';
    }

    post('ERROR', { message: userMessage });
  }
};
