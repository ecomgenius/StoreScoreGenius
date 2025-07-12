import { analyzeStoreWithAI, type StoreAnalysisData } from './openai';
import type { StoreAnalysisResult } from '@shared/schema';

export async function analyzeShopifyStore(storeUrl: string): Promise<StoreAnalysisResult> {
  try {
    // Fetch store content using web scraping
    const response = await fetch(storeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch store: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
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
    throw new Error("Failed to analyze Shopify store: " + error.message);
  }
}

export async function analyzeEbayStore(username: string): Promise<StoreAnalysisResult> {
  try {
    // Construct eBay store URL
    const storeUrl = `https://www.ebay.com/sch/i.html?_nkw=&_armrs=1&_ipg=&_from=&_ssn=${username}`;
    
    const response = await fetch(storeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch eBay store: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
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
    throw new Error("Failed to analyze eBay store: " + error.message);
  }
}
