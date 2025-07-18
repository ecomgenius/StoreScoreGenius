# Fix Shopify OAuth Configuration

## Current Issue
OAuth returns `shop` and `hmac` but no `code` or `state` parameters. This indicates the app is not properly configured for OAuth in Shopify Partners Dashboard.

## Required Configuration

### 1. Shopify Partners Dashboard Setup

**Go to:** https://partners.shopify.com

**Navigate to:** Apps → Your App Name

### 2. Distribution Settings (CRITICAL)
**Path:** App setup → Distribution

**Current Setting:** Development (❌ This causes OAuth to fail)
**Required Setting:** Public distribution (✅ Required for OAuth)

**Action:** Click "Enable public distribution"

### 3. URL Configuration
**Path:** App setup → URLs

**App URL:** 
```
https://3bd3348e-17b1-48bd-835c-9952a869ec8e-00-13wub5ckt6d04.janeway.replit.dev
```

**Allowed redirection URL(s):**
```
https://3bd3348e-17b1-48bd-835c-9952a869ec8e-00-13wub5ckt6d04.janeway.replit.dev/api/shopify/callback
```

### 4. App Permissions
**Path:** App setup → Protected customer data access

Ensure these scopes are enabled:
- read_products, write_products
- read_themes, write_themes  
- write_script_tags
- read_content, write_content
- read_customers, write_customers
- read_orders
- read_inventory, write_inventory
- read_locations
- read_price_rules, write_price_rules
- read_discounts, write_discounts
- read_marketing_events, write_marketing_events
- read_product_listings, write_product_listings
- read_resource_feedbacks, write_resource_feedbacks
- read_shipping, write_shipping
- read_translations, write_translations

### 5. Save All Changes
Click "Save" after making each change.

## Test OAuth Flow

After configuration:

1. Go to StoreScore app
2. Click "Connect Shopify Store"  
3. Enter: `testscorestore.myshopify.com`
4. Click "Authorize with Shopify"
5. Should redirect to Shopify authorization page
6. Click "Install app" 
7. Should redirect back with success

## Expected Success Pattern

After fix, OAuth callback should receive:
```
shop: testscorestore.myshopify.com ✅
code: present ✅
state: present ✅  
hmac: present ✅
```

## Alternative if OAuth Still Fails

If OAuth continues to fail after configuration:

1. Use "Manual Token (Backup)" button
2. Go to Partners Dashboard → Test on development store
3. Install app manually
4. Copy access token
5. Enter in manual connection form

## Why This Works

Development stores can use OAuth, but the app must be configured as "Public distribution" in Partners Dashboard. This is how successful Shopify apps like AutoDS work - they use public distribution even when testing on development stores.