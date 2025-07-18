#!/usr/bin/env node

/**
 * Shopify Configuration Diagnostic Tool
 * This script helps identify OAuth configuration issues
 */

console.log('🔍 Shopify OAuth Configuration Diagnostic');
console.log('==========================================\n');

// Environment Check
console.log('📋 Environment Configuration:');
console.log(`  SHOPIFY_API_KEY: ${process.env.SHOPIFY_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`  SHOPIFY_API_SECRET: ${process.env.SHOPIFY_API_SECRET ? '✅ Set' : '❌ Missing'}`);
console.log(`  REPLIT_DEV_DOMAIN: ${process.env.REPLIT_DEV_DOMAIN || '❌ Missing'}`);

if (process.env.SHOPIFY_API_KEY) {
  console.log(`  API Key Length: ${process.env.SHOPIFY_API_KEY.length} characters`);
  console.log(`  API Key Format: ${process.env.SHOPIFY_API_KEY.startsWith('shpca_') ? '✅ Correct' : '⚠️  Unusual format'}`);
}

// Generate test OAuth URL
const shopDomain = 'testscorestore.myshopify.com';
const redirectUri = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/shopify/callback`
  : 'http://localhost:5000/api/shopify/callback';

const scopes = 'read_products,write_products,read_themes,write_themes,write_script_tags,read_content,write_content,read_customers,write_customers,read_orders,read_inventory,write_inventory,read_locations,read_price_rules,write_price_rules,read_discounts,write_discounts,read_marketing_events,write_marketing_events,read_product_listings,write_product_listings,read_resource_feedbacks,write_resource_feedbacks,read_shipping,write_shipping,read_translations,write_translations';

const testState = 'test-state-12345';

console.log('\n🔗 Generated OAuth URL Analysis:');
console.log(`  Shop Domain: ${shopDomain}`);
console.log(`  Redirect URI: ${redirectUri}`);
console.log(`  State: ${testState}`);
console.log(`  Scopes Count: ${scopes.split(',').length} permissions`);

if (process.env.SHOPIFY_API_KEY) {
  const oauthUrl = `https://${shopDomain}/admin/oauth/authorize?` +
    `client_id=${process.env.SHOPIFY_API_KEY}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `state=${testState}&` +
    `grant_options[]=per-user`;

  console.log('\n📝 Complete OAuth URL:');
  console.log(oauthUrl);
  
  console.log('\n🔧 Partners Dashboard Checklist:');
  console.log('  1. ✅ Go to Shopify Partners Dashboard');
  console.log('  2. ✅ Navigate to Apps → Your App Name');
  console.log('  3. ✅ Check App setup → Distribution');
  console.log('     → Must be "Public distribution" (not Development)');
  console.log('  4. ✅ Check App setup → URLs');
  console.log(`     → App URL: https://${process.env.REPLIT_DEV_DOMAIN || 'your-replit-domain'}`);
  console.log(`     → Redirect URI: ${redirectUri}`);
  console.log('  5. ✅ Check App setup → Permissions');
  console.log('     → All required scopes must be enabled');
  console.log('  6. ✅ Save all changes');
  
  console.log('\n⚡ Quick Test URLs:');
  console.log('  Test OAuth URL in browser:');
  console.log(`  ${oauthUrl}`);
  console.log('\n  Expected result: Should redirect to Shopify installation page');
  console.log('  If you get 404: App distribution issue');
  console.log('  If you get callback without code: Redirect URI mismatch');
}

console.log('\n🚨 Common Fixes:');
console.log('  Problem: OAuth returns without code');
console.log('  Solution 1: Enable "Public distribution" in Partners Dashboard');
console.log('  Solution 2: Verify exact redirect URI match');
console.log('  Solution 3: Check all app permissions are saved');
console.log('  Solution 4: Try installing app directly from store admin');

console.log('\n📞 Alternative Connection Method:');
console.log('  If OAuth continues to fail, use Manual Token connection:');
console.log('  1. Go to Partners Dashboard → Test on development store');
console.log('  2. Install app manually');
console.log('  3. Copy access token');
console.log('  4. Use "Manual Token (Backup)" button in StoreScore');