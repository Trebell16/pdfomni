import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Create a small test PDF using a script
const TEST_PDF_PATH = path.join(__dirname, 'fixtures', 'test.pdf')

test.beforeAll(async () => {
  // Create fixtures directory and a minimal PDF file for testing
  const fixturesDir = path.join(__dirname, 'fixtures')
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true })
  }
  
  // Minimal valid PDF
  if (!fs.existsSync(TEST_PDF_PATH)) {
    const minimalPDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 2/Kids[3 0 R 5 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<<>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 24 Tf 100 700 Td (Page 1) Tj ET
endstream
endobj
5 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 6 0 R/Resources<<>>>>endobj
6 0 obj<</Length 44>>stream
BT /F1 24 Tf 100 700 Td (Page 2) Tj ET
endstream
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000320 00000 n 
0000000429 00000 n 
trailer<</Size 7/Root 1 0 R>>
startxref
525
%%EOF`
    fs.writeFileSync(TEST_PDF_PATH, minimalPDF)
  }
})

// ── Home Page Tests ──

test.describe('Home Page', () => {
  test('should load the landing page with hero section', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#hero')).toBeVisible()
    await expect(page.locator('text=Every PDF tool you need')).toBeVisible()
    await expect(page.locator('text=completely private')).toBeVisible()
  })

  test('should display the header with logo and navigation', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#header')).toBeVisible()
    await expect(page.locator('.header-logo-text')).toBeVisible()
    await expect(page.locator('#nav-workflow')).toBeVisible()
    await expect(page.locator('#nav-chat')).toBeVisible()
  })

  test('should display all tool categories', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Organize & Optimize')).toBeVisible()
    await expect(page.locator('text=Convert to PDF')).toBeVisible()
    await expect(page.locator('text=Convert from PDF')).toBeVisible()
    await expect(page.locator('text=Edit & Annotate')).toBeVisible()
    await expect(page.locator('text=Security')).toBeVisible()
    await expect(page.locator('text=Advanced')).toBeVisible()
  })

  test('should display tool cards for organize tools', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#tool-card-merge')).toBeVisible()
    await expect(page.locator('#tool-card-split')).toBeVisible()
    await expect(page.locator('#tool-card-reorder')).toBeVisible()
    await expect(page.locator('#tool-card-compress')).toBeVisible()
    await expect(page.locator('#tool-card-rotate')).toBeVisible()
  })

  test('should navigate to merge tool page', async ({ page }) => {
    await page.goto('/')
    await page.locator('#tool-card-merge').click()
    await expect(page).toHaveURL('/tool/merge')
    await expect(page.locator('#tool-page-merge')).toBeVisible()
    await expect(page.locator('text=Merge PDF')).toBeVisible()
  })

  test('should display footer with privacy badge', async ({ page }) => {
    await page.goto('/')
    await page.locator('#footer').scrollIntoViewIfNeeded()
    await expect(page.locator('#footer')).toBeVisible()
    await expect(page.locator('#footer').locator('text=Zero-Knowledge Architecture')).toBeVisible()
  })
})

// ── Tool Page Navigation Tests ──

test.describe('Tool Pages', () => {
  const toolIds = [
    'merge', 'split', 'reorder', 'compress', 'rotate', 'page-numbers',
    'word-to-pdf', 'excel-to-pdf', 'image-to-pdf', 'html-to-pdf',
    'pdf-to-image', 'pdf-to-text',
    'watermark', 'redact', 'crop',
    'encrypt', 'decrypt', 'sign',
    'batch', 'wcag',
  ]

  for (const toolId of toolIds) {
    test(`should load tool page: ${toolId}`, async ({ page }) => {
      await page.goto(`/tool/${toolId}`)
      await expect(page.locator(`#tool-page-${toolId}`)).toBeVisible()
      // Each tool page should have a back link
      await expect(page.locator('text=All Tools')).toBeVisible()
    })
  }
})

