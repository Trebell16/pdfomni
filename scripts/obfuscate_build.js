import fs from 'fs'
import path from 'path'
import JavaScriptObfuscator from 'javascript-obfuscator'

const targetDir = path.resolve(process.argv[2] || 'obfuscated_dist')

const options = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.18,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  renameGlobals: false,
  rotateStringArray: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  selfDefending: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.55,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
}

const largeFileOptions = {
  ...options,
  controlFlowFlattening: false,
  numbersToExpressions: false,
  splitStrings: false,
  stringArrayEncoding: [],
  stringArrayThreshold: 0.35,
}

const skipNamePatterns = [
  /(?:^|[\\/])lib[\\/]/i,
  /(?:^|[\\/])ocr[\\/]/i,
  /(?:^|[\\/])pdf\.worker/i,
  /(?:^|[\\/])embeddingWorker-/i,
  /(?:^|[\\/])vendor-/i,
  /(?:^|[\\/])content-libs-/i,
  /(?:^|[\\/])jspdf-/i,
  /(?:^|[\\/])mammoth-/i,
  /(?:^|[\\/])pdf-lib-/i,
  /(?:^|[\\/])pdfjs-dist-/i,
  /(?:^|[\\/])tesseract-/i,
  /(?:^|[\\/])xlsx-/i,
  /(?:^|[\\/])ai-runtime-/i,
  /(?:^|[\\/])lucide-react-/i,
  /(?:^|[\\/])rolldown-runtime-/i,
  /(?:^|[\\/])index\.es-/i,
  /\.min\.js$/i,
]

function walk(dir) {
  const out = []
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function shouldSkipJs(filePath) {
  const normalized = filePath.replace(/\\/g, '/')
  return skipNamePatterns.some(pattern => pattern.test(normalized))
}

function obfuscateJsFile(filePath) {
  if (shouldSkipJs(filePath)) return false
  const source = fs.readFileSync(filePath, 'utf8')
  if (!source.trim()) return false
  const activeOptions = source.length > 650000 ? largeFileOptions : options
  const result = JavaScriptObfuscator.obfuscate(source, activeOptions).getObfuscatedCode()
  fs.writeFileSync(filePath, result, 'utf8')
  return true
}

function obfuscateEditPdfHtml(filePath) {
  if (!fs.existsSync(filePath)) return false
  const html = fs.readFileSync(filePath, 'utf8')
  let changed = false
  const next = html.replace(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, code) => {
    const shouldObfuscate = code.length > 100000 && /\b(?:const|let)\s+RENDER_SCALE\b/.test(code) && code.includes('const app=')
    if (!shouldObfuscate) return match
    const result = JavaScriptObfuscator.obfuscate(code, {
      ...options,
      stringArrayThreshold: 0.2,
    }).getObfuscatedCode()
    changed = true
    return `<script${attrs}>${result}</script>`
  })
  if (changed) fs.writeFileSync(filePath, next, 'utf8')
  return changed
}

if (!fs.existsSync(targetDir)) {
  console.error(`Protected build directory does not exist: ${targetDir}`)
  process.exit(1)
}

const files = walk(targetDir)
let obfuscatedFiles = 0
const obfuscatedPaths = []
const skippedJsPaths = []
for (const file of files) {
  if (!file.endsWith('.js')) continue
  if (shouldSkipJs(file)) {
    skippedJsPaths.push(file)
    continue
  }
  if (obfuscateJsFile(file)) {
    obfuscatedFiles++
    obfuscatedPaths.push(file)
  }
}

const editPdfObfuscated = obfuscateEditPdfHtml(path.join(targetDir, 'editpdf.html'))
if (editPdfObfuscated) obfuscatedPaths.push(path.join(targetDir, 'editpdf.html inline editor script'))

const reportPath = path.join(targetDir, 'protected-obfuscation-report.txt')
const relative = file => path.relative(targetDir, file).replace(/\\/g, '/')
const report = [
  'PDFOmni protected build obfuscation report',
  '',
  'Obfuscated app-controlled files/chunks:',
  ...obfuscatedPaths.map(file => `- ${relative(file)}`),
  '',
  'Skipped public/vendor/runtime files:',
  ...skippedJsPaths.map(file => `- ${relative(file)}`),
  '',
  'Notes:',
  '- Vendor libraries, PDF.js workers, icon bundles, and runtime chunks are intentionally skipped.',
  '- editpdf.html contains the standalone editor; its large inline editor script is obfuscated separately.',
].join('\n')
fs.writeFileSync(reportPath, `${report}\n`, 'utf8')

console.log(`Obfuscated ${obfuscatedFiles} JS file(s).`)
console.log(`Obfuscated editpdf inline editor: ${editPdfObfuscated ? 'yes' : 'no'}.`)
console.log(`Wrote obfuscation report: ${reportPath}`)
