import crypto from 'crypto';
import { storage } from '../storage';

export interface StoreContentFingerprint {
  contentHash: string;
  keyElements: {
    title: string;
    description: string;
    productCount: number;
    mainCategories: string[];
    priceRange: string;
    lastModified?: string;
  };
}

/**
 * Creates a content fingerprint for store change detection
 */
export function createStoreFingerprint(html: string, storeUrl: string): StoreContentFingerprint {
  // Extract key content elements that would indicate meaningful changes
  const title = extractText(html, /<title[^>]*>(.*?)<\/title>/i) || 'No title';
  const description = extractText(html, /<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i) || 
                     extractText(html, /<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*>/i) || 
                     'No description';
  
  // Extract product-related content (simplified but effective)
  const productElements = html.match(/product|item|price|\$\d+|add.to.cart/gi) || [];
  const productCount = Math.min(productElements.length, 1000); // Cap for consistency
  
  // Extract category/navigation elements
  const categoryMatches = html.match(/category|collection|department|shop|menu/gi) || [];
  const mainCategories = [...new Set(categoryMatches.slice(0, 10))]; // Unique, limited set
  
  // Extract price indicators
  const priceMatches = html.match(/\$\d+|\d+\.\d+|price|cost|sale/gi) || [];
  const priceRange = priceMatches.length > 100 ? 'high' : priceMatches.length > 20 ? 'medium' : 'low';
  
  // Create fingerprint data
  const fingerprintData = {
    url: storeUrl,
    title: title.trim().substring(0, 200),
    description: description.trim().substring(0, 300),
    productCount,
    mainCategories,
    priceRange,
    contentLength: html.length,
    structuralElements: extractStructuralElements(html)
  };
  
  // Create hash of fingerprint data
  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(fingerprintData))
    .digest('hex')
    .substring(0, 32); // Use first 32 chars for storage efficiency
  
  return {
    contentHash,
    keyElements: {
      title: fingerprintData.title,
      description: fingerprintData.description,
      productCount: fingerprintData.productCount,
      mainCategories: fingerprintData.mainCategories,
      priceRange: fingerprintData.priceRange
    }
  };
}

/**
 * Checks if a store has changed since last analysis
 */
export async function hasStoreChanged(storeUrl: string, currentHash: string): Promise<{
  hasChanged: boolean;
  lastAnalysis?: any;
}> {
  try {
    // Get the most recent analysis for this store URL
    const recentAnalyses = await storage.getRecentAnalyses(50);
    const lastAnalysis = recentAnalyses.find(analysis => 
      analysis.storeUrl === storeUrl && analysis.contentHash
    );
    
    if (!lastAnalysis || !lastAnalysis.contentHash) {
      return { hasChanged: true }; // No previous analysis or hash
    }
    
    const hasChanged = lastAnalysis.contentHash !== currentHash;
    console.log(`Store change detection for ${storeUrl}:`, {
      previousHash: lastAnalysis.contentHash,
      currentHash,
      hasChanged,
      lastAnalyzed: lastAnalysis.createdAt
    });
    
    return { hasChanged, lastAnalysis };
  } catch (error) {
    console.error('Error checking store changes:', error);
    return { hasChanged: true }; // Default to analyzing if error occurs
  }
}

/**
 * Extracts text from HTML using regex
 */
function extractText(html: string, regex: RegExp): string | null {
  const match = html.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extracts structural elements that indicate layout changes
 */
function extractStructuralElements(html: string): string[] {
  const elements = [];
  
  // Count major structural elements
  const headerCount = (html.match(/<header/gi) || []).length;
  const navCount = (html.match(/<nav/gi) || []).length;
  const footerCount = (html.match(/<footer/gi) || []).length;
  const sectionCount = Math.min((html.match(/<section/gi) || []).length, 20);
  
  elements.push(`h:${headerCount}`, `n:${navCount}`, `f:${footerCount}`, `s:${sectionCount}`);
  
  return elements;
}

/**
 * Creates a simplified fingerprint for eBay stores based on username
 */
export function createEbayFingerprint(username: string, storeData: string): StoreContentFingerprint {
  const contentHash = crypto
    .createHash('sha256')
    .update(`ebay:${username}:${storeData.substring(0, 1000)}`)
    .digest('hex')
    .substring(0, 32);
  
  return {
    contentHash,
    keyElements: {
      title: `eBay Store: ${username}`,
      description: `eBay store analysis for user ${username}`,
      productCount: 0, // eBay analysis doesn't extract exact counts
      mainCategories: ['eBay Marketplace'],
      priceRange: 'varied'
    }
  };
}