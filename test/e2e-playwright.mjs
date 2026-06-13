import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

const baseUrl = 'http://127.0.0.1:4174';
const testDir = 'H:/Github Repositories/pdfomni/test';
const downloadDir = path.join(testDir, 'downloads');
const apiKeys = Array.from({ length: 15 }, (_, index) => process.env[`OPENROUTER_API_KEY${index === 0 ? '' : `_${index + 1}`}`]).filter(Boolean);

const files = {
  economy: path.join(testDir, 'The Indian Economy-A Review_Jan 2024.pdf'),
  scannedPdf: path.join(testDir, 'img pdf.pdf'),
  image: path.join(testDir, 'img.png'),
};

await fs.mkdir(downloadDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
let context = null;
let page = null;

async function newSession() {
  if (page) {
    await page.close().catch(() => {});
  }

  if (context) {
    await context.close().catch(() => {});
  }

  context = await browser.newContext({ acceptDownloads: true });
  page = await context.newPage();
}

async function waitForCondition(predicate, { timeoutMs = 60000, intervalMs = 1000 } = {}) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await predicate()) {
      return;
    }

    await page.waitForTimeout(intervalMs);
  }

  throw new Error('Timed out waiting for condition.');
}

async function saveDownload(download, filenameHint) {
  const savePath = path.join(downloadDir, filenameHint ?? await download.suggestedFilename());
  await download.saveAs(savePath);
  return savePath;
}

async function gotoRoute(route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
}

async function uploadFiles(filePaths) {
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(filePaths);
  await page.waitForTimeout(800);
}

async function clearUploadsIfPresent() {
  const clearButton = page.getByRole('button', { name: 'Clear Uploads' });
  if (await clearButton.count()) {
    await clearButton.click();
  }
}

async function setApiKeyIfNeeded() {
  await gotoRoute('/copilot');
}

async function testMerge() {
  await gotoRoute('/tools/merge');
  await clearUploadsIfPresent();
  await uploadFiles([files.economy, files.scannedPdf]);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Run Tool' }).click();
  const outputPath = await saveDownload(await downloadPromise, 'merge-output.pdf');
  const doc = await PDFDocument.load(await fs.readFile(outputPath));
  assert(doc.getPageCount() > 70, 'Merged PDF should contain combined pages.');
}

async function testSplitRange() {
  await gotoRoute('/tools/split');
  await clearUploadsIfPresent();
  await uploadFiles([files.economy]);
  await page.locator('select').selectOption('ranges');
  await page.locator('input[placeholder="1-3, 6-8"]').fill('1-2');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Run Tool' }).click();
  const outputPath = await saveDownload(await downloadPromise, 'split-range.pdf');
  const doc = await PDFDocument.load(await fs.readFile(outputPath));
  assert.equal(doc.getPageCount(), 2, 'Split range output should contain selected pages.');
}

async function testSplitEven() {
  await gotoRoute('/tools/split');
  await clearUploadsIfPresent();
  await uploadFiles([files.economy]);
  await page.locator('select').selectOption('even');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Run Tool' }).click();
  const outputPath = await saveDownload(await downloadPromise, 'split-even.pdf');
  const doc = await PDFDocument.load(await fs.readFile(outputPath));
  assert(doc.getPageCount() > 20, 'Even split should output many pages.');
}

async function testCompress() {
  await gotoRoute('/tools/compress');
  await clearUploadsIfPresent();
  await uploadFiles([files.economy]);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Run Tool' }).click();
  const outputPath = await saveDownload(await downloadPromise, 'compressed.pdf');
  const stat = await fs.stat(outputPath);
  assert(stat.size > 0, 'Compressed PDF should download.');
}

async function testEditTextPdf() {
  await gotoRoute('/tools/edit');
  await clearUploadsIfPresent();
  await uploadFiles([files.economy]);
  await page.getByRole('button', { name: 'Extract Text' }).click();
  await page.waitForTimeout(4000);
  const textarea = page.locator('textarea');
  const text = await textarea.inputValue();
  assert(text.length > 5000 && /A Review|Indian Economy|What Made the Indian Economy Resilient/i.test(text), 'Text PDF should extract readable text.');

  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export as PDF' }).click();
  const pdfPath = await saveDownload(await pdfDownload, 'edited-export.pdf');
  const pdfDoc = await PDFDocument.load(await fs.readFile(pdfPath));
  assert(pdfDoc.getPageCount() >= 1, 'Edited PDF export should be readable.');

  const docxDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export as DOCX' }).click();
  const docxPath = await saveDownload(await docxDownload, 'edited-export.docx');
  const docxStat = await fs.stat(docxPath);
  assert(docxStat.size > 0, 'DOCX export should download.');
}

