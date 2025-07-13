import crypto from 'crypto';
import { storage } from '../storage';

// Shopify OAuth configuration
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;
const SHOPIFY_SCOPES = 'read_products,write_products';
const REDIRECT_URI = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/shopify/callback`
  : 'http://localhost:5000/api/shopify/callback';

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
  console.error('Missing Shopify API credentials. Please add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to environment variables.');
}

export interface ShopifyAuthUrl {
  authUrl: string;
  state: string;
}

export interface ShopifyTokenResponse {
  access_token: string;
  scope: string;
}

export interface ShopifyStore {
  id: number;
  name: string;
  email: string;
  domain: string;
  province: string;
  country: string;
  address1: string;
  zip: string;
  city: string;
  source: string;
  phone: string;
  latitude: number;
  longitude: number;
  primary_location_id: number;
  primary_locale: string;
  address2: string;
  created_at: string;
  updated_at: string;
  country_code: string;
  country_name: string;
  currency: string;
  customer_email: string;
  timezone: string;
  iana_timezone: string;
  shop_owner: string;
  money_format: string;
  money_with_currency_format: string;
  weight_unit: string;
  province_code: string;
  taxes_included: boolean;
  auto_configure_tax_inclusivity: boolean;
  tax_shipping: boolean;
  county_taxes: boolean;
  plan_display_name: string;
  plan_name: string;
  has_discounts: boolean;
  has_gift_cards: boolean;
  myshopify_domain: string;
  google_apps_domain: string;
  google_apps_login_enabled: boolean;
  money_in_emails_format: string;
  money_with_currency_in_emails_format: string;
  eligible_for_payments: boolean;
  requires_extra_payments_agreement: boolean;
  password_enabled: boolean;
  has_storefront: boolean;
  finances: boolean;
  setup_required: boolean;
  force_ssl: boolean;
  pre_launch_enabled: boolean;
}

/**
 * Generate Shopify OAuth authorization URL
 */
export async function generateShopifyAuthUrl(shopDomain: string, userId: number, userStoreId?: number): Promise<ShopifyAuthUrl> {
  const state = crypto.randomBytes(32).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  
  // Store state for validation (in production, use Redis or database)
  // Include userStoreId in state for store updates/reconnections
  const stateWithUser = userStoreId ? `${state}:${userId}:${userStoreId}` : `${state}:${userId}`;
  
  // Use scopes needed for AI recommendations - including write permissions for product updates
  const publicAppScopes = 'read_products,write_products';
  
  // Standard OAuth URL for public Shopify apps (like AutoDS)
  const baseUrl = `https://${shopDomain}`;
  const authUrl = `${baseUrl}/admin/oauth/authorize?` +
    `client_id=${SHOPIFY_API_KEY}&` +
    `scope=${publicAppScopes}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `state=${stateWithUser}&` +
    `grant_options[]=per-user`;
    
  console.log('Debug - Generated OAuth URL:', authUrl);
  console.log('Debug - Base store URL test:', baseUrl);
  console.log('Debug - API Key format:', SHOPIFY_API_KEY?.length, 'characters');
  
  // Test if this is a valid development store
  try {
    const storeTest = await fetch(baseUrl, { method: 'HEAD' });
    console.log('Debug - Store accessibility test:', storeTest.status, storeTest.statusText);
  } catch (error) {
    console.log('Debug - Store test error:', error.message);
  }

  return {
    authUrl,
    state: stateWithUser
  };
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  shopDomain: string, 
  code: string, 
  state: string
): Promise<ShopifyTokenResponse> {
  const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;
  
  console.log('Debug - Token exchange request:', {
    tokenUrl,
    client_id: SHOPIFY_API_KEY ? 'Set' : 'Missing',
    client_secret: SHOPIFY_API_SECRET ? 'Set' : 'Missing',
    code: code ? 'Present' : 'Missing'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to exchange code for token: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get shop information using access token
 */
export async function getShopInfo(shopDomain: string, accessToken: string): Promise<ShopifyStore> {
  const shopUrl = `https://${shopDomain}/admin/api/2023-10/shop.json`;
  
  const response = await fetch(shopUrl, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get shop info: ${response.statusText}`);
  }

  const data = await response.json();
  return data.shop;
}

/**
 * Get store products for analysis
 */
export async function getStoreProducts(shopDomain: string, accessToken: string, limit: number = 50) {
  const productsUrl = `https://${shopDomain}/admin/api/2023-10/products.json?limit=${limit}`;
  
  const response = await fetch(productsUrl, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get products: ${response.statusText}`);
  }

  const data = await response.json();
  return data.products;
}

/**
 * Validate Shopify webhook signature
 */
export function validateWebhookSignature(body: string, signature: string): boolean {
  const hmac = crypto.createHmac('sha256', SHOPIFY_API_SECRET);
  hmac.update(body, 'utf8');
  const computedSignature = hmac.digest('base64');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'base64'),
    Buffer.from(computedSignature, 'base64')
  );
}

/**
 * Create store analysis content from Shopify API data
 */
export function createShopifyAnalysisContent(shop: ShopifyStore, products: any[]): string {
  const productDescriptions = products.map(p => ({
    title: p.title,
    description: p.body_html?.replace(/<[^>]*>/g, '').substring(0, 200) || '',
    price: p.variants?.[0]?.price || '0',
    images: p.images?.length || 0
  }));

  return `
SHOPIFY STORE ANALYSIS - ${shop.name}

Store Information:
- Store Name: ${shop.name}
- Domain: ${shop.domain}
- Plan: ${shop.plan_display_name}
- Currency: ${shop.currency}
- Timezone: ${shop.timezone}
- Country: ${shop.country_name}
- Setup Status: ${shop.setup_required ? 'Setup Required' : 'Complete'}

Store Features:
- SSL Enabled: ${shop.force_ssl}
- Password Protected: ${shop.password_enabled}
- Storefront Active: ${shop.has_storefront}
- Discounts Available: ${shop.has_discounts}
- Gift Cards: ${shop.has_gift_cards}

Product Catalog:
- Total Products Analyzed: ${products.length}
- Product Details: ${JSON.stringify(productDescriptions.slice(0, 10), null, 2)}

Store Configuration:
- Taxes Included: ${shop.taxes_included}
- Tax Shipping: ${shop.tax_shipping}
- Money Format: ${shop.money_format}
- Weight Unit: ${shop.weight_unit}

This is a comprehensive Shopify store that should be analyzed for:
1. Product catalog optimization
2. SEO and content quality
3. Trust signals and policies
4. Conversion optimization
5. Mobile responsiveness
6. Site performance
`;
}

/**
 * Fetch store products for AI recommendations
 */
export async function fetchStoreProducts(shopDomain: string, accessToken: string, limit: number = 50) {
  const productsUrl = `https://${shopDomain}/admin/api/2023-10/products.json?limit=${limit}`;
  
  const response = await fetch(productsUrl, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.statusText}`);
  }

  const data = await response.json();
  return data.products || [];
}

/**
 * Update a product via Shopify API
 */
export async function updateProduct(shopDomain: string, accessToken: string, productId: string, updateData: any) {
  const productUrl = `https://${shopDomain}/admin/api/2023-10/products/${productId}.json`;
  
  const response = await fetch(productUrl, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product: updateData
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to update product: ${response.statusText}`);
  }

  return await response.json();
}