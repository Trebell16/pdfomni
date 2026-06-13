/**
 * OCR Engine — Tesseract.js wrapper for client-side OCR
 * Runs entirely in the browser using WebAssembly
 */
import Tesseract from 'tesseract.js'

let cachedWorker = null
let cachedLang = null
let workerUnavailable = false

const LOCAL_OCR_PATHS = {
  workerPath: '/ocr/worker.min.js',
  corePath: '/ocr/core',
  langPath: '/ocr/lang',
}

/**
 * Initialize and cache a Tesseract worker
 */
export async function initWorker(lang = 'eng', onProgress) {
  if (workerUnavailable) {
    throw new Error('Local OCR assets are unavailable in this session.')
  }
  if (cachedWorker && cachedLang === lang) {
    return cachedWorker
  }

  // Terminate old worker if language changed
  if (cachedWorker) {
    try { await cachedWorker.terminate() } catch (_) {}
    cachedWorker = null
  }

  let worker
  try {
    worker = await Tesseract.createWorker(lang, 1, {
      ...LOCAL_OCR_PATHS,
      workerBlobURL: false,
      gzip: true,
      logger: (m) => {
        if (onProgress && m.progress !== undefined) {
          onProgress({
            status: m.status || 'processing',
            progress: Math.round((m.progress || 0) * 100),
          })
        }
      },
      errorHandler: (err) => {
        console.error('OCR worker error:', err)
      },
    })
  } catch (err) {
    workerUnavailable = true
    throw new Error(`Local OCR engine failed to start: ${err.message}`)
  }

  cachedWorker = worker
  cachedLang = lang
  return worker
}

/**
 * Run OCR on an image (data URL, blob, or canvas)
 * @param {string|Blob|HTMLCanvasElement} image - Image to recognize
 * @param {string} lang - Tesseract language code
 * @param {Function} onProgress - Progress callback ({ status, progress })
 * @returns {Object} OCR result with text, words, lines, blocks
 */
export async function recognizePage(image, lang = 'eng', onProgress) {
  try {
    const worker = await initWorker(lang, onProgress)
    const result = await worker.recognize(image)

    // Structure the result for easy consumption
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: (result.data.words || []).map(w => ({
        text: w.text,
        confidence: w.confidence,
        bbox: {
          x0: w.bbox.x0,
          y0: w.bbox.y0,
          x1: w.bbox.x1,
          y1: w.bbox.y1,
        },
        fontSize: w.bbox.y1 - w.bbox.y0,
      })),
      lines: (result.data.lines || []).map(l => ({
        text: l.text,
        confidence: l.confidence,
        bbox: l.bbox,
        words: (l.words || []).map(w => ({
          text: w.text,
          confidence: w.confidence,
          bbox: w.bbox,
        })),
      })),
      blocks: (result.data.blocks || []).map(b => ({
        text: b.text,
        confidence: b.confidence,
        bbox: b.bbox,
      })),
    }
  } catch (err) {
    console.error('OCR recognition failed:', err)
    throw new Error(`OCR failed: ${err.message}`)
  }
}

/**
 * Terminate the cached worker and free resources
 */
export async function terminateWorker() {
  if (cachedWorker) {
    try {
      await cachedWorker.terminate()
    } catch (_) {}
    cachedWorker = null
    cachedLang = null
  }
  workerUnavailable = false
}

/**
 * Available OCR languages
 */
export const OCR_LANGUAGES = [
  { code: 'eng', name: 'English' },
]
