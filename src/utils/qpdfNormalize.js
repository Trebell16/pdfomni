import { createQpdfRunner } from 'qpdf-run'

let runnerPromise = null

function toUint8Array(bytes) {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
}

export function isEncryptedPdfBytes(bytes) {
  const data = toUint8Array(bytes)
  const token = [47, 69, 110, 99, 114, 121, 112, 116] // /Encrypt
  outer: for (let i = 0; i <= data.length - token.length; i++) {
    for (let j = 0; j < token.length; j++) {
      if (data[i + j] !== token[j]) continue outer
    }
    return true
  }
  return false
}

async function getQpdfRunner() {
  if (!runnerPromise) {
    runnerPromise = createQpdfRunner({
      workerUrl: new URL('qpdf-run/worker', import.meta.url).href,
      qpdfJsUrl: new URL('qpdf-run/qpdf.js', import.meta.url).href,
      wasmUrl: new URL('qpdf-run/qpdf.wasm', import.meta.url).href,
      timeoutMs: 60000,
    })
  }
  return runnerPromise
}

export async function normalizePdfForRewrite(bytes, password = '') {
  const input = toUint8Array(bytes)
  if (!isEncryptedPdfBytes(input)) return input

  const qpdf = await getQpdfRunner()
  try {
    return await qpdf.runOne({
      input,
      inputName: 'input.pdf',
      outputName: 'output.pdf',
      args: ['--password=' + password, '--decrypt', '--remove-restrictions', '--', 'input.pdf', 'output.pdf'],
    })
  } catch (error) {
    throw new Error('This PDF uses encryption or owner permissions and could not be normalized for editing. If it has an open password, unlock it first and try again.', { cause: error })
  }
}
