# Shopify App Connection Guide

## Development vs Public Apps

There are two main approaches for connecting Shopify stores:

### Option 1: Development Apps (Manual Installation)
- App stays in "Development" mode in Partners Dashboard
- Must be manually installed to each development store
- Uses access tokens instead of OAuth flow
- **Recommended for testing and development**

### Option 2: Public Apps (OAuth Flow)  
- App must be set to "Public distribution" in Partners Dashboard
- Uses standard OAuth authorization flow
- Works automatically with any Shopify store
- **Required for production/published apps**

## Current Error Analysis

When you see this error pattern:
```
shop: testscorestore.myshopify.com
code: missing ❌
state: missing ❌  
hmac: present ✅
timestamp: present ✅
host: present ✅
```

This indicates that OAuth authorization failed, which happens when:
1. **App is in Development mode** (not Public)
2. **User denied the OAuth request**
3. **Redirect URI mismatch**
4. **App configuration issues**

## Solution Options

### Option A: Keep Development Mode (Recommended)

**Use Manual Token Connection:**

1. **In Shopify Partners Dashboard:**
   - Go to Apps → Your App Name
   - Click "Test on development store"
   - Select your development store (testscorestore)
   - Click "Install app"

2. **In Your StoreScore App:**
   - Go to Store Management
   - Click "Development App Token" button
   - Fill in:
     - Store Name: testscorestore
     - Shop Domain: testscorestore.myshopify.com
     - Access Token: (from Partners Dashboard installation)

3. **Get Access Token:**
   - After installing in Partners Dashboard, you'll get an access token
   - Copy this token to the app connection form

### Option B: Switch to Public Mode (Advanced)

**For OAuth Flow:**

1. **In Shopify Partners Dashboard:**
   - Go to Apps → Your App Name → Distribution
   - Enable "Public distribution"
   - Go to App setup → URLs
   - Set redirect URI: `https://3bd3348e-17b1-48bd-835c-9952a869ec8e-00-13wub5ckt6d04.janeway.replit.dev/api/shopify/callback`

2. **Configure App Permissions:**
   - Enable all required scopes in App setup
   - Save changes

3. **Test OAuth:**
   - Use "Connect Shopify (OAuth)" button
   - Click "Install app" when prompted

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