// ── Merge Tool Tests ──

test.describe('Merge Tool', () => {
  test('should show file drop zone', async ({ page }) => {
    await page.goto('/tool/merge')
    await expect(page.locator('#merge-dropzone')).toBeVisible()
    await expect(page.locator('text=Drop your PDF files here to merge')).toBeVisible()
  })

  test('should upload PDF files and show file list', async ({ page }) => {
    await page.goto('/tool/merge')
    // Upload files via the hidden file input
    const fileInput = page.locator('#merge-dropzone-input')
    await fileInput.setInputFiles([TEST_PDF_PATH, TEST_PDF_PATH])
    
    // Should show file list now
    await expect(page.locator('#merge-file-0')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('#merge-file-1')).toBeVisible()
    // Merge button should be visible
    await expect(page.locator('#merge-btn')).toBeVisible()
  })
})

// ── Split Tool Tests ──

test.describe('Split Tool', () => {
  test('should show file drop zone', async ({ page }) => {
    await page.goto('/tool/split')
    await expect(page.locator('text=Drop your PDF file here')).toBeVisible()
  })
})

// ── Workflow Page Tests ──

test.describe('Workflow Page', () => {
  test('should load workflow builder', async ({ page }) => {
    await page.goto('/workflow')
    await expect(page.locator('#workflow-page')).toBeVisible()
    await expect(page.locator('#workflow-sidebar')).toBeVisible()
    await expect(page.locator('#workflow-toolbar')).toBeVisible()
  })

  test('should display node library sidebar', async ({ page }) => {
    await page.goto('/workflow')
    await expect(page.locator('text=Node Library')).toBeVisible()
    await expect(page.locator('text=Input')).toBeVisible()
    await expect(page.locator('text=Process')).toBeVisible()
    await expect(page.locator('text=Filter')).toBeVisible()
    await expect(page.locator('text=Output')).toBeVisible()
  })

  test('should show empty state message', async ({ page }) => {
    await page.goto('/workflow')
    await expect(page.locator('text=Build Your Workflow')).toBeVisible()
    await expect(page.locator('text=Drag nodes from the sidebar')).toBeVisible()
  })

  test('should have execute button disabled when no nodes', async ({ page }) => {
    await page.goto('/workflow')
    const executeBtn = page.locator('#wf-execute-btn')
    await expect(executeBtn).toBeVisible()
    await expect(executeBtn).toBeDisabled()
  })

  test('should have save and load buttons', async ({ page }) => {
    await page.goto('/workflow')
    await expect(page.locator('#wf-save-btn')).toBeVisible()
    await expect(page.locator('#wf-load-btn')).toBeVisible()
    await expect(page.locator('#wf-clear-btn')).toBeVisible()
  })
})

// ── AI Chat Tests ──

test.describe('AI Chat', () => {
  test('should open chat sidebar when clicking AI Chat button', async ({ page }) => {
    await page.goto('/')
    await page.locator('#nav-chat').click()
    await expect(page.locator('#chat-sidebar')).toBeVisible()
    await expect(page.locator('text=AI Copilot')).toBeVisible()
  })

  test('should show API key prompt when trying to send without key', async ({ page }) => {
    await page.goto('/')
    // Clear any stored key
    await page.evaluate(() => localStorage.removeItem('pdfomni_api_key'))
    
    await page.locator('#nav-chat').click()
    await expect(page.locator('#chat-sidebar')).toBeVisible()
    const chatInput = page.locator('#chat-input')
    await expect(chatInput).toBeVisible()
    await chatInput.fill('Hello')
    await page.locator('#chat-send').click()
    
    // Should show API key modal or toast
    await expect(page.getByRole('heading', { name: 'OpenRouter API Key' })).toBeVisible({ timeout: 5000 })
  })

  test('should close chat sidebar', async ({ page }) => {
    await page.goto('/')
    await page.locator('#nav-chat').click()
    await expect(page.locator('#chat-sidebar')).toBeVisible()
    
    // Close it
    await page.locator('#nav-chat').click()
    await expect(page.locator('#chat-sidebar')).not.toBeVisible()
  })
})

