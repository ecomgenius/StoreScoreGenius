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
 * Get shop information using GraphQL API (2024-04+ compliant)
 */
export async function getShopInfo(shopDomain: string, accessToken: string): Promise<ShopifyStore> {
  const graphqlUrl = `https://${shopDomain}/admin/api/2024-04/graphql.json`;
  
  const query = `
    query getShop {
      shop {
        id
        name
        email
        myshopifyDomain
        primaryDomain {
          host
          sslEnabled
        }
        currencyCode
        weightUnit
        ianaTimezone
        taxesIncluded
        taxShipping
        setupRequired
        createdAt
        updatedAt
      }
    }
  `;

  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error(`Failed to get shop info: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  // Transform GraphQL response to match REST format for backward compatibility
  const shop = data.data.shop;
  return {
    id: shop.id.split('/').pop(),
    name: shop.name,
    email: shop.email,
    domain: shop.myshopifyDomain.replace('.myshopify.com', ''),
    myshopify_domain: shop.myshopifyDomain,
    plan_display_name: 'Unknown',
    plan_name: 'unknown',
    primary_domain: {
      host: shop.primaryDomain.host,
      ssl_enabled: shop.primaryDomain.sslEnabled
    },
    currency: shop.currencyCode,
    weight_unit: shop.weightUnit,
    iana_timezone: shop.ianaTimezone,
    timezone: shop.ianaTimezone,
    taxes_included: shop.taxesIncluded,
    tax_shipping: shop.taxShipping,
    has_gift_cards: false,
    setup_required: shop.setupRequired,
    created_at: shop.createdAt,
    updated_at: shop.updatedAt
  };
}

/**
 * Get store products for analysis using GraphQL API (2024-04+ compliant)
 */
export async function getStoreProducts(shopDomain: string, accessToken: string, limit: number = 50) {
  // Use the new fetchStoreProducts function which already uses GraphQL
  return await fetchStoreProducts(shopDomain, accessToken, limit);
}

/**
 * Fetch a single product by ID using GraphQL API (2024-04+ compliant)
 */
export async function fetchSingleProduct(shopDomain: string, accessToken: string, productId: string) {
  const graphqlUrl = `https://${shopDomain}/admin/api/2024-04/graphql.json`;
  
  // Convert numeric ID to GID format
  const gid = `gid://shopify/Product/${productId}`;
  
  const query = `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        descriptionHtml
        productType
        vendor
        tags
        status
        createdAt
        updatedAt
        images(first: 5) {
          edges {
            node {
              id
              src: url
              altText
            }
          }
        }
        variants(first: 10) {
          edges {
            node {
              id
              title
              price
              compareAtPrice
              sku
              inventoryQuantity
            }
          }
        }
        seo {
          title
          description
        }
      }
    }
  `;

  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { id: gid }
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch product: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  if (!data.data.product) {
    throw new Error(`Product not found: ${productId}`);
  }

  // Transform GraphQL response to match REST format for backward compatibility
  const product = data.data.product;
  return {
    product: {
      id: product.id.split('/').pop(),
      title: product.title,
      handle: product.handle,
      body_html: product.descriptionHtml,
      product_type: product.productType,
      vendor: product.vendor,
      tags: product.tags.join(','),
      status: product.status.toLowerCase(),
      created_at: product.createdAt,
      updated_at: product.updatedAt,
      images: product.images.edges.map((imgEdge: any) => ({
        id: imgEdge.node.id.split('/').pop(),
        src: imgEdge.node.src,
        alt: imgEdge.node.altText
      })),
      variants: product.variants.edges.map((varEdge: any) => ({
        id: varEdge.node.id.split('/').pop(),
        title: varEdge.node.title,
        price: varEdge.node.price,
        compare_at_price: varEdge.node.compareAtPrice,
        sku: varEdge.node.sku,
        inventory_quantity: varEdge.node.inventoryQuantity,
        weight: null,
        weight_unit: null
      })),
      seo: product.seo
    }
  };
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
 * Fetch store products using new GraphQL API (2024-04+ compliant)
 */
export async function fetchStoreProducts(shopDomain: string, accessToken: string, limit: number = 50) {
  const graphqlUrl = `https://${shopDomain}/admin/api/2024-04/graphql.json`;
  
  const query = `
    query getProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            productType
            tags
            status
            createdAt
            updatedAt
            images(first: 5) {
              edges {
                node {
                  id
                  src: url
                  altText
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price
                  compareAtPrice
                  sku
                  inventoryQuantity
                }
              }
            }
            seo {
              title
              description
            }
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
      }
    }
  `;

  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { first: limit }
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  // Transform GraphQL response to match REST format for backward compatibility
  const products = data.data.products.edges.map((edge: any) => {
    const node = edge.node;
    return {
      id: node.id.split('/').pop(), // Extract numeric ID from GID
      title: node.title,
      handle: node.handle,
      body_html: node.descriptionHtml,
      product_type: node.productType,
      tags: node.tags.join(','),
      status: node.status.toLowerCase(),
      created_at: node.createdAt,
      updated_at: node.updatedAt,
      images: node.images.edges.map((imgEdge: any) => ({
        id: imgEdge.node.id.split('/').pop(),
        src: imgEdge.node.src,
        alt: imgEdge.node.altText
      })),
      variants: node.variants.edges.map((varEdge: any) => ({
        id: varEdge.node.id.split('/').pop(),
        title: varEdge.node.title,
        price: varEdge.node.price,
        compare_at_price: varEdge.node.compareAtPrice,
        sku: varEdge.node.sku,
        inventory_quantity: varEdge.node.inventoryQuantity,
        weight: null,
        weight_unit: null
      })),
      seo: node.seo
    };
  });

  return products;
}

/**
 * Update a product using new GraphQL API (2024-04+ compliant)
 */
export async function updateProduct(shopDomain: string, accessToken: string, productId: string, updateData: any) {
  const graphqlUrl = `https://${shopDomain}/admin/api/2024-04/graphql.json`;
  
  // Convert numeric ID to GID format
  const gid = `gid://shopify/Product/${productId}`;
  
  // Build the mutation based on what needs to be updated
  let mutation = '';
  let variables: any = { id: gid };
  
  if (updateData.title) {
    mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            handle
            descriptionHtml
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    variables = {
      input: {
        id: gid,
        title: updateData.title,
        descriptionHtml: updateData.body_html,
        tags: updateData.tags ? updateData.tags.split(',') : undefined
      }
    };
  } else if (updateData.variants && updateData.variants.length > 0) {
    // Handle variant updates using the new productVariantsBulkUpdate mutation
    const variantGid = `gid://shopify/ProductVariant/${updateData.variants[0].id}`;
    mutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            compareAtPrice
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    variables = {
      productId: gid,
      variants: [{
        id: variantGid,
        price: updateData.variants[0].price,
        compareAtPrice: updateData.variants[0].compare_at_price
      }]
    };
  } else if (updateData.tags) {
    // Update tags only
    mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    variables = {
      input: {
        id: gid,
        tags: updateData.tags.split(',')
      }
    };
  }

  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: mutation,
      variables
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to update product: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  // Check for user errors in the mutation response
  const mutationData = data.data.productUpdate || data.data.productVariantsBulkUpdate;
  if (mutationData?.userErrors && mutationData.userErrors.length > 0) {
    throw new Error(`Shopify API errors: ${JSON.stringify(mutationData.userErrors)}`);
  }

  return data;
}