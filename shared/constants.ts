/**
 * Application-wide constants and configuration values
 * Centralizes magic numbers and commonly used values
 */

export const ANALYSIS = {
  DEFAULT_LIMIT: 20,
  CREDIT_COST: 1,
  MAX_CONTENT_LENGTH: 8000,
  SCORES: {
    MAX_DESIGN: 20,
    MAX_PRODUCT: 25,
    MAX_SEO: 20,
    MAX_TRUST: 15,
    MAX_PRICING: 10,
    MAX_CONVERSION: 10,
    TOTAL_MAX: 100
  },
  THRESHOLDS: {
    EXCELLENT: 80, // >= 80%
    GOOD: 60,      // >= 60%
    POOR: 40       // < 40%
  }
} as const;

export const CREDITS = {
  DEFAULT_NEW_USER: 25,
  ANALYSIS_COST: 1,
  OPTIMIZATION_COST: 1,
  AD_GENERATION_COST: 2
} as const;

export const SUBSCRIPTION = {
  TRIAL_DAYS: 7,
  MONTHLY_PRICE: 4900, // $49.00 in cents
  YEARLY_PRICE: 49000  // $490.00 in cents (2 months free)
} as const;

export const STORE_TYPES = {
  SHOPIFY: 'shopify',
  EBAY: 'ebay'
} as const;

export const CONNECTION_STATUS = {
  PENDING: 'pending',
  CONNECTED: 'connected',
  ERROR: 'error',
  DISCONNECTED: 'disconnected'
} as const;

export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  TRIALING: 'trialing',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  INCOMPLETE: 'incomplete',
  UNPAID: 'unpaid',
  NONE: 'none'
} as const;

export const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    LOGOUT: '/api/auth/logout',
    ME: '/api/auth/me'
  },
  STORES: {
    LIST: '/api/stores',
    CREATE: '/api/stores',
    ANALYZE: '/api/analyze-store'
  },
  ALEX: {
    SESSIONS: '/api/alex/sessions',
    CHAT: '/api/alex/chat',
    INSIGHTS: '/api/alex/insights',
    PROACTIVE: '/api/alex/proactive'
  }
} as const;

export const ALEX = {
  GREETING_DELAY: 2000,
  MAX_MESSAGE_LENGTH: 500,
  MAX_CONVERSATION_HISTORY: 10,
  CONTEXT_REFRESH_INTERVAL: 300000, // 5 minutes
  MEMORY_RETENTION_DAYS: 30,
  RESPONSE_TIMEOUT: 30000, // 30 seconds
  MAX_RESPONSE_LENGTH: 500,
  MEMORY_SESSIONS: 5
} as const;

export const SHOPIFY = {
  SCOPES: 'read_products,write_products,read_orders,read_customers,read_analytics',
  API_VERSION: '2024-04'
} as const;

export const OPTIMIZATION_TYPES = {
  TITLE: 'title',
  DESCRIPTION: 'description',
  KEYWORDS: 'keywords',
  PRICING: 'pricing',
  IMAGES: 'images'
} as const;

export const AD_PLATFORMS = {
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  GOOGLE: 'google',
  PINTEREST: 'pinterest'
} as const;

export const AD_STYLES = {
  EMOTIONAL: 'emotional',
  CURIOSITY: 'curiosity',
  PROBLEM_SOLUTION: 'problem-solution',
  SCARCITY: 'scarcity',
  SOCIAL_PROOF: 'social-proof'
} as const;