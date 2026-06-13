import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Compress PDF Tool', () => {
  test('should load the compressor tool in iframe and capture screenshots', async ({ page }) => {
    // 1. Navigate to the tool page
    await page.goto('/tool/compress');

    // 2. Wait for the main page to render the title
    const heading = page.locator('h1:has-text("Compress PDF")');
    await expect(heading).toBeVisible({ timeout: 10000 });

    // 3. Locate the iframe frame locator
    const frameLocator = page.frameLocator('iframe[title="PDF Compressor"]');

    // 4. Ensure the upload zone is visible inside the iframe
    const uploadZone = frameLocator.locator('text=Drop your PDF here');
    await expect(uploadZone).toBeVisible({ timeout: 10000 });

    // 6. Make sure screens directory exists
    const screensDir = path.join(__dirname, 'screens');
    if (!fs.existsSync(screensDir)) {
      fs.mkdirSync(screensDir, { recursive: true });
    }

    // 7. Take a screenshot of the idle / upload state
    const screenshotPath = path.join(screensDir, 'compressor-idle.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to: ${screenshotPath}`);
  });
});
