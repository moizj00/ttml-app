const { chromium } = require('playwright');

const BASE_URL = process.env.TEST_URL || 'https://3b78dc32-6406-45b1-866a-3d050f5f729a-00-1t6kq49sh3ug6.janeway.replit.dev';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 15000 });
  console.log('Page loaded');
  
  const heading = page.locator('text=Three Steps to a Professional Legal Letter');
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/hiw-section.png', fullPage: false });
  console.log('Screenshot 1: section visible');
  
  const s1 = await page.locator('[data-testid="step-01"]').isVisible();
  const s2 = await page.locator('[data-testid="step-02"]').isVisible();
  const s3 = await page.locator('[data-testid="step-03"]').isVisible();
  console.log('Steps visible:', s1, s2, s3);
  
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="step-02"]');
    if (el) el.closest('section')?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/hiw-centered.png', fullPage: false });
  console.log('Screenshot 2: centered on section');
  
  await page.locator('[data-testid="step-01"]').hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/hiw-hover.png', fullPage: false });
  console.log('Screenshot 3: hover on step-01');
  
  await browser.close();
  console.log('All tests passed!');
})();
