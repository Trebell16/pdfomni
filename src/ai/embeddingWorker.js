import { pipeline, env } from '@xenova/transformers'

// Configure env to disable local models and let ONNX cache downloaded models locally in browser IndexedDB/Cache
env.allowLocalModels = false

// Disable multi-threading & SIMD in ONNX Runtime Web to prevent "failed to call OrtRun() error code = 6"
// which occurs when COOP/COEP headers are missing or when browser CPU architectures lack SIMD support.
env.backends.onnx.wasm.numThreads = 1
env.backends.onnx.wasm.simd = false

let pipelinePromise = null
const MODEL_MAX_CHARS = 1800
const RUN_OPTIONS = {
  pooling: 'mean',
  normalize: true,
  truncation: true,
  max_length: 512,
}

function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', {
      progress_callback: (data) => {
        self.postMessage({ type: 'progress', data })
      }
    })
  }
  return pipelinePromise
}

function normalizeInput(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim()
  return (cleaned || ' ').slice(0, MODEL_MAX_CHARS)
}

async function runEmbeddingBatch(extractor, textList) {
  const output = await extractor(textList, RUN_OPTIONS)
  const data = output.data
  const dims = output.dims
  const batchSize = dims.length === 1 ? 1 : dims[0]
  const dim = dims.length === 1 ? dims[0] : dims[dims.length - 1]

  const results = []
  for (let i = 0; i < batchSize; i++) {
    results.push(data.slice(i * dim, (i + 1) * dim))
  }
  return results
}

self.onmessage = async (event) => {
  const { id, texts } = event.data
  try {
    const extractor = await getPipeline()
    const isArray = Array.isArray(texts)
    const textList = (isArray ? texts : [texts]).map(normalizeInput)

    let results
    try {
      results = await runEmbeddingBatch(extractor, textList)
    } catch (batchErr) {
      console.warn('Embedding batch failed; retrying one input at a time:', batchErr)
      results = []
      for (const text of textList) {
        const singleResult = await runEmbeddingBatch(extractor, [text])
        results.push(singleResult[0])
      }
    }

    if (isArray) {
      self.postMessage({ id, embeddings: results })
    } else {
      self.postMessage({ id, embedding: results[0] })
    }
  } catch (err) {
    console.error('Error inside embedding Web Worker:', err)
    self.postMessage({ id, error: err.message })
  }
}
