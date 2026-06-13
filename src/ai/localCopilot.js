const DEFAULT_CONFIG = {
  embeddingDimensions: 384,
  chunkSize: 900,
  chunkOverlap: 140,
  embeddingBatchSize: 4,
  maxInitialEmbeddings: 160,
  maxQueryEmbeddings: 24,
  candidateCount: 18,
  topK: 4,
  summaryTopK: 10,
  contextCharBudget: 12000,
  retrievalRounds: 2,
  denseWeight: 0.42,
  sparseWeight: 0.4,
  metadataWeight: 0.18,
  memoryTurns: 8,
}

let workerInstance = null
let nextRequestId = 0
const pendingRequests = new Map()

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function zeroEmbedding(dimensions = DEFAULT_CONFIG.embeddingDimensions) {
  return new Float32Array(dimensions)
}

function hasEmbeddingValues(embedding) {
  return !!embedding && embedding.some((value) => value !== 0)
}

function getWorker() {
  if (typeof window === 'undefined') return null
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('./embeddingWorker.js', import.meta.url),
      { type: 'module' }
    )
    workerInstance.onmessage = (event) => {
      const { id, error, embedding, embeddings, type, data } = event.data
      
      // Handle model download progress updates from worker
      if (type === 'progress') {
        if (typeof window !== 'undefined' && window._ragProgressCallback) {
          window._ragProgressCallback(data)
        }
        return
      }

      const promise = pendingRequests.get(id)
      if (promise) {
        pendingRequests.delete(id)
        if (error) {
          promise.reject(new Error(error))
        } else {
          promise.resolve(embedding || embeddings)
        }
      }
    }
    workerInstance.onerror = (err) => {
      console.error('Embedding worker error:', err)
      const errorMsg = 'Embedding Web Worker failed to load or encountered a compilation error.'
      for (const [id, promise] of pendingRequests.entries()) {
        promise.reject(new Error(errorMsg))
        pendingRequests.delete(id)
      }
    }
  }
  return workerInstance
}

function requestEmbeddings(texts) {
  return new Promise((resolve, reject) => {
    const w = getWorker()
    if (!w) {
      return reject(new Error('Web Worker not supported in this environment'))
    }
    const id = nextRequestId++
    pendingRequests.set(id, { resolve, reject })
    w.postMessage({ id, texts })
  })
}

async function getEmbeddings(texts, config = {}, onProgress) {
  if (!Array.isArray(texts)) {
    return requestEmbeddings(texts)
  }

  const batchSize = Math.max(1, config.embeddingBatchSize || DEFAULT_CONFIG.embeddingBatchSize)
  const embeddings = []
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const result = await requestEmbeddings(batch)
    embeddings.push(...result)
    onProgress?.({
      phase: 'embedding',
      current: Math.min(i + batch.length, texts.length),
      total: texts.length,
    })
    await yieldToBrowser()
  }
  return embeddings
}

