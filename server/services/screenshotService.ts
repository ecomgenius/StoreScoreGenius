import puppeteer from 'puppeteer';

// Generate a simple placeholder screenshot as SVG and convert to base64
function generatePlaceholderScreenshot(url: string): string {
  const domain = new URL(url).hostname;
  const isEbay = domain.includes('ebay');
  const isShopify = domain.includes('shopify') || domain.includes('myshopify');
  
  const svg = `
    <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="600" fill="${isEbay ? '#e53238' : isShopify ? '#7AB55C' : '#f8f9fa'}"/>
      <rect x="0" y="0" width="800" height="80" fill="${isEbay ? '#0064d2' : isShopify ? '#004c3f' : '#343a40'}"/>
      <text x="40" y="50" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold">
        ${isEbay ? 'eBay Store' : isShopify ? 'Shopify Store' : 'Store Preview'}
      </text>
      <text x="40" y="150" fill="${isEbay ? 'white' : isShopify ? 'white' : '#343a40'}" font-family="Arial, sans-serif" font-size="16">
        ${domain}
      </text>
      <rect x="40" y="200" width="720" height="300" fill="white" stroke="#dee2e6" stroke-width="2" rx="8"/>
      <text x="400" y="350" fill="#6c757d" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">
        Store Screenshot Preview
      </text>
      <text x="400" y="380" fill="#6c757d" font-family="Arial, sans-serif" font-size="14" text-anchor="middle">
        Live analysis in progress...
      </text>
    </svg>
  `;
  
  return Buffer.from(svg).toString('base64');
}

export async function captureStoreScreenshot(url: string): Promise<string | null> {
  let browser;
  try {
    console.log(`📸 Starting screenshot capture for: ${url}`);
    
    // Try to use Puppeteer first
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-extensions',
        '--no-zygote'
      ]
    });

    const page = await browser.newPage();
    
    await page.setViewport({
      width: 1200,
      height: 800,
      deviceScaleFactor: 1
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`📄 Navigating to URL: ${url}`);
    
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    await page.waitForTimeout(2000);

    console.log(`📷 Taking screenshot...`);
    
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 60,
      fullPage: false,
    });

    await browser.close();
    
    const base64Screenshot = Buffer.from(screenshot).toString('base64');
    console.log(`✅ Screenshot captured successfully! Size: ${Math.round(base64Screenshot.length / 1024)}KB`);
    
    return base64Screenshot;
  } catch (error) {
    console.error('❌ Screenshot capture failed:', error.message);
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
    
    // Fallback to placeholder screenshot
    console.log('🔄 Generating placeholder screenshot...');
    const placeholderScreenshot = generatePlaceholderScreenshot(url);
    console.log(`✅ Placeholder screenshot generated! Size: ${Math.round(placeholderScreenshot.length / 1024)}KB`);
    return placeholderScreenshot;
  }
}