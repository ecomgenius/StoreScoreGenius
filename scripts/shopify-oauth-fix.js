// Shopify OAuth Configuration Diagnostic and Fix Script

console.log('🔍 Shopify OAuth Configuration Diagnostic');
console.log('==========================================');

// Get environment variables
const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const replitDomain = process.env.REPLIT_DEV_DOMAIN;

console.log('📋 Current Configuration:');
console.log(`API Key: ${apiKey ? `${apiKey.substring(0, 8)}...` : 'MISSING'}`);
console.log(`API Secret: ${apiSecret ? 'SET' : 'MISSING'}`);
console.log(`Replit Domain: ${replitDomain || 'MISSING'}`);
console.log(`Expected Redirect URI: https://${replitDomain}/api/shopify/callback`);

console.log('\n🚨 Common Shopify OAuth Issues and Solutions:');
console.log('==============================================');

console.log('\n1. APP DISTRIBUTION SETTINGS:');
console.log('   ❌ Problem: App is in "Development" mode');
console.log('   ✅ Solution: In Shopify Partners Dashboard:');
console.log('      - Go to Apps → Your App → Distribution');
console.log('      - Enable "Public distribution"');
console.log('      - This allows ANY Shopify store to install your app');

console.log('\n2. REDIRECT URI CONFIGURATION:');
console.log('   ❌ Problem: Redirect URI not whitelisted');
console.log('   ✅ Solution: In Shopify Partners Dashboard:');
console.log('      - Go to Apps → Your App → App setup');
console.log('      - Under "URLs" section, set:');
console.log(`        App URL: https://${replitDomain}`);
console.log(`        Allowed redirection URL(s): https://${replitDomain}/api/shopify/callback`);

console.log('\n3. SCOPE PERMISSIONS:');
console.log('   ❌ Problem: Requested scopes not configured in app');
console.log('   ✅ Solution: In Shopify Partners Dashboard:');
console.log('      - Go to Apps → Your App → App setup');
console.log('      - Under "App permissions", enable:');
console.log('        • Products (read_products, write_products)');
console.log('        • Themes (read_themes, write_themes)');
console.log('        • Script tags (write_script_tags)');
console.log('        • And other scopes as needed');

console.log('\n4. DEVELOPMENT STORE SETUP:');
console.log('   ❌ Problem: Development store not properly linked');
console.log('   ✅ Solution: ');
console.log('      - Ensure the development store is created from Shopify Partners');
console.log('      - Or manually install the app from Partners Dashboard');

console.log('\n🔧 Quick Test URLs:');
console.log('==================');

const testOAuthUrl = `https://testscorestore.myshopify.com/admin/oauth/authorize?client_id=${apiKey}&scope=read_products&redirect_uri=${encodeURIComponent(`https://${replitDomain}/api/shopify/callback`)}&state=test123&grant_options[]=per-user`;

console.log('\nTest OAuth URL:');
console.log(testOAuthUrl);

console.log('\n📝 Step-by-Step Fix Process:');
console.log('============================');
console.log('1. Open Shopify Partners Dashboard');
console.log('2. Navigate to your app');
console.log('3. Set Distribution to "Public"');
console.log('4. Configure redirect URI');
console.log('5. Verify all required scopes are enabled');
console.log('6. Test the OAuth URL above in a browser');
console.log('7. If successful, both new connections and reconnections should work');

console.log('\n🎯 Expected Behavior After Fix:');
console.log('===============================');
console.log('- OAuth URL should redirect to Shopify authorization page');
console.log('- After user approval, should redirect back to your callback');
console.log('- Should work in same window (no popup blockers)');
console.log('- Should work for both new connections and reconnections');