async function testEditScannedPdf() {
  await gotoRoute('/tools/edit');
  await clearUploadsIfPresent();
  await uploadFiles([files.scannedPdf]);
  await page.getByRole('button', { name: 'Extract Text' }).click();
  await waitForCondition(async () => (await page.locator('textarea').inputValue()).trim().length > 20, {
    timeoutMs: 90000,
    intervalMs: 2000,
  });
  const text = await page.locator('textarea').inputValue();
  assert(text.trim().length > 20, 'Scanned PDF OCR should produce extracted text.');
}

async function testPdfToWord() {
  await gotoRoute('/tools/pdf-to-word');
  await clearUploadsIfPresent();
  await uploadFiles([files.economy]);
  await page.getByRole('button', { name: 'Extract Text' }).click();
  await waitForCondition(async () => (await page.locator('textarea').inputValue()).trim().length > 1000, {
    timeoutMs: 30000,
    intervalMs: 1000,
  });
  const docxDownload = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: 'Export as DOCX' }).click();
  const docxPath = await saveDownload(await docxDownload, 'pdf-to-word.docx');
  const stat = await fs.stat(docxPath);
  assert(stat.size > 0, 'PDF to Word should produce a DOCX file.');
}

async function testTextWatermark() {
  await gotoRoute('/tools/watermark');
  await clearUploadsIfPresent();
  await uploadFiles([files.economy]);
  await page.locator('input[placeholder="CONFIDENTIAL"]').fill('PLAYWRIGHT WATERMARK');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Run Tool' }).click();
  const outputPath = await saveDownload(await downloadPromise, 'watermark-text.pdf');
  const stat = await fs.stat(outputPath);
  assert(stat.size > 0, 'Text watermark output should download.');
}

async function testImageWatermark() {
  await gotoRoute('/tools/watermark');
  await clearUploadsIfPresent();
  await uploadFiles([files.economy, files.image]);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Run Tool' }).click();
  const outputPath = await saveDownload(await downloadPromise, 'watermark-image.pdf');
  const stat = await fs.stat(outputPath);
  assert(stat.size > 0, 'Image watermark output should download.');
}

async function testProtect() {
  await gotoRoute('/tools/protect');
  await clearUploadsIfPresent();
  await uploadFiles([files.economy]);
  await page.getByLabel('Password').fill('playwright-secret');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Run Tool' }).click();
  const outputPath = await saveDownload(await downloadPromise, 'protected.pdf');
  let encrypted = false;
  try {
    await PDFDocument.load(await fs.readFile(outputPath));
  } catch {
    encrypted = true;
  }
  assert(encrypted, 'Protected PDF should not open without a password.');
}

async function testConvertToPdf() {
  await gotoRoute('/tools/convert-to-pdf');
  await clearUploadsIfPresent();
  await uploadFiles([files.image]);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Run Tool' }).click();
  const outputPath = await saveDownload(await downloadPromise, 'convert-to-pdf.pdf');
  const doc = await PDFDocument.load(await fs.readFile(outputPath));
  assert.equal(doc.getPageCount(), 1, 'Convert to PDF should create one-page PDF from image.');
}

async function testImageToPdf() {
  await gotoRoute('/tools/image-to-pdf');
  await clearUploadsIfPresent();
  await uploadFiles([files.image]);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Run Tool' }).click();
  const outputPath = await saveDownload(await downloadPromise, 'image-to-pdf.pdf');
  const doc = await PDFDocument.load(await fs.readFile(outputPath));
  assert.equal(doc.getPageCount(), 1, 'Image to PDF should create one-page PDF.');
}

async function testImageReplacement() {
  await gotoRoute('/image-replacement');
  await uploadFiles([files.scannedPdf, files.image]);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Replace Image/ }).click();
  const outputPath = await saveDownload(await downloadPromise, 'image-replaced.pdf');
  const stat = await fs.stat(outputPath);
  assert(stat.size > 0, 'Image replacement should export a PDF.');
}

