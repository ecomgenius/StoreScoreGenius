/**
 * Shared utility functions used across the application
 * Centralizes common logic and calculations
 */

import { ANALYSIS } from './constants';
import type { StoreAnalysisResult } from './schema';

/**
 * Calculates the overall health score from individual category scores
 * @param analysis - Store analysis result containing all category scores
 * @returns Overall health score as percentage (0-100)
 */
export const calculateHealthScore = (analysis: StoreAnalysisResult): number => {
  const totalScore = (
    (analysis.designScore || 0) + 
    (analysis.productScore || 0) + 
    (analysis.seoScore || 0) + 
    (analysis.trustScore || 0) + 
    (analysis.pricingScore || 0) + 
    (analysis.conversionScore || 0)
  );
  
  return Math.round((totalScore / ANALYSIS.SCORES.TOTAL_MAX) * 100);
};

/**
 * Returns CSS class for score color based on performance
 * @param score - Current score
 * @param maxScore - Maximum possible score for this category
 * @returns Tailwind CSS class for text color
 */
export const getScoreColor = (score: number, maxScore: number): string => {
  const percentage = (score / maxScore) * 100;
  
  if (percentage >= ANALYSIS.THRESHOLDS.EXCELLENT) {
    return 'text-green-600';
  }
  if (percentage >= ANALYSIS.THRESHOLDS.GOOD) {
    return 'text-yellow-600';
  }
  return 'text-red-600';
};

/**
 * Returns background color class for score badges
 * @param score - Current score
 * @param maxScore - Maximum possible score
 * @returns Tailwind CSS class for background color
 */
export const getScoreBadgeColor = (score: number, maxScore: number): string => {
  const percentage = (score / maxScore) * 100;
  
  if (percentage >= ANALYSIS.THRESHOLDS.EXCELLENT) {
    return 'bg-green-100 text-green-800';
  }
  if (percentage >= ANALYSIS.THRESHOLDS.GOOD) {
    return 'bg-yellow-100 text-yellow-800';
  }
  return 'bg-red-100 text-red-800';
};

/**
 * Formats a score as percentage with appropriate styling
 * @param score - Current score
 * @param maxScore - Maximum possible score
 * @returns Formatted percentage string
 */
export const formatScorePercentage = (score: number, maxScore: number): string => {
  const percentage = Math.round((score / maxScore) * 100);
  return `${percentage}%`;
};

/**
 * Identifies the weakest areas from analysis scores
 * @param analysis - Store analysis result
 * @returns Array of area names sorted by weakness (lowest scores first)
 */
export const getWeakestAreas = (analysis: StoreAnalysisResult): string[] => {
  const areaScores = [
    { area: 'design', score: analysis.designScore || 0, max: ANALYSIS.SCORES.MAX_DESIGN },
    { area: 'products', score: analysis.productScore || 0, max: ANALYSIS.SCORES.MAX_PRODUCT },
    { area: 'seo', score: analysis.seoScore || 0, max: ANALYSIS.SCORES.MAX_SEO },
    { area: 'trust', score: analysis.trustScore || 0, max: ANALYSIS.SCORES.MAX_TRUST },
    { area: 'pricing', score: analysis.pricingScore || 0, max: ANALYSIS.SCORES.MAX_PRICING },
    { area: 'conversion', score: analysis.conversionScore || 0, max: ANALYSIS.SCORES.MAX_CONVERSION }
  ];
  
  return areaScores
    .filter(area => (area.score / area.max) * 100 < ANALYSIS.THRESHOLDS.GOOD) // Below 60%
    .sort((a, b) => (a.score / a.max) - (b.score / b.max)) // Sort by percentage, lowest first
    .map(area => area.area);
};

/**
 * Formats currency amounts in cents to dollar strings
 * @param cents - Amount in cents
 * @returns Formatted currency string (e.g., "$49.00")
 */
export const formatCurrency = (cents: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
};

/**
 * Formats relative time (e.g., "2 hours ago")
 * @param date - Date to format
 * @returns Human-readable relative time string
 */
export const formatRelativeTime = (date: Date | string): string => {
  const now = new Date();
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - targetDate.getTime();
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  
  return targetDate.toLocaleDateString();
};

/**
 * Validates and normalizes a store URL
 * @param url - Raw URL input
 * @returns Normalized URL with protocol
 */
export const normalizeStoreUrl = (url: string): string => {
  let normalizedUrl = url.trim();
  
  // Add protocol if missing
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }
  
  // Remove trailing slash
  normalizedUrl = normalizedUrl.replace(/\/$/, '');
  
  return normalizedUrl;
};

/**
 * Extracts domain from URL
 * @param url - Full URL
 * @returns Domain name without protocol
 */
export const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(normalizeStoreUrl(url));
    return urlObj.hostname;
  } catch {
    return url;
  }
};

/**
 * Checks if a store URL is a Shopify store
 * @param url - Store URL to check
 * @returns True if it's a Shopify store
 */
export const isShopifyStore = (url: string): boolean => {
  const domain = extractDomain(url);
  return domain.includes('.myshopify.com') || domain.includes('shopify');
};

/**
 * Generates a random session title based on context
 * @param context - Optional context for title generation
 * @returns Generated session title
 */
export const generateSessionTitle = (context?: string): string => {
  const defaultTitles = [
    'Store Strategy Chat',
    'Optimization Discussion', 
    'Growth Planning',
    'Performance Review',
    'AI Consultation'
  ];
  
  if (context) {
    switch (context) {
      case 'optimization':
        return 'Store Optimization';
      case 'education':
        return 'Learning Session';
      case 'scaling':
        return 'Scaling Strategy';
      case 'advanced':
        return 'Advanced Techniques';
      default:
        return 'New Chat';
    }
  }
  
  return defaultTitles[Math.floor(Math.random() * defaultTitles.length)];
};

/**
 * Truncates text to specified length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};

/**
 * Debounces a function call
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};