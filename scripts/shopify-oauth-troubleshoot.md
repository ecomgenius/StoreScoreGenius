# Shopify OAuth Troubleshooting Guide

## Current Issue Analysis

Based on the error pattern where Shopify returns `hmac`, `host`, `shop`, and `timestamp` but **no `code` or `state`**, this indicates that the OAuth authorization step failed before Shopify could generate an authorization code.

### Error Pattern Detected:
```
shop: testscorestore.myshopify.com
code: missing ❌
state: missing ❌  
hmac: present ✅
timestamp: present ✅
host: present ✅
```

## Root Cause

This specific error pattern occurs when:

1. **App is not set to Public Distribution** - App is still in development mode
2. **Redirect URI Mismatch** - The configured redirect URI doesn't match the actual callback URL
3. **User Denied OAuth Request** - User clicked "Cancel" during authorization
4. **App Configuration Issues** - Missing or incorrect app settings

## Solution Steps

### Step 1: Fix App Distribution Settings

In Shopify Partners Dashboard:

1. Go to **Apps** → **Your App Name**
2. Click **Distribution** in the left sidebar
3. **Enable "Public distribution"** 
   - This is CRITICAL - the app must be public for OAuth to work
   - Even for development stores, the app needs public distribution
4. Click **Save**

### Step 2: Configure App URLs

In Shopify Partners Dashboard:

1. Go to **Apps** → **Your App Name** → **App setup**
2. Under **URLs** section, set:
   - **App URL**: `https://3bd3348e-17b1-48bd-835c-9952a869ec8e-00-13wub5ckt6d04.janeway.replit.dev`
   - **Allowed redirection URL(s)**: `https://3bd3348e-17b1-48bd-835c-9952a869ec8e-00-13wub5ckt6d04.janeway.replit.dev/api/shopify/callback`
3. Click **Save**

### Step 3: Verify App Permissions

In Shopify Partners Dashboard:

1. Go to **Apps** → **Your App Name** → **App setup**
2. Under **App permissions**, ensure these are enabled:
   - Products (read_products, write_products)
   - Themes (read_themes, write_themes) 
   - Script tags (write_script_tags)
   - Content (read_content, write_content)
   - All other required scopes

### Step 4: Test OAuth Flow

1. Try the OAuth connection again
2. Make sure to **click "Install app"** when prompted
3. **Do not click "Cancel"** during the authorization screen

## Expected Behavior After Fix

✅ OAuth URL should redirect to Shopify authorization page  
✅ User should see app permissions request  
✅ After clicking "Install app", should redirect back with `code` and `state` parameters  
✅ Should work for both new connections and reconnections  

## Common Mistakes

❌ **Leaving app in "Development" mode** - Must be "Public distribution"  
❌ **Wrong redirect URI** - Must exactly match callback URL  
❌ **Missing app permissions** - Must include all required scopes  
❌ **Clicking "Cancel"** - User must click "Install app" to proceed  

## Verification

After making these changes, the OAuth callback should receive:
```
shop: testscorestore.myshopify.com
code: present ✅
state: present ✅
hmac: present ✅
```

## Need Help?

If the issue persists after following these steps:

1. Double-check that **Public distribution** is enabled
2. Verify the **exact redirect URI** matches
3. Ensure you're clicking **"Install app"** not "Cancel"
4. Check that all required **app permissions** are configured

The app needs to be configured exactly like popular Shopify apps (AutoDS, Oberlo, etc.) that work with any store.