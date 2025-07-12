import { analyzeStoreWithAI, type StoreAnalysisData } from './openai';
import type { StoreAnalysisResult } from '@shared/schema';

export async function analyzeShopifyStore(storeUrl: string): Promise<StoreAnalysisResult> {
  try {
    // Multiple strategies to fetch store content
    let html = '';
    let fetchSuccess = false;
    
    // Strategy 1: Try with different user agents
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    for (const userAgent of userAgents) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(storeUrl, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          },
          redirect: 'follow',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          html = await response.text();
          fetchSuccess = true;
          break;
        }
      } catch (err: any) {
        console.log(`Failed with user agent: ${userAgent}`, err.message);
        continue;
      }
    }

    // If fetching fails, create a simulated analysis based on URL
    if (!fetchSuccess || !html) {
      console.log("Direct fetch failed, creating analysis based on URL and domain");
      const analysisData: StoreAnalysisData = {
        storeContent: `Store URL: ${storeUrl}. This appears to be a Shopify store. Unable to fetch detailed content due to access restrictions, but analyzing based on URL structure and common Shopify patterns.`,
        storeType: 'shopify',
        storeUrl
      };
      return await analyzeStoreWithAI(analysisData);
    }
    
    // Extract meaningful content from HTML
    const contentMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = contentMatch ? contentMatch[1] : html;
    
    // Remove scripts and styles, keep text content
    const cleanContent = bodyContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000); // Limit content length for AI processing

    const analysisData: StoreAnalysisData = {
      storeContent: cleanContent,
      storeType: 'shopify',
      storeUrl
    };

    return await analyzeStoreWithAI(analysisData);
  } catch (error) {
    console.error("Shopify store analysis failed:", error);
    
    // Fallback: Create analysis based on URL only
    const analysisData: StoreAnalysisData = {
      storeContent: `Store URL: ${storeUrl}. This is a Shopify store that requires analysis based on URL structure and common e-commerce patterns due to access restrictions.`,
      storeType: 'shopify',
      storeUrl
    };
    
    return await analyzeStoreWithAI(analysisData);
  }
}

export async function analyzeEbayStore(username: string): Promise<StoreAnalysisResult> {
  try {
    // Construct eBay store URL
    const storeUrl = `https://www.ebay.com/sch/i.html?_nkw=&_armrs=1&_ipg=&_from=&_ssn=${username}`;
    
    let html = '';
    let fetchSuccess = false;
    
    // Try multiple approaches to fetch eBay content
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    for (const userAgent of userAgents) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(storeUrl, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          },
          redirect: 'follow',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          html = await response.text();
          fetchSuccess = true;
          break;
        }
      } catch (err: any) {
        console.log(`Failed eBay fetch with user agent: ${userAgent}`, err.message);
        continue;
      }
    }

    // If fetching fails, create analysis based on username
    if (!fetchSuccess || !html) {
      console.log("eBay direct fetch failed, creating analysis based on username");
      const analysisData: StoreAnalysisData = {
        storeContent: `eBay Username: ${username}. This is an eBay seller account. Analysis based on common eBay selling patterns and username structure due to access restrictions.`,
        storeType: 'ebay',
        ebayUsername: username
      };
      return await analyzeStoreWithAI(analysisData);
    }
    
    // Extract meaningful content from HTML
    const contentMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = contentMatch ? contentMatch[1] : html;
    
    // Remove scripts and styles, keep text content
    const cleanContent = bodyContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000); // Limit content length for AI processing

    const analysisData: StoreAnalysisData = {
      storeContent: cleanContent,
      storeType: 'ebay',
      ebayUsername: username
    };

    return await analyzeStoreWithAI(analysisData);
  } catch (error) {
    console.error("eBay store analysis failed:", error);
    
    // Fallback: Create analysis based on username only
    const analysisData: StoreAnalysisData = {
      storeContent: `eBay Username: ${username}. This is an eBay seller account that requires analysis based on platform patterns and best practices.`,
      storeType: 'ebay',
      ebayUsername: username
    };
    
    return await analyzeStoreWithAI(analysisData);
  }
}