function normalizeWhitespace(text = '') {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function tokenize(text = '') {
  return normalizeWhitespace(text)
    .toLowerCase()
    .match(/[a-z0-9]+(?:[-_/][a-z0-9]+)*/g) || []
}

function uniqueTokens(tokens) {
  return [...new Set(tokens)]
}

function cosineSimilarity(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

function splitSentences(text = '') {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function extractSectionLabel(paragraph) {
  const firstLine = paragraph.split('\n')[0]?.trim() || ''
  if (firstLine.length > 0 && firstLine.length <= 90 && /^[A-Z0-9][A-Za-z0-9 :._()-]+$/.test(firstLine)) {
    return firstLine
  }
  return 'Body'
}

function paragraphCandidates(pageText) {
  const cleaned = normalizeWhitespace(pageText)
  if (!cleaned) return []
  const byBlocks = cleaned.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean)
  if (byBlocks.length > 0) return byBlocks
  return splitSentences(cleaned)
}

function chunkParagraph(paragraph, chunkSize, overlap) {
  if (paragraph.length <= chunkSize) return [paragraph]

  const sentences = splitSentences(paragraph)
  if (sentences.length <= 1) {
    const chunks = []
    const step = Math.max(1, chunkSize - overlap)
    for (let start = 0; start < paragraph.length; start += step) {
      chunks.push(paragraph.slice(start, start + chunkSize).trim())
    }
    return chunks.filter(Boolean)
  }

  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length <= chunkSize) {
      current = next
      continue
    }

    if (current) {
      chunks.push(current)
      const tail = current.slice(Math.max(0, current.length - overlap))
      current = `${tail} ${sentence}`.trim()
    } else {
      chunks.push(sentence.slice(0, chunkSize))
      current = sentence.slice(Math.max(0, sentence.length - overlap))
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function buildChunk(docName, pageNumber, section, paragraphIndex, text, chunkIndex) {
  const normalized = normalizeWhitespace(text)
  const tokens = tokenize(normalized)
  return {
    chunkId: `${docName}::p${pageNumber}::para${paragraphIndex}::chunk${chunkIndex}`,
    sourcePdf: docName,
    pageNumber,
    section,
    paragraphIndex,
    ingestionTimestamp: new Date().toISOString(),
    text: normalized,
    tokens,
    uniqueTokens: uniqueTokens(tokens),
    parents: {
      document: docName,
      page: `${docName}::page${pageNumber}`,
      section: `${docName}::page${pageNumber}::${section}`,
    },
  }
}

function buildSparseStats(chunks) {
  const documentFrequency = new Map()
  for (const chunk of chunks) {
    for (const token of chunk.uniqueTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)
    }
  }
  const averageLength = chunks.reduce((sum, chunk) => sum + chunk.tokens.length, 0) / Math.max(1, chunks.length)
  return { documentFrequency, averageLength }
}

function selectInitialEmbeddingIndexes(chunks, limit) {
  if (chunks.length <= limit) {
    return chunks.map((_, index) => index)
  }

  const selected = new Set([0, chunks.length - 1])
  const slots = Math.max(0, limit - selected.size)
  for (let i = 1; i <= slots; i++) {
    selected.add(Math.round((i * (chunks.length - 1)) / (slots + 1)))
  }
  return [...selected].sort((a, b) => a - b)
}

export async function ingestPdfPagesLocally({ name, pages, config = {}, onProgress }) {
  const resolved = { ...DEFAULT_CONFIG, ...config }
  const chunks = []
  const documentGroups = []
  let embeddingError = null

  onProgress?.({ phase: 'chunking', current: 0, total: pages.length })
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]
    const paragraphs = paragraphCandidates(page.text)
    const pageChunks = []
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const section = extractSectionLabel(paragraph)
      const splitChunks = chunkParagraph(paragraph, resolved.chunkSize, resolved.chunkOverlap)
      splitChunks.forEach((chunkText, chunkIndex) => {
        const chunk = buildChunk(name, page.pageNum, section, paragraphIndex, chunkText, chunkIndex)
        chunks.push(chunk)
        pageChunks.push(chunk.chunkId)
      })
    })

    documentGroups.push({
      pageNumber: page.pageNum,
      section: pageChunks[0] || null,
      chunkIds: pageChunks,
    })

    if (pageIndex % 10 === 0 || pageIndex === pages.length - 1) {
      onProgress?.({ phase: 'chunking', current: pageIndex + 1, total: pages.length })
      await yieldToBrowser()
    }
  }

  chunks.forEach((chunk) => {
    chunk.embedding = zeroEmbedding(resolved.embeddingDimensions)
  })

  const initialEmbeddingIndexes = selectInitialEmbeddingIndexes(chunks, resolved.maxInitialEmbeddings)

  if (chunks.length > 0) {
    const textsToEmbed = initialEmbeddingIndexes.map((index) => chunks[index].text)
    try {
      const embeddings = await getEmbeddings(textsToEmbed, resolved, onProgress)
      initialEmbeddingIndexes.forEach((chunkIndex, i) => {
        chunks[chunkIndex].embedding = embeddings[i] || zeroEmbedding(resolved.embeddingDimensions)
      })
    } catch (err) {
      console.warn('Falling back to lexical-only PDF index after embedding failure:', err)
      embeddingError = err.message || 'Embedding model failed'
    }
  }

  return {
    name,
    pageCount: pages.length,
    chunks,
    groups: documentGroups,
    sparse: buildSparseStats(chunks),
    embeddingStatus: embeddingError ? 'failed' : (initialEmbeddingIndexes.length < chunks.length ? 'partial' : 'ready'),
    embeddingError,
    embeddedChunkCount: embeddingError ? 0 : initialEmbeddingIndexes.length,
    totalChunkCount: chunks.length,
    config: resolved,
  }
}

function classifyQuery(query, docNames) {
  const text = query.toLowerCase()
  return {
    isComparison: /(compare|difference|versus|vs\b)/.test(text),
    isSummary: /(summari[sz]e|summ[ae]ry|summarization|summarisation|summzrize|tl;dr|overview)/.test(text),
    isAnalytical: /(why|how|analyze|analysis|reason|impact)/.test(text),
    mentionedDocs: docNames.filter((name) => text.includes(name.toLowerCase())),
    keywords: uniqueTokens(tokenize(query)),
  }
}

