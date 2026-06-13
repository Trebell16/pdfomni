import { test, expect } from '@playwright/test'
import path from 'path'

const ARTIFACT_DIR = 'C:/Users/slato/.gemini/antigravity/brain/6ec2e66e-342d-4b9e-b2ff-5456ebc5a09a'

test.describe('Edit PDF Tool iframe integration and styles', () => {
  test('should load /tool/edit within iframe and screenshot desktop layout', async ({ page }) => {
    // Navigate to React route
    await page.goto('/tool/edit')
    
    // Wait for the iframe to load
    const iframe = page.frameLocator('iframe[title="PDF Editor"]')
    
    // Verify that the logo text is PDFOmni inside the iframe
    await expect(iframe.locator('.logo-text')).toContainText('PDFOmni')
    
    // Verify that the "All Tools" back button is visible inside the iframe
    await expect(iframe.locator('text=All Tools')).toBeVisible()
    
    // Verify dropzone title inside the iframe
    await expect(iframe.locator('text=Open a PDF to edit')).toBeVisible()
    
    // Take a screenshot of the desktop layout and save it to the artifacts directory
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desktop-editpdf.png'), fullPage: true })
    console.log('Desktop screenshot saved.')
  })

  test('should display mobile sticky ad on mobile viewports inside iframe', async ({ page }) => {
    // Set viewport to mobile
    await page.setViewportSize({ width: 375, height: 812 })
    
    // Navigate directly to React route
    await page.goto('/tool/edit')
    
    // Wait for the iframe to load
    const iframe = page.frameLocator('iframe[title="PDF Editor"]')
    
    // Verify dropzone title is visible
    await expect(iframe.locator('text=Open a PDF to edit')).toBeVisible()
    
    // Verify that the mobile sticky ad container is visible inside the iframe
    const mobileAd = iframe.locator('.mobile-sticky-ad')
    await expect(mobileAd).toBeVisible()
    
    // Take a screenshot of the mobile layout
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile-editpdf.png') })
    console.log('Mobile screenshot saved.')
  })
})