// ── WCAG Tool Tests ──

test.describe('WCAG Tool', () => {
  test('should show drop zone', async ({ page }) => {
    await page.goto('/tool/wcag')
    await expect(page.locator('#wcag-dropzone')).toBeVisible()
    await expect(page.locator('text=Drop a PDF to scan for accessibility')).toBeVisible()
  })
})

// ── Batch Tool Tests ──

test.describe('Batch Tool', () => {
  test('should show drop zone', async ({ page }) => {
    await page.goto('/tool/batch')
    await expect(page.locator('#batch-dropzone')).toBeVisible()
    await expect(page.locator('text=Drop PDF files for batch processing')).toBeVisible()
  })
})

// ── Responsive Tests ──

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await expect(page.locator('#hero')).toBeVisible()
    await expect(page.locator('#tool-card-merge')).toBeVisible()
  })

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await expect(page.locator('#hero')).toBeVisible()
    await expect(page.locator('#tool-card-merge')).toBeVisible()
  })
})

// ── Security Tools Tests ──

test.describe('Security Tools', () => {
  test('should load encrypt tool with drop zone', async ({ page }) => {
    await page.goto('/tool/encrypt')
    await expect(page.locator('text=Protect PDF')).toBeVisible()
  })

  test('should load decrypt tool with drop zone', async ({ page }) => {
    await page.goto('/tool/decrypt')
    await expect(page.locator('text=Unlock PDF')).toBeVisible()
  })

  test('should load sign tool', async ({ page }) => {
    await page.goto('/tool/sign')
    await expect(page.locator('#tool-page-sign')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sign PDF' }).first()).toBeVisible()
  })
})

// ── Edit Tools Tests ──

test.describe('Edit Tools', () => {
  test.skip('should load edit tool', async ({ page }) => {
    await page.goto('/tool/edit')
    await expect(page.locator('#tool-page-edit')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Edit PDF' }).first()).toBeVisible()
  })

  test('should load watermark tool', async ({ page }) => {
    await page.goto('/tool/watermark')
    await expect(page.locator('#tool-page-watermark')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Add Watermark' }).first()).toBeVisible()
  })

  test('should load redact tool', async ({ page }) => {
    await page.goto('/tool/redact')
    await expect(page.locator('#tool-page-redact')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Redact/ }).first()).toBeVisible()
  })

  test('should load crop tool', async ({ page }) => {
    await page.goto('/tool/crop')
    await expect(page.locator('text=Crop Pages')).toBeVisible()
  })
})

// ── Conversion Tools Tests ──

test.describe('Conversion Tools', () => {
  test('should load image-to-pdf tool', async ({ page }) => {
    await page.goto('/tool/image-to-pdf')
    await expect(page.locator('text=Image to PDF')).toBeVisible()
  })

  test('should load pdf-to-image tool', async ({ page }) => {
    await page.goto('/tool/pdf-to-image')
    await expect(page.locator('text=PDF to Image')).toBeVisible()
  })

  test('should load pdf-to-text tool', async ({ page }) => {
    await page.goto('/tool/pdf-to-text')
    await expect(page.locator('text=PDF to Text')).toBeVisible()
  })

  test('should load word-to-pdf tool', async ({ page }) => {
    await page.goto('/tool/word-to-pdf')
    await expect(page.locator('text=Word to PDF')).toBeVisible()
  })

  test('should load excel-to-pdf tool', async ({ page }) => {
    await page.goto('/tool/excel-to-pdf')
    await expect(page.locator('text=Excel to PDF')).toBeVisible()
  })

  test('should load html-to-pdf tool', async ({ page }) => {
    await page.goto('/tool/html-to-pdf')
    await expect(page.locator('text=HTML to PDF')).toBeVisible()
  })
})