function sparseScore(queryTokens, chunkTokens, sparseStats, chunkCount) {
  let score = 0
  const frequencies = new Map()
  for (const token of chunkTokens) {
    frequencies.set(token, (frequencies.get(token) || 0) + 1)
  }

  for (const token of queryTokens) {
    if (!frequencies.has(token)) continue
    const tf = frequencies.get(token)
    const df = sparseStats.documentFrequency.get(token) || 1
    const idf = Math.log(1 + ((chunkCount - df + 0.5) / (df + 0.5)))
    score += tf * idf
  }
  return score
}

function metadataScore(chunk, queryInfo, memory) {
  let score = 0
  if (queryInfo.mentionedDocs.includes(chunk.sourcePdf)) score += 1
  if (memory?.activeDocs?.has(chunk.sourcePdf)) score += 0.5
  if (memory?.importantSections?.has(chunk.section)) score += 0.35
  return score
}

async function embedQueryCandidates(chunks, queryTokens, queryInfo, memory, sparseStats, config) {
  const candidates = chunks
    .map((chunk) => ({
      chunk,
      score: sparseScore(queryTokens, chunk.tokens, sparseStats, chunks.length) + metadataScore(chunk, queryInfo, memory),
    }))
    .sort((a, b) => b.score - a.score)
    .map((candidate) => candidate.chunk)
    .filter((chunk) => !hasEmbeddingValues(chunk.embedding))
    .slice(0, config.maxQueryEmbeddings)

  if (candidates.length === 0) return

  const embeddings = await getEmbeddings(candidates.map((chunk) => chunk.text), config)
  candidates.forEach((chunk, index) => {
    chunk.embedding = embeddings[index] || zeroEmbedding(config.embeddingDimensions)
  })
}

function rerankCandidates(candidates, queryTokens, queryInfo) {
  return candidates
    .map((candidate) => {
      const overlap = candidate.chunk.uniqueTokens.filter((token) => queryTokens.includes(token)).length
      const density = overlap / Math.max(1, candidate.chunk.uniqueTokens.length)
      const sectionBonus = queryInfo.isSummary && candidate.chunk.section !== 'Body' ? 0.15 : 0
      const comparisonBonus = queryInfo.isComparison ? 0.12 : 0
      return {
        ...candidate,
        rerankScore: candidate.score + density + sectionBonus + comparisonBonus,
      }
    })
    .sort((a, b) => b.rerankScore - a.rerankScore)
}

