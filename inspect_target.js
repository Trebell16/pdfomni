import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    console.log('Navigating to http://localhost:5173 ...');
    await page.goto('http://localhost:5173', { timeout: 15000 });
    const html = await page.content();
    console.log('HTML length:', html.length);
    console.log('HTML snippet:', html.substring(0, 1500));
  } catch (error) {
    console.error(error);
  } finally {
    await browser.close();
  }
})();
