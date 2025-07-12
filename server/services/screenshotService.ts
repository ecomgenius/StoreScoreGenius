import puppeteer from 'puppeteer';

export async function captureStoreScreenshot(url: string): Promise<string | null> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    const page = await browser.newPage();
    
    // Set viewport for consistent screenshots
    await page.setViewport({
      width: 1200,
      height: 800,
      deviceScaleFactor: 1
    });

    // Set user agent to avoid blocking
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to the page with timeout
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Wait a bit for dynamic content to load
    await page.waitForTimeout(2000);

    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 60, // Compress for smaller size
      fullPage: false, // Only capture above the fold
    });

    await browser.close();
    
    // Convert to base64
    return Buffer.from(screenshot).toString('base64');
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    if (browser) {
      await browser.close();
    }
    return null;
  }
}