function dedupeCandidates(candidates) {
  const seen = new Set()
  return candidates.filter((candidate) => {
    const key = candidate.chunk.text.slice(0, 180)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sortChunksByDocumentOrder(chunks) {
  return [...chunks].sort((a, b) => {
    if (a.sourcePdf !== b.sourcePdf) {
      return a.sourcePdf.localeCompare(b.sourcePdf)
    }
    if (a.pageNumber !== b.pageNumber) {
      return a.pageNumber - b.pageNumber
    }
    if (a.paragraphIndex !== b.paragraphIndex) {
      return a.paragraphIndex - b.paragraphIndex
    }
    return a.chunkId.localeCompare(b.chunkId)
  })
}

function sampleDocumentChunks(chunks, limit) {
  if (chunks.length <= limit) return chunks

  const selected = new Set([0, chunks.length - 1])
  const slots = Math.max(0, limit - selected.size)
  for (let i = 1; i <= slots; i++) {
    const index = Math.round((i * (chunks.length - 1)) / (slots + 1))
    selected.add(index)
  }

  return [...selected]
    .sort((a, b) => a - b)
    .map((index) => chunks[index])
}

function selectSummaryChunks(selectedDocs, queryInfo, config) {
  const targetDocs = queryInfo.mentionedDocs.length > 0
    ? selectedDocs.filter((doc) => queryInfo.mentionedDocs.includes(doc.name))
    : selectedDocs

  const docs = targetDocs.length > 0 ? targetDocs : selectedDocs
  const perDocLimit = Math.max(1, Math.ceil(config.summaryTopK / Math.max(1, docs.length)))

  return sortChunksByDocumentOrder(
    docs.flatMap((doc) => sampleDocumentChunks(sortChunksByDocumentOrder(doc.index.chunks), perDocLimit))
  ).slice(0, config.summaryTopK)
}

function chunksToContext(chunks, charBudget) {
  const blocks = []
  let used = 0

  for (const chunk of chunks) {
    const block = `[Source: ${chunk.sourcePdf}, page ${chunk.pageNumber}, section ${chunk.section}, chunk ${chunk.chunkId}]\n${chunk.text}`
    if (blocks.length > 0 && used + block.length > charBudget) break
    blocks.push(block)
    used += block.length
  }

  return blocks.join('\n\n')
}

export async function retrieveLocalContext({ documents, query, memory, config = {} }) {
  const resolved = { ...DEFAULT_CONFIG, ...config }
  const selectedDocs = documents.filter((doc) => doc.useInAi)
  const allChunks = selectedDocs.flatMap((doc) => doc.index.chunks)
  if (allChunks.length === 0) {
    return {
      contextText: '',
      citations: [],
      debug: { candidates: [], topChunks: [] },
    }
  }

  const docNames = selectedDocs.map((doc) => doc.name)
  const queryInfo = classifyQuery(query, docNames)
  const queryTokens = queryInfo.keywords

  if (queryInfo.isSummary) {
    const topChunks = selectSummaryChunks(selectedDocs, queryInfo, resolved)
    return {
      contextText: chunksToContext(topChunks, resolved.contextCharBudget),
      citations: topChunks.map((chunk) => ({
        sourcePdf: chunk.sourcePdf,
        pageNumber: chunk.pageNumber,
        section: chunk.section,
        chunkId: chunk.chunkId,
      })),
      debug: {
        candidates: [],
        topChunks: topChunks.map((chunk) => chunk.chunkId),
        mode: 'summary-document-coverage',
      },
    }
  }
  
  const hasDenseEmbeddings = allChunks.some((chunk) => hasEmbeddingValues(chunk.embedding))
  let queryEmbedding = zeroEmbedding(resolved.embeddingDimensions)
  let queryEmbeddingError = null

  const memoryTokens = tokenize(memory?.turns?.slice(-resolved.memoryTurns).map((turn) => turn.question).join(' ') || '')
  const sparseStats = selectedDocs[0]?.index.sparse || buildSparseStats(allChunks)

  if (hasDenseEmbeddings) {
    try {
      queryEmbedding = await getEmbeddings(query, resolved)
      await embedQueryCandidates(
        allChunks,
        uniqueTokens([...queryTokens, ...memoryTokens]),
        queryInfo,
        memory,
        sparseStats,
        resolved
      )
    } catch (err) {
      console.warn('Using sparse-only retrieval after query embedding failure:', err)
      queryEmbeddingError = err.message || 'Embedding model failed'
    }
  }

  let candidatePool = []

  for (let round = 0; round < resolved.retrievalRounds; round++) {
    const expandedTokens = round === 0 ? queryTokens : uniqueTokens([...queryTokens, ...memoryTokens])
    const scores = allChunks.map((chunk) => {
      const dense = hasDenseEmbeddings && chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0
      const sparse = sparseScore(expandedTokens, chunk.tokens, sparseStats, allChunks.length)
      const metadata = metadataScore(chunk, queryInfo, memory)
      const score = (dense * resolved.denseWeight) + (sparse * resolved.sparseWeight) + (metadata * resolved.metadataWeight)
      return { chunk, score, dense, sparse, metadata, round }
    })

    candidatePool = dedupeCandidates(
      rerankCandidates(
        scores
          .sort((a, b) => b.score - a.score)
          .slice(0, resolved.candidateCount),
        expandedTokens,
        queryInfo
      )
    )
  }

  // Slices topK (4) candidate chunks and sorts them in their original document order
  const topChunks = sortChunksByDocumentOrder(
    candidatePool.slice(0, resolved.topK).map((candidate) => candidate.chunk)
  )

  const contextText = chunksToContext(topChunks, resolved.contextCharBudget)

  return {
    contextText,
    citations: topChunks.map((chunk) => ({
      sourcePdf: chunk.sourcePdf,
      pageNumber: chunk.pageNumber,
      section: chunk.section,
      chunkId: chunk.chunkId,
    })),
    debug: {
      candidates: candidatePool.map((candidate) => ({
        chunkId: candidate.chunk.chunkId,
        score: candidate.score,
        dense: candidate.dense,
        sparse: candidate.sparse,
        metadata: candidate.metadata,
      })),
      topChunks: topChunks.map((chunk) => chunk.chunkId),
      queryEmbeddingError,
    },
  }
}

export function updateLocalMemory(memory, turn) {
  const nextTurns = [...(memory?.turns || []), turn].slice(-DEFAULT_CONFIG.memoryTurns)
  const activeDocs = new Set(nextTurns.flatMap((item) => item.citations.map((citation) => citation.sourcePdf)))
  const importantSections = new Set(nextTurns.flatMap((item) => item.citations.map((citation) => citation.section)))
  return {
    turns: nextTurns,
    activeDocs,
    importantSections,
  }
}