async function testCompare() {
  await gotoRoute('/compare');
  await uploadFiles([files.economy, files.scannedPdf]);
  await page.getByRole('button', { name: 'Compare PDFs' }).click();
  await page.waitForTimeout(9000);
  const text = await page.locator('body').innerText();
  assert(text.includes('Comparison Result'), 'Compare page should produce a comparison summary.');
}

async function testAccessibility() {
  await gotoRoute('/accessibility');
  await uploadFiles([files.scannedPdf]);
  await page.getByRole('button', { name: 'Analyze Uploaded PDF' }).click();
  await waitForCondition(
    async () => {
      const text = await page.locator('body').innerText();
      return text.includes('Scanned content detected') || text.includes('Readable text layer detected');
    },
    { timeoutMs: 90000, intervalMs: 2000 },
  );
  const text = await page.locator('body').innerText();
  assert(text.includes('Scanned content detected') || text.includes('Readable text layer detected'), 'Accessibility scan should produce findings.');
}

async function testBatch() {
  await gotoRoute('/batch');
  await uploadFiles([files.economy, files.scannedPdf]);
  await page.getByRole('button', { name: 'Apply Rename Rules' }).click();
  await page.waitForTimeout(500);
  const text = await page.locator('body').innerText();
  assert(text.includes('Prepared') || text.includes('Batch_01_'), 'Batch page should update status or previews.');
}

async function testWorkflow() {
  await gotoRoute('/workflow');
  await page.getByRole('button', { name: 'New Workflow' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Run workflow' }).click();
  await page.waitForTimeout(300);
  const text = await page.locator('body').innerText();
  assert(
    text.includes('saved locally') ||
      text.includes('prepared for') ||
      text.includes('Upload files first so the starter workflow has something to run against.'),
    'Workflow actions should update status.',
  );
}

async function testCopilot() {
  assert(apiKeys.length > 0, 'At least one OpenRouter API key is required for the Copilot test.');
  let lastError = null;

  for (const key of apiKeys) {
    try {
      await setApiKeyIfNeeded();
      await page.getByLabel('OpenRouter API key').fill(key);
      await page.getByRole('button', { name: /Save Key Local/i }).first().click();
      await page.waitForTimeout(500);
      await uploadFiles([files.economy]);
      await page.getByLabel('Ask anything about your documents').fill('What does the report say about mineral inputs for electric cars and wind plants in the clean energy transition discussion? Mention the page number if possible.');
      await page.locator('.send-button').click();
      await waitForCondition(
        async () => {
          const text = await page.locator('body').innerText();
          return /electric car|required six times the mineral inputs|wind plant required nine times|nine times more mineral resources|clean energy transition/i.test(text);
        },
        { timeoutMs: 140000, intervalMs: 5000 },
      );
      const text = await page.locator('body').innerText();
      assert(/electric car|required six times the mineral inputs|wind plant required nine times|nine times more mineral resources|clean energy transition/i.test(text), 'Copilot should answer using later document pages.');
      return;
    } catch (error) {
      lastError = error;
      await gotoRoute('/copilot');
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('Copilot test failed for all provided API keys.'));
}

const tests = [
  ['merge', testMerge],
  ['split-range', testSplitRange],
  ['split-even', testSplitEven],
  ['compress', testCompress],
  ['edit-text-pdf', testEditTextPdf],
  ['edit-scanned-pdf', testEditScannedPdf],
  ['pdf-to-word', testPdfToWord],
  ['watermark-text', testTextWatermark],
  ['watermark-image', testImageWatermark],
  ['protect', testProtect],
  ['convert-to-pdf', testConvertToPdf],
  ['image-to-pdf', testImageToPdf],
  ['image-replacement', testImageReplacement],
  ['compare', testCompare],
  ['accessibility', testAccessibility],
  ['batch', testBatch],
  ['workflow', testWorkflow],
  ['copilot', testCopilot],
];

const results = [];

for (const [name, fn] of tests) {
  try {
    await newSession();
    await fn();
    results.push({ name, status: 'passed' });
  } catch (error) {
    results.push({ name, status: 'failed', error: error instanceof Error ? error.message : String(error) });
  }
}

if (page) {
  await page.close().catch(() => {});
}
if (context) {
  await context.close().catch(() => {});
}
await browser.close();

console.log(JSON.stringify(results, null, 2));

const failed = results.filter((result) => result.status === 'failed');
if (failed.length) {
  process.exitCode = 1;
}
