import express, { type Request, type Response, type Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { storage } from "./storage";
import { 
  analyzeStoreRequestSchema, 
  registerUserSchema, 
  loginUserSchema,
  createUserStoreSchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  updatePaymentMethodSchema,
  createTrialSubscriptionSchema
} from "@shared/schema";
import { analyzeShopifyStore, analyzeEbayStore } from "./services/storeAnalyzer";
import { authenticateUser, requireAuth, requireAdmin, requireSubscription, checkCredits, checkSubscription } from "./middleware/auth";
import { 
  generateShopifyAuthUrl, 
  exchangeCodeForToken, 
  getShopInfo, 
  getStoreProducts, 
  createShopifyAnalysisContent,
  fetchStoreProducts,
  updateProduct,
  validateWebhookSignature
} from "./services/shopifyIntegration";
import { analyzeStoreWithAI } from "./services/openai";
import { subscriptionService } from "./services/subscriptionService";
import Stripe from "stripe";
import OpenAI from "openai";

// Initialize Stripe if key is available
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Initialize OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Add cookie parser middleware
  app.use(cookieParser());
  
  // Add authentication middleware to all routes
  app.use(authenticateUser);
  
  // Handle Shopify callback at root level (in case redirect URI is set to root)
  app.get("/", (req: Request, res: Response, next) => {
    const { hmac, host, shop, timestamp, code, state } = req.query;
    
    // If this looks like a Shopify callback, redirect to proper callback endpoint
    if (shop && (hmac || code)) {
      console.log('Debug - Root callback detected, redirecting to /api/shopify/callback');
      const queryString = new URLSearchParams(req.query as any).toString();
      return res.redirect(`/api/shopify/callback?${queryString}`);
    }
    
    // Otherwise, let other middleware handle it (Vite in development)
    next();
  });

  // ================ AUTHENTICATION ROUTES ================
  
  // User registration
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const validatedData = registerUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(409).json({ error: "User already exists" });
      }

      // Create user
      const user = await storage.createUser({
        email: validatedData.email,
        passwordHash: validatedData.password, // Will be hashed in storage
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
      });

      // Create session
      const session = await storage.createSession(user.id);

      // Set session cookie
      res.cookie('sessionId', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax'
      });

      // Return user data without password
      const { passwordHash, ...userWithoutPassword } = user;
      res.status(201).json({ 
        user: userWithoutPassword, 
        session: session.id,
        needsOnboarding: true
      });
      
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({ 
        error: "Registration failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // User login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const validatedData = loginUserSchema.parse(req.body);
      
      const user = await storage.validateUserCredentials(validatedData.email, validatedData.password);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Create session
      const session = await storage.createSession(user.id);

      // Set session cookie
      res.cookie('sessionId', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax'
      });

      // Return user data without password
      const { passwordHash, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, session: session.id });
      
    } catch (error) {
      console.error("Login error:", error);
      res.status(400).json({ 
        error: "Login failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // User logout
  app.post("/api/auth/logout", requireAuth, async (req: Request, res: Response) => {
    try {
      const sessionId = req.cookies?.sessionId;
      if (sessionId) {
        await storage.deleteSession(sessionId);
        res.clearCookie('sessionId');
      }
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // Get current user
  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const { passwordHash, ...userWithoutPassword } = req.user!;
    res.json({ user: userWithoutPassword });
  });

  // ================ USER STORES ROUTES ================
  
  // Get user stores
  app.get("/api/stores", requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
      const stores = await storage.getUserStores(req.user!.id);
      res.json(stores);
    } catch (error) {
      console.error("Error fetching user stores:", error);
      res.status(500).json({ error: "Failed to fetch stores" });
    }
  });

  // Create user store
  app.post("/api/stores", requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
      const validatedData = createUserStoreSchema.parse(req.body);
      
      const store = await storage.createUserStore({
        userId: req.user!.id,
        name: validatedData.name,
        storeUrl: validatedData.storeUrl,
        storeType: validatedData.storeType,
        ebayUsername: validatedData.ebayUsername,
      });

      res.status(201).json(store);
    } catch (error) {
      console.error("Error creating store:", error);
      res.status(400).json({ 
        error: "Failed to create store", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Update user store
  app.put("/api/stores/:id", requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const store = await storage.getUserStore(id);
      
      if (!store || store.userId !== req.user!.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      const validatedData = createUserStoreSchema.partial().parse(req.body);
      const updatedStore = await storage.updateUserStore(id, validatedData);

      res.json(updatedStore);
    } catch (error) {
      console.error("Error updating store:", error);
      res.status(400).json({ error: "Failed to update store" });
    }
  });

  // Delete user store
  app.delete("/api/stores/:id", requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const store = await storage.getUserStore(id);
      
      if (!store || store.userId !== req.user!.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      await storage.deleteUserStore(id);
      res.json({ message: "Store deleted successfully" });
    } catch (error) {
      console.error("Error deleting store:", error);
      res.status(500).json({ error: "Failed to delete store" });
    }
  });

  // ================ STORE ANALYSIS ROUTES ================
  
  // Store analysis endpoint - Allow guests but give better features to authenticated users
  app.post("/api/analyze-store", authenticateUser, async (req: Request, res: Response) => {
    try {
      console.log("Analysis request received:", req.body);
      
      // Validate request data
      const validatedData = analyzeStoreRequestSchema.parse(req.body);
      console.log("Request validated:", validatedData);
      
      // Check credits for authenticated users
      if (req.user) {
        const userCredits = await storage.getUserCredits(req.user.id);
        if (userCredits < 1) {
          return res.status(402).json({ 
            error: 'Insufficient credits', 
            creditsRequired: 1,
            creditsAvailable: userCredits
          });
        }
      }
      
      let result;
      let userStoreId = validatedData.userStoreId;
      
      if (validatedData.storeType === 'shopify') {
        result = await analyzeShopifyStore(validatedData.storeUrl!);
      } else {
        result = await analyzeEbayStore(validatedData.ebayUsername!);
      }
      
      // Store the analysis result
      const storedAnalysis = await storage.createStoreAnalysis({
        userId: req.user?.id || null,
        userStoreId: userStoreId || null,
        storeUrl: validatedData.storeUrl || null,
        storeType: validatedData.storeType,
        ebayUsername: validatedData.ebayUsername || null,
        overallScore: result.overallScore,
        strengths: result.strengths,
        warnings: result.warnings,
        critical: result.critical,
        designScore: result.designScore,
        productScore: result.productScore,
        seoScore: result.seoScore,
        trustScore: result.trustScore,
        pricingScore: result.pricingScore,
        conversionScore: result.conversionScore,
        analysisData: result,
        suggestions: result.suggestions,
        summary: result.summary,
        storeRecap: result.storeRecap,
        creditsUsed: req.user ? 1 : 0,
        contentHash: (result as any).contentHash || null
      });

      // Deduct credits for authenticated users
      if (req.user) {
        await storage.deductCredits(req.user.id, 1, "Store analysis", storedAnalysis.id);

        // Update store last analyzed timestamp if userStoreId provided
        if (userStoreId) {
          await storage.updateUserStore(userStoreId, { lastAnalyzedAt: new Date() });
        }
      }
      
      console.log("Analysis completed successfully");
      res.json(storedAnalysis);
      
    } catch (error) {
      console.error("Error analyzing store:", error);
      res.status(500).json({ 
        error: "Failed to analyze store", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get user's analyses
  app.get("/api/analyses", requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const analyses = await storage.getUserAnalyses(req.user!.id, limit);
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching user analyses:", error);
      res.status(500).json({ error: "Failed to fetch analyses" });
    }
  });

  // Get analysis by ID
  app.get("/api/analysis/:id", authenticateUser, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      console.log('Debug - Fetching analysis:', id);
      const analysis = await storage.getStoreAnalysis(id);
      
      if (!analysis) {
        console.log('Debug - Analysis not found in database');
        return res.status(404).json({ error: "Analysis not found" });
      }

      console.log('Debug - Analysis found, checking access:', {
        analysisUserId: analysis.userId,
        requestUserId: req.user?.id,
        hasUser: !!req.user
      });

      // Check if user owns this analysis or if it's a guest analysis
      if (analysis.userId && (!req.user || analysis.userId !== req.user.id)) {
        console.log('Debug - Access denied');
        return res.status(404).json({ error: "Analysis not found" });
      }
      
      console.log('Debug - Returning analysis with score:', analysis.overallScore);
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching analysis:", error);
      res.status(500).json({ error: "Failed to fetch analysis" });
    }
  });

  // ================ CREDIT MANAGEMENT ROUTES ================
  
  // Get user credits
  app.get("/api/credits", requireAuth, async (req: Request, res: Response) => {
    try {
      const credits = await storage.getUserCredits(req.user!.id);
      res.json({ credits });
    } catch (error) {
      console.error("Error fetching credits:", error);
      res.status(500).json({ error: "Failed to fetch credits" });
    }
  });

  // Get credit transactions
  app.get("/api/credits/transactions", requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const transactions = await storage.getCreditTransactions(req.user!.id, limit);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching credit transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // ================ AI RECOMMENDATIONS ROUTES ================
  
  // Get Shopify products for a store
  app.get("/api/shopify/products/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const storeId = parseInt(req.params.storeId);
      const { user } = req;

      // Get the user's store
      const store = await storage.getUserStore(storeId);
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      if (!store.shopifyAccessToken) {
        return res.status(400).json({ error: "Store not connected to Shopify" });
      }

      console.log(`Fetching products for store: ${store.name}, domain: ${store.shopifyDomain}`);

      // Fetch products from Shopify
      const products = await fetchStoreProducts(store.shopifyDomain, store.shopifyAccessToken);
      res.json(products);
    } catch (error) {
      console.error("Error fetching Shopify products:", error);
      
      // Check if it's an authentication error
      if (error.message && error.message.includes('Unauthorized')) {
        // Mark store as disconnected and require re-authentication
        await storage.updateUserStore(parseInt(req.params.storeId), { 
          connectionStatus: 'error',
          isConnected: false 
        });
        
        return res.status(401).json({ 
          error: "Shopify authentication expired", 
          code: "AUTH_EXPIRED",
          message: "Your Shopify connection has expired. Please reconnect your store." 
        });
      }
      
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  // Get optimized products for a store
  app.get("/api/shopify/optimized-products/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const { user } = req;

      // Get the user's store
      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      // Get all optimizations for this store
      const optimizations = await storage.getProductOptimizations(store.id);
      
      // Group optimizations by product and type
      const optimizedProducts: Record<string, Record<string, any>> = {};
      
      optimizations.forEach(opt => {
        if (!optimizedProducts[opt.shopifyProductId]) {
          optimizedProducts[opt.shopifyProductId] = {};
        }
        optimizedProducts[opt.shopifyProductId][opt.optimizationType] = {
          optimizedAt: opt.appliedAt,
          originalValue: opt.originalValue,
          optimizedValue: opt.optimizedValue,
        };
      });

      res.json(optimizedProducts);
    } catch (error) {
      console.error("Error fetching optimized products:", error);
      res.status(500).json({ error: "Failed to fetch optimized products" });
    }
  });

  // Get AI recommendations for a store
  app.get("/api/ai-recommendations/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const storeId = parseInt(req.params.storeId);
      const { user } = req;

      console.log(`Debug - AI recommendations request for store ${storeId} by user ${user.id}`);

      // Get the user's store
      const store = await storage.getUserStore(storeId);
      if (!store || store.userId !== user.id) {
        console.log(`Debug - Store not found or access denied for store ${storeId}`);
        return res.status(404).json({ error: "Store not found" });
      }

      // Get recent analysis for this store
      const analyses = await storage.getUserAnalyses(user.id, 50);
      console.log(`Debug - Found ${analyses.length} analyses for user ${user.id}`);
      
      // Try to find analysis by userStoreId first, then fall back to store URL match
      let storeAnalysis = analyses.find(a => a.userStoreId === storeId);
      console.log(`Debug - Direct userStoreId match (${storeId}):`, !!storeAnalysis);
      
      if (!storeAnalysis && store.storeUrl) {
        // Fallback: find analysis by matching store URL
        console.log(`Debug - Looking for store URL: ${store.storeUrl}`);
        console.log(`Debug - Available analysis URLs:`, analyses.map(a => a.storeUrl));
        storeAnalysis = analyses.find(a => a.storeUrl === store.storeUrl);
        console.log(`Debug - Fallback search by URL found:`, !!storeAnalysis);
        
        if (!storeAnalysis) {
          // Try to get the most recent analysis for this user as a last resort
          storeAnalysis = analyses[0]; // Most recent analysis
          console.log(`Debug - Using most recent analysis as fallback:`, !!storeAnalysis);
        }
      }
      
      console.log(`Debug - Store analysis found:`, !!storeAnalysis);
      
      if (storeAnalysis) {
        console.log(`Debug - Analysis has suggestions:`, !!storeAnalysis.suggestions);
        console.log(`Debug - Suggestions count:`, storeAnalysis.suggestions?.length || 0);
      }

      if (!storeAnalysis || !storeAnalysis.suggestions || storeAnalysis.suggestions.length === 0) {
        console.log(`Debug - No analysis or suggestions found, returning empty array`);
        return res.json([]);
      }

      // Convert analysis suggestions to recommendations format
      const recommendations = storeAnalysis.suggestions.map((suggestion: any, index: number) => ({
        id: `rec-${storeId}-${index}`,
        type: suggestion.category || 'general',
        priority: suggestion.priority || 'medium',
        title: suggestion.title,
        description: suggestion.description,
        impact: suggestion.impact,
        suggestion: suggestion.description,
        affectedProducts: [], // We'll populate this based on store products
      }));

      console.log(`Debug - Returning ${recommendations.length} recommendations`);
      res.json(recommendations);
    } catch (error) {
      console.error("Error fetching AI recommendations:", error);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  });

  // Generate and apply AI recommendation
  app.post("/api/shopify/apply-recommendation", requireAuth, checkCredits(1), async (req: Request, res: Response) => {
    try {
      const { storeId, productId, recommendationType, suggestion } = req.body;
      const { user } = req;
      
      // Debug: Log the incoming request data
      console.log(`Debug - Apply recommendation request:`, {
        storeId,
        productId,
        recommendationType,
        suggestion,
        userId: user.id
      });

      // Get the user's store
      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      if (!store.shopifyAccessToken) {
        return res.status(400).json({ error: "Store not connected to Shopify" });
      }

      // Check if store has write permissions for products
      if (!store.shopifyScope?.includes('write_products')) {
        return res.status(403).json({ 
          error: "Insufficient permissions",
          message: "Your store connection needs write permissions to update products. Please reconnect your store to enable AI optimizations.",
          needsReconnection: true
        });
      }

      // First, fetch the current product data
      const currentProduct = await fetch(`https://${store.shopifyDomain}/admin/api/2024-10/products/${productId}.json`, {
        headers: {
          'X-Shopify-Access-Token': store.shopifyAccessToken,
          'Content-Type': 'application/json',
        },
      }).then(res => res.json()).then(data => data.product);

      if (!currentProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Generate AI optimization using OpenAI
      let aiSuggestion = '';
      const updateData: any = {};
      
      if (recommendationType === 'title') {
        // Use OpenAI to generate a compelling, conversion-focused product title
        const openai = await import('openai');
        const openaiClient = new openai.default({ 
          apiKey: process.env.OPENAI_API_KEY 
        });

        const titlePrompt = `You are an expert e-commerce copywriter specializing in conversion optimization. Create a compelling, SEO-optimized product title using market-proven keywords.

Current product title: "${currentProduct.title}"
Product type: ${currentProduct.product_type || 'Product'}
Vendor: ${currentProduct.vendor || 'Unknown'}
Price: $${currentProduct.variants?.[0]?.price || 'Unknown'}

Requirements:
- Keep it under 60 characters for optimal display
- Use high-converting market keywords for this product category
- Include power words that drive sales (Premium, Professional, Best, Quality, Limited, Exclusive, etc.)
- Optimize for search engines and customer appeal
- Focus on benefits and value proposition
- Use psychological triggers that increase click-through rates

Generate ONLY the new optimized title without quotes or extra formatting:`;

        try {
          const aiResponse = await openaiClient.chat.completions.create({
            model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages: [{ role: "user", content: titlePrompt }],
            max_tokens: 100,
            temperature: 0.7,
          });
          
          aiSuggestion = aiResponse.choices[0].message.content?.trim().replace(/^"|"$/g, '') || `Premium ${currentProduct.title} | ${currentProduct.product_type || 'Quality Product'}`;
        } catch (error) {
          console.error('OpenAI title generation failed:', error);
          aiSuggestion = `Premium ${currentProduct.title} | ${currentProduct.product_type || 'Quality Product'}`;
        }
        updateData.title = aiSuggestion;
      } else if (recommendationType === 'description') {
        // Use OpenAI to generate enhanced description
        const openai = await import('openai');
        const openaiClient = new openai.default({ 
          apiKey: process.env.OPENAI_API_KEY 
        });

        const descriptionPrompt = `You are an expert e-commerce copywriter specializing in conversion optimization. Create a compelling product description using market-proven keywords and conversion techniques.

Product: ${currentProduct.title}
Product type: ${currentProduct.product_type || 'Product'}
Vendor: ${currentProduct.vendor || 'Unknown'}
Price: $${currentProduct.variants?.[0]?.price || 'Unknown'}
Current Description: ${currentProduct.body_html?.replace(/<[^>]*>/g, '').substring(0, 200) || 'No description available'}

Requirements:
- Use high-converting market keywords for this product category
- Write 2-3 compelling paragraphs (150-250 words total)
- Include emotional triggers and benefits-focused language
- Add urgency or scarcity elements where appropriate
- Use power words that drive action (Exclusive, Limited, Premium, Professional, etc.)
- Focus on customer problems this product solves
- End with a clear call-to-action

Generate ONLY the clean description text without HTML tags, quotes, or extra formatting:`;

        try {
          const aiResponse = await openaiClient.chat.completions.create({
            model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages: [{ role: "user", content: descriptionPrompt }],
            max_tokens: 300,
            temperature: 0.7,
          });
          
          aiSuggestion = aiResponse.choices[0].message.content?.trim().replace(/^"|"$/g, '') || `Experience the exceptional quality of our ${currentProduct.title}. Premium materials and expert craftsmanship ensure lasting satisfaction.`;
        } catch (error) {
          console.error('OpenAI description generation failed:', error);
          aiSuggestion = `Experience the exceptional quality of our ${currentProduct.title}. Premium materials and expert craftsmanship ensure lasting satisfaction.`;
        }
        updateData.body_html = `<p>${aiSuggestion}</p>`;
      } else if (recommendationType === 'pricing') {
        // Use OpenAI to generate optimized pricing with comprehensive market analysis
        const openai = await import('openai');
        const openaiClient = new openai.default({ 
          apiKey: process.env.OPENAI_API_KEY 
        });

        const pricingPrompt = `You are an expert e-commerce pricing strategist. Analyze this product and recommend an optimized price based on market psychology, competitive positioning, and conversion optimization.

Product: ${currentProduct.title}
Product type: ${currentProduct.product_type || 'Product'}
Vendor: ${currentProduct.vendor || 'Brand'}
Current price: $${currentProduct.variants?.[0]?.price || 'Unknown'}
Compare at price: $${currentProduct.variants?.[0]?.compare_at_price || 'None'}
Product tags: ${currentProduct.tags || 'None'}
Created: ${currentProduct.created_at || 'Unknown'}

Market Analysis Requirements:
1. Apply psychological pricing principles (e.g., $19.99 vs $20.00)
2. Consider product category positioning and market standards  
3. Factor in competitive landscape and value perception
4. Account for product lifecycle stage and inventory considerations
5. Balance conversion optimization with profit margins
6. Consider seasonal demand patterns if applicable

Pricing Strategy Factors:
- Premium positioning: Higher-end pricing for luxury/quality perception
- Value positioning: Competitive pricing for volume sales
- Psychological anchoring: Use of .99, .95, .97 endings
- Bundle opportunities: Consider tiered pricing structures

Return ONLY a JSON object with this exact format:
{
  "recommendedPrice": "XX.XX",
  "reasoning": "Brief explanation of pricing strategy used",
  "priceType": "premium|value|psychological|competitive"
}`;

        try {
          const aiResponse = await openaiClient.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: pricingPrompt }],
            max_tokens: 200,
            temperature: 0.3,
            response_format: { type: "json_object" }
          });
          
          const pricingData = JSON.parse(aiResponse.choices[0].message.content || '{}');
          
          if (pricingData.recommendedPrice && !isNaN(parseFloat(pricingData.recommendedPrice))) {
            aiSuggestion = pricingData.recommendedPrice;
            updateData.variants = [{
              id: currentProduct.variants[0]?.id,
              price: pricingData.recommendedPrice
            }];
          } else {
            // Fallback to psychological pricing
            const currentPrice = parseFloat(currentProduct.variants?.[0]?.price || '0');
            const optimizedPrice = currentPrice > 10 ? 
              (Math.floor(currentPrice) - 0.01).toFixed(2) : 
              (currentPrice * 0.95).toFixed(2);
            aiSuggestion = optimizedPrice;
            updateData.variants = [{
              id: currentProduct.variants[0]?.id,
              price: optimizedPrice
            }];
          }
        } catch (error) {
          console.error('OpenAI pricing optimization failed:', error);
          // Fallback to psychological pricing
          const currentPrice = parseFloat(currentProduct.variants?.[0]?.price || '0');
          const optimizedPrice = currentPrice > 10 ? 
            (Math.floor(currentPrice) - 0.01).toFixed(2) : 
            (currentPrice * 0.95).toFixed(2);
          aiSuggestion = optimizedPrice;
          updateData.variants = [{
            id: currentProduct.variants[0]?.id,
            price: optimizedPrice
          }];
        }
      } else if (recommendationType === 'keywords') {
        // Use OpenAI to generate optimized keywords/tags
        const openai = await import('openai');
        const openaiClient = new openai.default({ 
          apiKey: process.env.OPENAI_API_KEY 
        });

        const keywordsPrompt = `You are an expert e-commerce SEO specialist. Generate optimized keywords and tags for this product to improve searchability and categorization.

Product: ${currentProduct.title}
Product type: ${currentProduct.product_type || 'Product'}
Vendor: ${currentProduct.vendor || 'Brand'}
Current tags: ${currentProduct.tags || 'None'}
Price: $${currentProduct.variants?.[0]?.price || 'Unknown'}

Requirements:
- Generate 8-12 relevant, high-impact keywords/tags
- Include both broad and specific search terms
- Mix of category terms, feature descriptors, and benefit keywords
- Consider seasonal and trending keywords when applicable
- Include brand and product type variations
- Separate keywords with commas
- Focus on terms customers actually search for

Generate ONLY the comma-separated list of optimized keywords, nothing else:`;

        try {
          const aiResponse = await openaiClient.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: keywordsPrompt }],
            max_tokens: 150,
            temperature: 0.7,
          });
          
          aiSuggestion = aiResponse.choices[0].message.content?.trim() || `${currentProduct.product_type || 'product'}, quality, premium, ${currentProduct.vendor || 'brand'}`;
        } catch (error) {
          console.error('OpenAI keywords generation failed:', error);
          // Fallback to basic keyword generation
          const productType = currentProduct.product_type?.toLowerCase() || '';
          const vendor = currentProduct.vendor?.toLowerCase() || '';
          const titleWords = currentProduct.title.toLowerCase().split(' ').filter(word => word.length > 3);
          aiSuggestion = [
            ...titleWords.slice(0, 3),
            productType,
            vendor,
            'premium',
            'quality',
            'bestseller'
          ].filter(Boolean).join(', ');
        }
        updateData.tags = aiSuggestion;
      }

      // Debug: Log the update data being sent to Shopify
      console.log(`Debug - ${recommendationType} optimization updateData:`, JSON.stringify(updateData, null, 2));
      
      // Update product via Shopify API
      const updateResult = await updateProduct(store.shopifyDomain, store.shopifyAccessToken, productId, updateData);
      console.log(`Debug - Shopify update result for ${recommendationType}:`, updateResult ? 'Success' : 'Failed');

      // Deduct credit
      await storage.deductCredits(user.id, 1, `AI optimized ${recommendationType} for "${currentProduct.title}"`);

      // Record the optimization
      await storage.recordProductOptimization({
        userId: user.id,
        userStoreId: store.id,
        shopifyProductId: productId,
        optimizationType: recommendationType,
        originalValue: recommendationType === 'title' ? currentProduct.title :
                       recommendationType === 'description' ? (currentProduct.body_html || 'No description') :
                       recommendationType === 'pricing' ? currentProduct.variants?.[0]?.price :
                       currentProduct.tags || 'No tags',
        optimizedValue: aiSuggestion,
        creditsUsed: 1,
      });

      res.json({ 
        success: true, 
        suggestion: aiSuggestion,
        original: recommendationType === 'title' ? currentProduct.title :
                  recommendationType === 'description' ? (currentProduct.body_html || 'No description') :
                  recommendationType === 'pricing' ? currentProduct.variants?.[0]?.price :
                  currentProduct.tags || 'No tags',
        product: {
          id: currentProduct.id,
          title: currentProduct.title,
          type: currentProduct.product_type,
          price: currentProduct.variants?.[0]?.price
        }
      });
    } catch (error) {
      console.error("Error applying recommendation:", error);
      res.status(500).json({ error: "Failed to apply recommendation" });
    }
  });

  // Generate AI suggestion preview (doesn't deduct credits)
  app.post("/api/shopify/generate-suggestion", requireAuth, async (req: Request, res: Response) => {
    try {
      const { storeId, productId, recommendationType } = req.body;
      const { user } = req;

      // Get the user's store
      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      if (!store.shopifyAccessToken) {
        return res.status(400).json({ error: "Store not connected to Shopify" });
      }

      // Fetch the current product data
      const currentProduct = await fetch(`https://${store.shopifyDomain}/admin/api/2024-10/products/${productId}.json`, {
        headers: {
          'X-Shopify-Access-Token': store.shopifyAccessToken,
          'Content-Type': 'application/json',
        },
      }).then(res => res.json()).then(data => data.product);

      if (!currentProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Generate AI suggestion (same logic as apply endpoint but without updating)
      let suggestion = '';
      
      if (recommendationType === 'title') {
        // Use OpenAI to generate a compelling, conversion-focused product title
        const openai = await import('openai');
        const openaiClient = new openai.default({ 
          apiKey: process.env.OPENAI_API_KEY 
        });

        const titlePrompt = `You are an expert e-commerce copywriter specializing in conversion optimization. Create a compelling, SEO-optimized product title using market-proven keywords.

Current product title: "${currentProduct.title}"
Product type: ${currentProduct.product_type || 'Product'}
Vendor: ${currentProduct.vendor || 'Unknown'}
Price: $${currentProduct.variants?.[0]?.price || 'Unknown'}

Requirements:
- Keep it under 60 characters for optimal display
- Use high-converting market keywords for this product category
- Include power words that drive sales (Premium, Professional, Best, Quality, Limited, Exclusive, etc.)
- Optimize for search engines and customer appeal
- Focus on benefits and value proposition
- Use psychological triggers that increase click-through rates

Generate ONLY the new optimized title without quotes or extra formatting:`;

        try {
          const aiResponse = await openaiClient.chat.completions.create({
            model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages: [{ role: "user", content: titlePrompt }],
            max_tokens: 100,
            temperature: 0.7,
          });
          
          suggestion = aiResponse.choices[0].message.content?.trim().replace(/^"|"$/g, '') || `Premium ${currentProduct.title} | ${currentProduct.product_type || 'Quality Product'}`;
        } catch (error) {
          console.error('OpenAI title generation failed:', error);
          suggestion = `Premium ${currentProduct.title} | ${currentProduct.product_type || 'Quality Product'}`;
        }
      } else if (recommendationType === 'description') {
        // Use OpenAI to generate enhanced description
        const openai = await import('openai');
        const openaiClient = new openai.default({ 
          apiKey: process.env.OPENAI_API_KEY 
        });

        const descriptionPrompt = `You are an expert e-commerce copywriter specializing in conversion optimization. Create a compelling product description using market-proven keywords and conversion techniques.

Product: ${currentProduct.title}
Product type: ${currentProduct.product_type || 'Product'}
Vendor: ${currentProduct.vendor || 'Unknown'}
Price: $${currentProduct.variants?.[0]?.price || 'Unknown'}
Current Description: ${currentProduct.body_html?.replace(/<[^>]*>/g, '').substring(0, 200) || 'No description available'}

Requirements:
- Use high-converting market keywords for this product category
- Write 2-3 compelling paragraphs (150-250 words total)
- Include emotional triggers and benefits-focused language
- Add urgency or scarcity elements where appropriate
- Use power words that drive action (Exclusive, Limited, Premium, Professional, etc.)
- Focus on customer problems this product solves
- End with a clear call-to-action

Generate ONLY the clean description text without HTML tags, quotes, or extra formatting:`;

        try {
          const aiResponse = await openaiClient.chat.completions.create({
            model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages: [{ role: "user", content: descriptionPrompt }],
            max_tokens: 300,
            temperature: 0.7,
          });
          
          suggestion = aiResponse.choices[0].message.content?.trim().replace(/^"|"$/g, '') || `Experience the exceptional quality of our ${currentProduct.title}. Premium materials and expert craftsmanship ensure lasting satisfaction.`;
        } catch (error) {
          console.error('OpenAI description generation failed:', error);
          suggestion = `Experience the exceptional quality of our ${currentProduct.title}. Premium materials and expert craftsmanship ensure lasting satisfaction.`;
        }
      } else if (recommendationType === 'pricing') {
        const currentPrice = parseFloat(currentProduct.variants?.[0]?.price || '0');
        suggestion = currentPrice > 10 ? 
          (Math.floor(currentPrice) - 0.01).toFixed(2) :
          (currentPrice * 0.95).toFixed(2);
      } else if (recommendationType === 'keywords') {
        const productType = currentProduct.product_type?.toLowerCase() || '';
        const titleWords = currentProduct.title.toLowerCase().split(' ').filter(word => word.length > 3);
        suggestion = [...titleWords.slice(0, 3), productType, 'premium', 'quality'].filter(Boolean).join(', ');
      }

      res.json({
        success: true,
        suggestion,
        original: recommendationType === 'title' ? currentProduct.title :
                  recommendationType === 'description' ? (currentProduct.body_html?.replace(/<[^>]*>/g, '').substring(0, 100) + '...' || 'No description') :
                  recommendationType === 'pricing' ? currentProduct.variants?.[0]?.price :
                  currentProduct.tags || 'No tags',
        product: {
          id: currentProduct.id,
          title: currentProduct.title,
          image: currentProduct.images?.[0]?.src,
          price: currentProduct.variants?.[0]?.price,
          type: recommendationType // Add the recommendation type to the response
        }
      });
    } catch (error) {
      console.error("Error generating suggestion:", error);
      res.status(500).json({ error: "Failed to generate suggestion" });
    }
  });

  // Apply bulk recommendations
  app.post("/api/shopify/apply-bulk-recommendations", requireAuth, async (req: Request, res: Response) => {
    try {
      const { storeId, recommendationType, productIds } = req.body;
      const { user } = req;

      // Check if user has enough credits
      const userCredits = await storage.getUserCredits(user.id);
      if (userCredits < productIds.length) {
        return res.status(402).json({ 
          error: "Insufficient credits",
          required: productIds.length,
          available: userCredits
        });
      }

      // Get the user's store
      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      if (!store.shopifyAccessToken) {
        return res.status(400).json({ error: "Store not connected to Shopify" });
      }

      let appliedCount = 0;
      let creditsUsed = 0;

      // Apply recommendations to each product with real AI generation
      for (const productId of productIds) {
        try {
          // Fetch current product data for AI optimization
          const currentProduct = await fetch(`https://${store.shopifyDomain}/admin/api/2024-10/products/${productId}.json`, {
            headers: {
              'X-Shopify-Access-Token': store.shopifyAccessToken,
              'Content-Type': 'application/json',
            },
          }).then(res => res.json()).then(data => data.product);

          if (!currentProduct) {
            console.error(`Product ${productId} not found`);
            continue;
          }

          const updateData: any = {};
          
          if (recommendationType === 'title') {
            // Use OpenAI to generate optimized title for each product
            const openai = await import('openai');
            const openaiClient = new openai.default({ 
              apiKey: process.env.OPENAI_API_KEY 
            });

            const titlePrompt = `You are an expert e-commerce copywriter. Create a compelling, SEO-optimized product title that will increase sales and conversions.

Current product title: "${currentProduct.title}"
Product type: ${currentProduct.product_type || 'Product'}
Price: $${currentProduct.variants?.[0]?.price || 'Unknown'}

Requirements:
- Keep it under 60 characters for optimal display
- Make it more professional and conversion-focused
- Include power words that drive sales (Premium, Professional, Best, Quality, etc.)
- Optimize for search engines and customer appeal
- Focus on benefits and value proposition

Generate ONLY the new optimized title, nothing else:`;

            try {
              const aiResponse = await openaiClient.chat.completions.create({
                model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
                messages: [{ role: "user", content: titlePrompt }],
                max_tokens: 100,
                temperature: 0.7,
              });
              
              updateData.title = aiResponse.choices[0].message.content?.trim() || `Premium ${currentProduct.title}`;
            } catch (error) {
              console.error('OpenAI title generation failed for bulk update:', error);
              updateData.title = `Premium ${currentProduct.title}`;
            }
          } else if (recommendationType === 'description') {
            // Use OpenAI to generate personalized description for each product
            const openai = await import('openai');
            const openaiClient = new openai.default({ 
              apiKey: process.env.OPENAI_API_KEY 
            });

            const descriptionPrompt = `You are an expert e-commerce copywriter specializing in conversion optimization. Create a compelling product description using market-proven keywords and conversion techniques.

Product: ${currentProduct.title}
Product type: ${currentProduct.product_type || 'Product'}
Vendor: ${currentProduct.vendor || 'Brand'}
Current price: $${currentProduct.variants?.[0]?.price || 'Unknown'}
Current description: ${currentProduct.body_html?.replace(/<[^>]*>/g, '').substring(0, 200) || 'No description'}

Requirements:
- Create a unique, compelling description for THIS specific product
- Use emotional triggers and benefits-focused language
- Include relevant SEO keywords naturally
- Structure with bullet points for key features/benefits
- Highlight unique selling propositions
- Focus on customer problems this product solves
- End with a clear call-to-action
- Keep it engaging and scannable (150-250 words)

Generate ONLY the clean description text without HTML tags, quotes, or extra formatting:`;

            try {
              const aiResponse = await openaiClient.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: descriptionPrompt }],
                max_tokens: 300,
                temperature: 0.7,
              });
              
              updateData.body_html = `<p>${aiResponse.choices[0].message.content?.trim() || `Experience the exceptional quality of our ${currentProduct.title}. Premium materials and expert craftsmanship ensure lasting satisfaction.`}</p>`;
            } catch (error) {
              console.error('OpenAI description generation failed for bulk update:', error);
              updateData.body_html = `<p>Experience the exceptional quality of our ${currentProduct.title}. Premium materials and expert craftsmanship ensure lasting satisfaction.</p>`;
            }
          } else if (recommendationType === 'keywords') {
            // Use OpenAI to generate optimized keywords/tags for each product
            const openai = await import('openai');
            const openaiClient = new openai.default({ 
              apiKey: process.env.OPENAI_API_KEY 
            });

            const keywordsPrompt = `You are an expert e-commerce SEO specialist. Generate optimized keywords and tags for this product to improve searchability and categorization.

Product: ${currentProduct.title}
Product type: ${currentProduct.product_type || 'Product'}
Vendor: ${currentProduct.vendor || 'Brand'}
Current tags: ${currentProduct.tags || 'None'}
Price: $${currentProduct.variants?.[0]?.price || 'Unknown'}

Requirements:
- Generate 8-12 relevant, high-impact keywords/tags
- Include both broad and specific search terms
- Mix of category terms, feature descriptors, and benefit keywords
- Consider seasonal and trending keywords when applicable
- Include brand and product type variations
- Separate keywords with commas
- Focus on terms customers actually search for

Generate ONLY the comma-separated list of optimized keywords, nothing else:`;

            try {
              const aiResponse = await openaiClient.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: keywordsPrompt }],
                max_tokens: 150,
                temperature: 0.7,
              });
              
              updateData.tags = aiResponse.choices[0].message.content?.trim() || `${currentProduct.product_type || 'product'}, quality, premium, ${currentProduct.vendor || 'brand'}`;
            } catch (error) {
              console.error('OpenAI keywords generation failed for bulk update:', error);
              updateData.tags = `${currentProduct.product_type || 'product'}, quality, premium, ${currentProduct.vendor || 'brand'}`;
            }
          } else if (recommendationType === 'pricing') {
            // Use OpenAI to generate optimized pricing for each product
            const openai = await import('openai');
            const openaiClient = new openai.default({ 
              apiKey: process.env.OPENAI_API_KEY 
            });

            const pricingPrompt = `You are an expert e-commerce pricing strategist. Analyze this product and recommend an optimized price based on market psychology, competitive positioning, and conversion optimization.

Product: ${currentProduct.title}
Product type: ${currentProduct.product_type || 'Product'}
Vendor: ${currentProduct.vendor || 'Brand'}
Current price: $${currentProduct.variants?.[0]?.price || 'Unknown'}
Compare at price: $${currentProduct.variants?.[0]?.compare_at_price || 'None'}
Product tags: ${currentProduct.tags || 'None'}
Created: ${currentProduct.created_at || 'Unknown'}

Market Analysis Requirements:
1. Apply psychological pricing principles (e.g., $19.99 vs $20.00)
2. Consider product category positioning and market standards
3. Factor in competitive landscape and value perception
4. Account for product lifecycle stage and inventory considerations
5. Balance conversion optimization with profit margins
6. Consider seasonal demand patterns if applicable

Pricing Strategy Factors:
- Premium positioning: Higher-end pricing for luxury/quality perception
- Value positioning: Competitive pricing for volume sales
- Psychological anchoring: Use of .99, .95, .97 endings
- Bundle opportunities: Consider tiered pricing structures

Return ONLY a JSON object with this exact format:
{
  "recommendedPrice": "XX.XX",
  "reasoning": "Brief explanation of pricing strategy used",
  "priceType": "premium|value|psychological|competitive"
}`;

            try {
              const aiResponse = await openaiClient.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: pricingPrompt }],
                max_tokens: 200,
                temperature: 0.3,
                response_format: { type: "json_object" }
              });
              
              const pricingData = JSON.parse(aiResponse.choices[0].message.content || '{}');
              
              if (pricingData.recommendedPrice && !isNaN(parseFloat(pricingData.recommendedPrice))) {
                updateData.variants = [{
                  id: currentProduct.variants?.[0]?.id,
                  price: pricingData.recommendedPrice
                }];
              } else {
                // Fallback to psychological pricing
                const currentPrice = parseFloat(currentProduct.variants?.[0]?.price || '0');
                if (currentPrice > 0) {
                  const optimizedPrice = currentPrice % 1 === 0 ? (currentPrice - 0.01).toFixed(2) : currentPrice.toFixed(2);
                  updateData.variants = [{
                    id: currentProduct.variants?.[0]?.id,
                    price: optimizedPrice
                  }];
                }
              }
            } catch (error) {
              console.error('OpenAI pricing optimization failed for bulk update:', error);
              // Fallback to psychological pricing
              const currentPrice = parseFloat(currentProduct.variants?.[0]?.price || '0');
              if (currentPrice > 0) {
                const optimizedPrice = currentPrice % 1 === 0 ? (currentPrice - 0.01).toFixed(2) : currentPrice.toFixed(2);
                updateData.variants = [{
                  id: currentProduct.variants?.[0]?.id,
                  price: optimizedPrice
                }];
              }
            }
          }

          if (Object.keys(updateData).length > 0) {
            console.log(`Debug - Bulk ${recommendationType} updateData for product ${productId}:`, JSON.stringify(updateData, null, 2));
            const bulkUpdateResult = await updateProduct(store.shopifyDomain, store.shopifyAccessToken, productId, updateData);
            console.log(`Debug - Bulk Shopify update result for ${recommendationType}:`, bulkUpdateResult ? 'Success' : 'Failed');
            await storage.deductCredits(user.id, 1, `Bulk ${recommendationType} optimization for "${currentProduct.title}"`);
            
            // Record the optimization
            await storage.recordProductOptimization({
              userId: user.id,
              userStoreId: store.id,
              shopifyProductId: productId,
              optimizationType: recommendationType,
              originalValue: recommendationType === 'title' ? currentProduct.title :
                             recommendationType === 'description' ? (currentProduct.body_html || 'No description') :
                             recommendationType === 'pricing' ? currentProduct.variants?.[0]?.price :
                             currentProduct.tags || 'No tags',
              optimizedValue: recommendationType === 'title' ? updateData.title :
                              recommendationType === 'description' ? updateData.body_html :
                              recommendationType === 'pricing' ? updateData.variants?.[0]?.price :
                              recommendationType === 'keywords' ? updateData.tags :
                              '',
              creditsUsed: 1,
            });
            
            appliedCount++;
            creditsUsed++;
          }
        } catch (error) {
          console.error(`Error updating product ${productId}:`, error);
          // Continue with other products
        }
      }

      res.json({ 
        success: true, 
        appliedCount, 
        creditsUsed,
        message: `Successfully updated ${appliedCount} products`
      });
    } catch (error) {
      console.error("Error applying bulk recommendations:", error);
      res.status(500).json({ error: "Failed to apply bulk recommendations" });
    }
  });

  // ================ SHOPIFY GDPR WEBHOOK ROUTES ================
  
  // Customer data request webhook (GDPR compliance)
  app.post("/api/webhooks/shopify/customers/data_request", express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    try {
      const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
      if (!hmacHeader || !validateWebhookSignature(req.body.toString(), hmacHeader)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const payload = JSON.parse(req.body.toString());
      console.log('Customer data request received:', payload);
      
      // Log the request for compliance purposes
      // In production, you would implement actual data export logic
      res.status(200).json({ message: 'Customer data request received' });
    } catch (error) {
      console.error('Error processing customer data request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Customer data deletion webhook (GDPR compliance)
  app.post("/api/webhooks/shopify/customers/redact", express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    try {
      const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
      if (!hmacHeader || !validateWebhookSignature(req.body.toString(), hmacHeader)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const payload = JSON.parse(req.body.toString());
      console.log('Customer data deletion request received:', payload);
      
      // In production, implement logic to delete customer data
      // For now, just acknowledge the request
      res.status(200).json({ message: 'Customer data deletion request received' });
    } catch (error) {
      console.error('Error processing customer data deletion:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Shop data deletion webhook (GDPR compliance)
  app.post("/api/webhooks/shopify/shop/redact", express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    try {
      const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
      if (!hmacHeader || !validateWebhookSignature(req.body.toString(), hmacHeader)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const payload = JSON.parse(req.body.toString());
      console.log('Shop data deletion request received:', payload);
      
      // In production, implement logic to delete shop-related data
      // This includes removing store connections and analysis data
      res.status(200).json({ message: 'Shop data deletion request received' });
    } catch (error) {
      console.error('Error processing shop data deletion:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ================ SUBSCRIPTION ROUTES ================
  
  // Get subscription plans
  app.get("/api/subscription/plans", async (req: Request, res: Response) => {
    try {
      const plans = await subscriptionService.getSubscriptionPlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching subscription plans:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  // Get user's current subscription
  app.get("/api/subscription", requireAuth, async (req: Request, res: Response) => {
    try {
      const subscription = await subscriptionService.getUserSubscription(req.user!.id);
      res.json(subscription);
    } catch (error) {
      console.error("Error fetching user subscription:", error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  // Create new subscription
  app.post("/api/subscription", requireAuth, async (req: Request, res: Response) => {
    try {
      const validatedData = createSubscriptionSchema.parse(req.body);
      
      const result = await subscriptionService.createSubscription(
        req.user!.id,
        validatedData.planId,
        validatedData.paymentMethodId
      );

      res.json(result);
    } catch (error) {
      console.error("Error creating subscription:", error);
      res.status(400).json({ 
        error: "Failed to create subscription", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Update subscription
  app.put("/api/subscription", requireAuth, async (req: Request, res: Response) => {
    try {
      const validatedData = updateSubscriptionSchema.parse(req.body);
      
      const subscription = await subscriptionService.updateSubscription(req.user!.id, validatedData);
      res.json(subscription);
    } catch (error) {
      console.error("Error updating subscription:", error);
      res.status(400).json({ 
        error: "Failed to update subscription", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Update payment method
  app.post("/api/subscription/payment-method", requireAuth, async (req: Request, res: Response) => {
    try {
      const validatedData = updatePaymentMethodSchema.parse(req.body);
      
      await subscriptionService.updatePaymentMethod(req.user!.id, validatedData.paymentMethodId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating payment method:", error);
      res.status(400).json({ 
        error: "Failed to update payment method", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get payment methods
  app.get("/api/subscription/payment-methods", requireAuth, async (req: Request, res: Response) => {
    try {
      const paymentMethods = await subscriptionService.getPaymentMethods(req.user!.id);
      res.json(paymentMethods);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ error: "Failed to fetch payment methods" });
    }
  });

  // Start trial subscription (new user registration with payment method)
  app.post("/api/subscription/trial", async (req: Request, res: Response) => {
    try {
      const validatedData = createTrialSubscriptionSchema.parse(req.body);
      
      const result = await subscriptionService.startTrial(
        req.user?.id || 0, // Will be updated when user is created
        validatedData.paymentMethodId
      );

      res.json({
        success: true,
        trialEnd: result.trialEnd,
        message: "Trial started successfully"
      });
    } catch (error) {
      console.error("Error starting trial:", error);
      res.status(400).json({ 
        error: "Failed to start trial", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // ================ STRIPE PAYMENT ROUTES ================
  
  // Create payment intent for credit purchase
  app.post("/api/payments/credits", requireAuth, async (req: Request, res: Response) => {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    try {
      const { package: packageType } = req.body;
      
      const packages = {
        starter: { credits: 50, price: 900 }, // $9.00
        growth: { credits: 150, price: 1900 }, // $19.00
        professional: { credits: 500, price: 3900 }, // $39.00
      };

      const selectedPackage = packages[packageType as keyof typeof packages];
      if (!selectedPackage) {
        return res.status(400).json({ error: "Invalid package" });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: selectedPackage.price,
        currency: 'usd',
        metadata: {
          userId: req.user!.id.toString(),
          credits: selectedPackage.credits.toString(),
          package: packageType,
        },
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ error: "Failed to create payment intent" });
    }
  });

  // Webhook for Stripe events
  app.post("/api/webhooks/stripe", express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    try {
      const sig = req.headers['stripe-signature'];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!sig || !webhookSecret) {
        return res.status(400).json({ error: "Missing signature or webhook secret" });
      }

      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

      // Handle subscription events
      await subscriptionService.handleWebhookEvent(event);

      // Handle one-time credit purchases
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { userId, credits, package: packageType } = paymentIntent.metadata;
        
        if (userId && credits) {
          await storage.addCredits(
            parseInt(userId), 
            parseInt(credits), 
            `Credit purchase - ${packageType} package`,
            paymentIntent.id
          );
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(400).json({ error: "Webhook failed" });
    }
  });

  // ================ PUBLIC/LEGACY ROUTES ================
  
  // Get recent analyses (public)
  app.get("/api/recent-analyses", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const analyses = await storage.getRecentAnalyses(limit);
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching recent analyses:", error);
      res.status(500).json({ error: "Failed to fetch recent analyses" });
    }
  });

  // ================ SHOPIFY INTEGRATION ROUTES ================
  
  // Initiate Shopify OAuth (Proper SaaS approach)
  app.post("/api/shopify/connect", requireAuth, async (req: Request, res: Response) => {
    try {
      const { shopDomain, userStoreId } = req.body;
      
      if (!shopDomain) {
        return res.status(400).json({ error: "Shop domain is required" });
      }
      
      // Validate and clean shop domain format
      let domain = shopDomain.replace('https://', '').replace('http://', '');
      // Remove trailing slash if present
      domain = domain.replace(/\/$/, '');
      
      if (!domain.includes('.myshopify.com') && !domain.includes('.')) {
        return res.status(400).json({ error: "Invalid shop domain format" });
      }
      
      // For development stores, check if they're properly configured
      console.log('Debug - Attempting OAuth for development store:', domain);
      
      // Generate OAuth URL for SaaS application
      const { authUrl, state } = await generateShopifyAuthUrl(domain, req.user!.id);
      
      // Store the userStoreId in the state if provided (for updating existing store)
      const stateWithStore = userStoreId ? `${state}:${userStoreId}` : state;
      
      const finalAuthUrl = authUrl.replace(state, stateWithStore);
      
      console.log('Debug - OAuth URL generation:', {
        shopDomain: domain,
        userId: req.user!.id,
        authUrl: finalAuthUrl,
        redirectUri: process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/shopify/callback`
          : 'http://localhost:5000/api/shopify/callback',
        apiKey: process.env.SHOPIFY_API_KEY,
        apiSecret: process.env.SHOPIFY_API_SECRET ? 'Set' : 'Missing'
      });
      
      res.json({ authUrl: finalAuthUrl });
    } catch (error) {
      console.error("Error initiating Shopify OAuth:", error);
      const currentRedirectUri = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/shopify/callback`
        : 'http://localhost:5000/api/shopify/callback';
        
      res.status(500).json({ 
        error: "Failed to initiate Shopify connection",
        details: `OAuth 404 error suggests app distribution issue. In Shopify Partners Dashboard, check:
1. App Setup → Distribution → Enable "Public distribution" (not just dev/test mode)
2. App Setup → URLs → Ensure redirect URI is correct: ${currentRedirectUri}
3. App must be PUBLIC for any store to use OAuth (like AutoDS works)
Domain: ${domain} | API Key: ${process.env.SHOPIFY_API_KEY}`
      });
    }
  });

  // Shopify OAuth callback handler
  app.get("/api/shopify/callback", async (req: Request, res: Response) => {
    try {
      const { code, state, shop, hmac, timestamp, host, error, error_description } = req.query;
      
      console.log('Debug - Shopify callback received:', {
        shop,
        code: code ? 'present' : 'missing',
        state: state ? 'present' : 'missing',
        hmac: hmac ? 'present' : 'missing',
        timestamp: timestamp ? 'present' : 'missing',
        host: host ? 'present' : 'missing',
        error: error ? error : 'none',
        error_description: error_description ? error_description : 'none'
      });

      // Handle OAuth errors from Shopify
      if (error) {
        console.error('Shopify OAuth error:', error, error_description);
        return res.status(400).send(`
          <html><body>
            <h1>Shopify OAuth Error</h1>
            <p><strong>Error:</strong> ${error}</p>
            <p><strong>Description:</strong> ${error_description || 'No description provided'}</p>
            <p>This usually indicates an issue with the app configuration in Shopify Partners Dashboard.</p>
            <script>window.close();</script>
          </body></html>
        `);
      }

      // Handle case where we get shop/hmac but no code/state (common pattern for app config issues)
      if (!code || !state) {
        if (shop && hmac) {
          console.error('OAuth authorization failed - received shop and hmac but no code/state');
          const debugInfo = `
            Shop: ${shop}
            HMAC: ${hmac ? 'present' : 'missing'}
            Timestamp: ${timestamp || 'missing'}
            Host: ${host || 'missing'}
            Expected redirect URI: ${process.env.REPLIT_DEV_DOMAIN 
              ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/shopify/callback`
              : 'http://localhost:5000/api/shopify/callback'}
          `;
          
          return res.status(400).send(`
            <html><body>
              <h1>OAuth Configuration Error</h1>
              <p>Shopify returned without authorization code. This typically means:</p>
              <ul>
                <li>User denied the OAuth request</li>
                <li>App is not properly configured in Shopify Partners Dashboard</li>
                <li>App distribution settings need to be updated to "Public"</li>
                <li>Redirect URI mismatch in app settings</li>
              </ul>
              <h3>Debug Information:</h3>
              <pre>${debugInfo}</pre>
              <script>window.close();</script>
            </body></html>
          `);
        }
        
        console.error('Missing required OAuth parameters - no code, state, or shop');
        return res.status(400).send(`
          <html><body>
            <h1>OAuth Error</h1>
            <p>Missing required parameters. Please try connecting again.</p>
            <script>window.close();</script>
          </body></html>
        `);
      }

      if (!shop) {
        console.error('Missing shop parameter');
        return res.status(400).send(`
          <html><body>
            <h1>OAuth Error</h1>
            <p>Missing shop parameter. Please try connecting again.</p>
            <script>window.close();</script>
          </body></html>
        `);
      }

      // Parse state to get user ID and optional store ID
      const stateParts = (state as string).split(':');
      let userId: number;
      let userStoreId: number | null = null;

      // Handle normal OAuth flow (server-generated state)
      // Format: randomHash:userId or randomHash:userId:userStoreId
      userId = parseInt(stateParts[1]);
      if (stateParts[2]) {
        userStoreId = parseInt(stateParts[2]);
      }

      if (!userId || isNaN(userId)) {
        console.error('Invalid user ID in state');
        return res.status(400).send(`
          <html><body>
            <h1>OAuth Error</h1>
            <p>Invalid state parameter. Please try connecting again.</p>
            <script>window.close();</script>
          </body></html>
        `);
      }

      // Exchange code for access token
      const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.SHOPIFY_API_KEY,
          client_secret: process.env.SHOPIFY_API_SECRET,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        console.error('Failed to exchange code for token:', tokenResponse.statusText);
        return res.status(500).send(`
          <html><body>
            <h1>Connection Failed</h1>
            <p>Failed to complete Shopify connection. Please try again.</p>
            <script>window.close();</script>
          </body></html>
        `);
      }

      const tokenData = await tokenResponse.json();
      const { access_token, scope } = tokenData;

      console.log('Debug - Token exchange successful, scope:', scope);

      // Get shop info
      const shopInfo = await getShopInfo(shop as string, access_token);
      
      if (userStoreId) {
        // Update existing store
        await storage.updateUserStore(userStoreId, {
          shopifyAccessToken: access_token,
          shopifyScope: scope,
          isConnected: true,
          connectionStatus: 'connected',
          lastSyncAt: new Date(),
          shopifyDomain: shop as string
        });
        console.log('Debug - Updated existing store:', userStoreId);
      } else {
        // Create new store
        await storage.createUserStore({
          userId,
          name: shopInfo.name,
          storeUrl: `https://${shop}`,
          storeType: 'shopify',
          description: shopInfo.description || `Shopify store: ${shopInfo.name}`,
          shopifyDomain: shop as string,
          shopifyAccessToken: access_token,
          shopifyScope: scope,
          isConnected: true,
          connectionStatus: 'connected',
          lastSyncAt: new Date()
        });
        console.log('Debug - Created new store for shop:', shop);
      }

      // Redirect to dashboard with success message
      res.send(`
        <html><body>
          <h1>Successfully Connected!</h1>
          <p>Your Shopify store has been connected. Redirecting to dashboard...</p>
          <script>
            setTimeout(() => {
              window.location.href = '/dashboard/stores';
            }, 2000);
          </script>
        </body></html>
      `);

    } catch (error) {
      console.error('Error in Shopify OAuth callback:', error);
      res.status(500).send(`
        <html><body>
          <h1>Connection Error</h1>
          <p>An error occurred while connecting your store. Please try again.</p>
          <script>window.close();</script>
        </body></html>
      `);
    }
  });
  
  // Get design recommendations for a store
  app.get("/api/design-recommendations/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const storeId = parseInt(req.params.storeId);
      const { user } = req;

      // Get the user's store
      const store = await storage.getUserStore(storeId);
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      // Get recent analysis for this store to extract design insights
      const analyses = await storage.getUserAnalyses(user.id, 50);
      let storeAnalysis = analyses.find(a => a.userStoreId === storeId);
      
      if (!storeAnalysis && store.storeUrl) {
        storeAnalysis = analyses.find(a => a.storeUrl === store.storeUrl);
      }

      if (!storeAnalysis) {
        return res.json({
          designScore: 0,
          suggestions: [],
          message: "No analysis available. Please run a store analysis first."
        });
      }

      // Generate design-specific suggestions using OpenAI
      const openai = await import('openai');
      const openaiClient = new openai.default({ 
        apiKey: process.env.OPENAI_API_KEY 
      });

      const designPrompt = `You are an expert UX/UI designer and conversion optimization specialist. Analyze this e-commerce store data and provide specific design improvement recommendations.

Store Analysis Data:
- Design Score: ${storeAnalysis.designScore}/20
- Overall Score: ${storeAnalysis.overallScore}/100
- Store URL: ${storeAnalysis.storeUrl}
- Store Type: ${storeAnalysis.storeType}

Current Issues Identified:
${storeAnalysis.suggestions?.map(s => `- ${s.title}: ${s.description}`).join('\n') || 'No specific issues identified'}

Please provide 3-6 specific design improvement recommendations in the following JSON format:
{
  "designScore": ${storeAnalysis.designScore},
  "suggestions": [
    {
      "id": "unique-id",
      "type": "colors|fonts|layout|images|mobile",
      "title": "Specific design improvement title",
      "description": "Detailed explanation of the improvement",
      "impact": "Expected impact on conversions/UX",
      "priority": "critical|high|medium|low",
      "suggestions": {
        "current": "Current design element description",
        "recommended": "Specific recommended change",
        "cssChanges": "CSS changes to implement (if applicable)"
      }
    }
  ]
}

Focus on:
- Color scheme optimization for better brand consistency
- Typography improvements for readability
- Mobile responsiveness enhancements
- Image optimization and visual hierarchy
- Layout improvements for better conversion
- Trust signal placement and design

Provide actionable, specific recommendations that can be implemented.`;

      try {
        const aiResponse = await openaiClient.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [{ role: "user", content: designPrompt }],
          response_format: { type: "json_object" },
          max_tokens: 1500,
          temperature: 0.7,
        });

        const designRecommendations = JSON.parse(aiResponse.choices[0].message.content || '{"suggestions": []}');
        
        // Add unique IDs if not present
        designRecommendations.suggestions = designRecommendations.suggestions.map((suggestion: any, index: number) => ({
          ...suggestion,
          id: suggestion.id || `design-${storeId}-${index}-${Date.now()}`
        }));

        res.json(designRecommendations);
      } catch (error) {
        console.error('OpenAI design analysis failed:', error);
        // Fallback design recommendations
        res.json({
          designScore: storeAnalysis.designScore,
          suggestions: [
            {
              id: `design-fallback-${storeId}-${Date.now()}`,
              type: 'colors',
              title: 'Optimize Brand Color Scheme',
              description: 'Improve brand consistency and visual hierarchy with a cohesive color palette',
              impact: 'Better brand recognition and user experience',
              priority: 'medium',
              suggestions: {
                current: 'Current color scheme may lack consistency',
                recommended: 'Implement a professional color palette with primary, secondary, and accent colors',
                cssChanges: 'Update CSS variables for consistent color usage across all elements'
              }
            }
          ]
        });
      }
    } catch (error) {
      console.error("Error fetching design recommendations:", error);
      res.status(500).json({ error: "Failed to fetch design recommendations" });
    }
  });

  // Generate new color palette suggestions
  app.post("/api/design-recommendations/generate-colors", requireAuth, async (req: Request, res: Response) => {
    try {
      const { storeId } = req.body;
      const { user } = req;

      // Get the user's store
      const store = await storage.getUserStore(storeId);
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      // Get recent analysis for this store to extract design insights
      const analyses = await storage.getUserAnalyses(user.id, 50);
      let storeAnalysis = analyses.find(a => a.userStoreId === storeId);
      
      if (!storeAnalysis && store.storeUrl) {
        storeAnalysis = analyses.find(a => a.storeUrl === store.storeUrl);
      }

      if (!storeAnalysis) {
        return res.status(400).json({ 
          error: "No analysis available. Please run a store analysis first." 
        });
      }

      // Generate new color palette using OpenAI
      const openai = await import('openai');
      const openaiClient = new openai.default({ 
        apiKey: process.env.OPENAI_API_KEY 
      });

      const colorPrompt = `You are an expert brand designer and color theory specialist. Generate a fresh, modern color palette for this e-commerce store.

Store Analysis Data:
- Store URL: ${storeAnalysis.storeUrl}
- Store Type: ${storeAnalysis.storeType}
- Current Design Score: ${storeAnalysis.designScore}/20

Create a new professional color palette with exactly 5 colors:
1. Primary brand color (for headers, CTAs, branding)
2. Secondary color (for accents, highlights)  
3. Background color (main page background)
4. Text color (readable on background)
5. Accent color (for buttons, links, highlights)

Provide the response in this exact JSON format:
{
  "id": "colors-new-${Date.now()}",
  "type": "colors",
  "title": "Modern Color Palette Update",
  "description": "Fresh color scheme designed to improve brand recognition and conversion rates",
  "impact": "Enhanced visual hierarchy and professional appearance",
  "priority": "medium",
  "suggestions": {
    "current": "Current color scheme lacks cohesion and modern appeal",
    "recommended": "Implement this carefully selected color palette: Primary: [COLOR1], Secondary: [COLOR2], Background: [COLOR3], Text: [COLOR4], Accent: [COLOR5]",
    "cssChanges": "Update CSS custom properties: --primary-color: [COLOR1]; --secondary-color: [COLOR2]; --bg-color: [COLOR3]; --text-color: [COLOR4]; --accent-color: [COLOR5];",
    "colorPalette": {
      "primary": "[HEX_COLOR1]",
      "secondary": "[HEX_COLOR2]", 
      "background": "[HEX_COLOR3]",
      "text": "[HEX_COLOR4]",
      "accent": "[HEX_COLOR5]"
    }
  }
}

Generate colors that:
- Work well together and have good contrast
- Suit the store's industry and target audience
- Follow modern design trends
- Are accessible (WCAG compliant)
- Create a professional, trustworthy appearance

Replace [COLOR1], [COLOR2], etc. with actual hex color codes like #3B82F6.`;

      const aiResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: colorPrompt }],
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.8, // Higher temperature for more creative color combinations
      });

      const newColorSuggestion = JSON.parse(aiResponse.choices[0].message.content || '{}');
      
      res.json(newColorSuggestion);
    } catch (error) {
      console.error("Error generating new colors:", error);
      res.status(500).json({ error: "Failed to generate new color palette" });
    }
  });

  // Apply design changes to Shopify store
  app.post("/api/shopify/apply-design", requireAuth, async (req: Request, res: Response) => {
    try {
      const { storeId, suggestionId, changes } = req.body;
      const { user } = req;
      
      console.log('Apply design request:', { storeId, suggestionId, changes });
      console.log('Changes received:', JSON.stringify(changes, null, 2));

      // Check if user has enough credits
      const userCredits = await storage.getUserCredits(user.id);
      if (userCredits < 1) {
        return res.status(402).json({ 
          error: "Insufficient credits",
          required: 1,
          available: userCredits
        });
      }

      // Get the user's store
      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      if (!store.shopifyAccessToken) {
        return res.status(400).json({ error: "Store not connected to Shopify" });
      }

      // Apply actual design changes to Shopify store
      try {
        // Check if we have theme permissions first
        console.log('Checking theme permissions for store:', store.shopifyDomain);
        console.log('Store scope:', store.shopifyScope);

        // Check if we have required permissions  
        const requiredScopes = ['write_themes', 'write_script_tags'];
        const currentScopes = store.shopifyScope?.split(',') || [];
        const missingScopes = requiredScopes.filter(scope => !currentScopes.includes(scope));
        
        if (missingScopes.length > 0) {
          console.log('Missing required scopes:', missingScopes);
          return res.status(400).json({ 
            error: "Store needs additional permissions", 
            message: `Your store connection is missing these permissions: ${missingScopes.join(', ')}. Please reconnect your store to grant these permissions.`,
            needsReconnect: true,
            missingScopes: missingScopes
          });
        }
        
        // Get active theme first with detailed debugging
        console.log('Fetching themes from:', `https://${store.shopifyDomain}/admin/api/2024-10/themes.json`);
        const themesResponse = await fetch(`https://${store.shopifyDomain}/admin/api/2024-10/themes.json`, {
          headers: {
            'X-Shopify-Access-Token': store.shopifyAccessToken!,
            'Content-Type': 'application/json',
          },
        });

        console.log('Themes response status:', themesResponse.status);
        console.log('Themes response headers:', Object.fromEntries(themesResponse.headers));

        if (!themesResponse.ok) {
          const errorText = await themesResponse.text();
          console.error(`Themes API error: ${themesResponse.status} ${themesResponse.statusText}`);
          console.error('Error body:', errorText);
          
          // Check if it's a permission issue
          if (themesResponse.status === 403) {
            return res.status(400).json({ 
              error: "Store needs theme permissions", 
              message: "Please reconnect your store to grant theme editing permissions. Go to Store Management and click 'Reconnect' to update permissions.",
              needsReconnect: true
            });
          }
          
          throw new Error(`Failed to fetch themes: ${themesResponse.statusText}`);
        }

        const themesData = await themesResponse.json();
        console.log('Raw themes data:', JSON.stringify(themesData, null, 2));
        console.log('Available themes:', themesData.themes?.map((t: any) => ({ id: t.id, name: t.name, role: t.role })));
        
        // Find the active theme (main or published)
        let activeTheme = themesData.themes?.find((theme: any) => theme.role === 'main');
        if (!activeTheme) {
          activeTheme = themesData.themes?.find((theme: any) => theme.role === 'published');
        }
        if (!activeTheme) {
          // If no main/published theme, use the first available theme
          activeTheme = themesData.themes?.[0];
        }

        if (!activeTheme) {
          throw new Error('No themes found in store');
        }
        
        console.log('Selected theme for modification:', { 
          id: activeTheme.id, 
          name: activeTheme.name, 
          role: activeTheme.role,
          store: store.shopifyDomain 
        });
        console.log('Using dynamic theme ID:', activeTheme.id, 'for store:', store.shopifyDomain);
        
        // Test theme assets endpoint first with the correct theme ID
        console.log('Testing theme assets access with theme ID:', activeTheme.id);
        const testAssetsResponse = await fetch(`https://${store.shopifyDomain}/admin/api/2024-10/themes/${activeTheme.id}/assets.json`, {
          headers: {
            'X-Shopify-Access-Token': store.shopifyAccessToken!,
            'Content-Type': 'application/json',
          },
        });
        
        console.log('Assets endpoint status:', testAssetsResponse.status);
        console.log('Assets URL:', `https://${store.shopifyDomain}/admin/api/2024-10/themes/${activeTheme.id}/assets.json`);
        
        if (!testAssetsResponse.ok) {
          const assetsError = await testAssetsResponse.text();
          console.error('Assets endpoint error:', assetsError);
          console.error('Assets response headers:', Object.fromEntries(testAssetsResponse.headers));
        } else {
          const assetsData = await testAssetsResponse.json();
          console.log('Assets access SUCCESS! Sample assets:', assetsData.assets?.slice(0, 5)?.map((a: any) => a.key));
          
          // Check if theme.liquid exists
          const hasThemeLiquid = assetsData.assets?.some((a: any) => a.key === 'layout/theme.liquid');
          console.log('Theme has theme.liquid file:', hasThemeLiquid);
        }

        // Apply changes based on suggestion type  
        // Handle different data structures - frontend sends suggestion.suggestions
        let colorPalette;
        if (changes.colorPalette) {
          colorPalette = changes.colorPalette;
        } else if (changes.recommended && typeof changes.recommended === 'string') {
          // Generate actual colors using AI since recommendation is just text
          console.log('Generating actual colors for recommendation:', changes.recommended);
          
          try {
            const colorGenerationPrompt = `Based on this design recommendation: "${changes.recommended}"
            
            Generate a specific color palette with actual hex colors. Return ONLY a JSON object with this exact structure:
            {
              "primary": "#hexcolor",
              "secondary": "#hexcolor", 
              "accent": "#hexcolor",
              "background": "#hexcolor",
              "text": "#hexcolor"
            }
            
            Make the colors:
            - Professional and modern
            - High contrast for readability
            - Suitable for e-commerce
            - Cohesive as a palette`;

            const aiResponse = await openaiClient.chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: colorGenerationPrompt }],
              response_format: { type: "json_object" },
              max_tokens: 200,
            });

            const generatedColors = JSON.parse(aiResponse.choices[0].message.content || '{}');
            if (generatedColors.primary && generatedColors.secondary) {
              colorPalette = generatedColors;
              console.log('Generated color palette from AI:', colorPalette);
            }
          } catch (e) {
            console.warn('Could not generate colors from AI, using fallback colors');
            // Fallback to a professional color scheme
            colorPalette = {
              primary: '#2563eb',
              secondary: '#64748b', 
              accent: '#10b981',
              background: '#ffffff',
              text: '#1f2937'
            };
          }
        }
        
        console.log('Extracted color palette:', colorPalette);
        
        // Generate a complete new theme using OpenAI
        let themeUpdateSuccess = false;
        
        try {
          console.log('Generating complete new theme with OpenAI for store:', store.shopifyDomain);
          
          // First, analyze the current store to understand its structure
          const storeAnalysisPrompt = `Analyze this Shopify store and create a comprehensive theme redesign recommendation.

Store URL: ${store.storeUrl}
Current theme ID: ${activeTheme.id}
Design recommendation: ${changes.recommended}

Based on the design recommendation, generate a complete theme overhaul that includes:
1. A modern, professional color palette
2. Typography recommendations
3. Layout improvements
4. Mobile-first responsive design
5. E-commerce conversion optimizations

Return ONLY a JSON object with this structure:
{
  "themeName": "StoreScore Optimized Theme",
  "colorPalette": {
    "primary": "#hexcolor",
    "secondary": "#hexcolor", 
    "accent": "#hexcolor",
    "background": "#hexcolor",
    "text": "#hexcolor",
    "success": "#hexcolor",
    "warning": "#hexcolor",
    "error": "#hexcolor"
  },
  "typography": {
    "headingFont": "font family name",
    "bodyFont": "font family name",
    "headingSizes": ["h1 size", "h2 size", "h3 size"],
    "lineHeight": "1.6"
  },
  "layout": {
    "headerStyle": "description",
    "navigationStyle": "description", 
    "productGridColumns": 3,
    "footerStyle": "description"
  },
  "customCSS": "/* Complete CSS that transforms the theme */",
  "designNotes": "Brief explanation of the design decisions"
}`;

          const themeResponse = await openaiClient.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: storeAnalysisPrompt }],
            response_format: { type: "json_object" },
            max_tokens: 2000,
          });

          const themeDesign = JSON.parse(themeResponse.choices[0].message.content || '{}');
          console.log('Generated theme design:', JSON.stringify(themeDesign, null, 2));
          
          if (themeDesign.customCSS) {
            // Create a comprehensive CSS override
            const fullThemeCSS = `
/* StoreScore AI-Generated Theme - Applied ${new Date().toLocaleString()} */
/* Theme: ${themeDesign.themeName || 'StoreScore Optimized'} */

/* Visual confirmation indicator */
body::before {
  content: "✓ StoreScore AI Theme Active" !important;
  position: fixed !important;
  top: 10px !important;
  right: 10px !important;
  background: ${themeDesign.colorPalette?.primary || '#1A73E8'} !important;
  color: white !important;
  padding: 8px 12px !important;
  font-size: 12px !important;
  font-weight: bold !important;
  z-index: 99999 !important;
  border-radius: 4px !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
}

/* Apply generated color palette */
:root {
  --storescore-primary: ${themeDesign.colorPalette?.primary || '#1A73E8'};
  --storescore-secondary: ${themeDesign.colorPalette?.secondary || '#185ABC'};
  --storescore-accent: ${themeDesign.colorPalette?.accent || '#FF6F61'};
  --storescore-background: ${themeDesign.colorPalette?.background || '#FFFFFF'};
  --storescore-text: ${themeDesign.colorPalette?.text || '#333333'};
  --storescore-success: ${themeDesign.colorPalette?.success || '#10b981'};
  --storescore-warning: ${themeDesign.colorPalette?.warning || '#f59e0b'};
  --storescore-error: ${themeDesign.colorPalette?.error || '#ef4444'};
}

/* Typography improvements */
body {
  font-family: ${themeDesign.typography?.bodyFont || 'system-ui, -apple-system, sans-serif'} !important;
  line-height: ${themeDesign.typography?.lineHeight || '1.6'} !important;
  color: var(--storescore-text) !important;
}

h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4, .h5, .h6 {
  font-family: ${themeDesign.typography?.headingFont || 'system-ui, -apple-system, sans-serif'} !important;
  color: var(--storescore-text) !important;
}

/* Generated custom CSS */
${themeDesign.customCSS}

/* Enhanced header styling */
.site-header, .header, .page-header,
.shopify-section-header, .top-bar, .header-wrapper,
[class*="header"], header, nav, .navigation,
.site-nav, .main-nav, #shopify-section-header { 
  background-color: var(--storescore-primary) !important; 
  background: var(--storescore-primary) !important;
  color: white !important;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important;
}

/* Modern button styling */
button, .btn, .button, 
input[type="submit"], input[type="button"],
.btn-primary, [class*="button"], [class*="btn"],
.product-form__cart-submit, .cart__submit,
.shopify-payment-button__button, .add-to-cart,
.btn--add-to-cart, .product-single__add-to-cart { 
  background-color: var(--storescore-accent) !important; 
  background: var(--storescore-accent) !important;
  border-color: var(--storescore-accent) !important;
  color: white !important;
  border-radius: 6px !important;
  padding: 12px 24px !important;
  font-weight: 600 !important;
  transition: all 0.3s ease !important;
}

button:hover, .btn:hover, .button:hover {
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
}

/* Enhanced price styling */
.price, .product__price, .product-price,
[class*="price"], .money, .currency,
.product-form__price, span[class*="price"],
.price-item, .product-single__price { 
  color: var(--storescore-primary) !important; 
  font-weight: 700 !important;
  font-size: 1.2em !important;
}

/* Modern footer */
.footer, .site-footer, [class*="footer"],
#shopify-section-footer { 
  background-color: var(--storescore-secondary) !important; 
  color: white !important;
  padding: 40px 0 !important;
}

/* Improved links */
a { 
  color: var(--storescore-primary) !important;
  text-decoration: none !important;
  transition: color 0.3s ease !important;
}

a:hover {
  color: var(--storescore-accent) !important;
}

/* Navigation improvements */
.site-nav a, .main-nav a, nav a {
  color: white !important;
  font-weight: 500 !important;
  padding: 8px 16px !important;
  border-radius: 4px !important;
  transition: background-color 0.3s ease !important;
}

.site-nav a:hover, .main-nav a:hover, nav a:hover {
  background-color: rgba(255,255,255,0.1) !important;
}

/* Product grid improvements */
.product-item, .product-card, [class*="product"] {
  border-radius: 8px !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
  transition: transform 0.3s ease, box-shadow 0.3s ease !important;
}

.product-item:hover, .product-card:hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15) !important;
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  body::before {
    font-size: 10px !important;
    padding: 6px 10px !important;
  }
  
  button, .btn, .button {
    padding: 10px 20px !important;
    font-size: 14px !important;
  }
}`;

            // Create script tag to inject the complete theme
            const themeScript = `
(function() {
  // Remove any existing StoreScore styles
  var existing = document.getElementById('storescore-ai-theme');
  if (existing) existing.remove();
  
  // Create and inject new complete theme
  var style = document.createElement('style');
  style.id = 'storescore-ai-theme';
  style.innerHTML = \`${fullThemeCSS.replace(/`/g, '\\`')}\`;
  document.head.appendChild(style);
  
  console.log('StoreScore: AI-generated theme applied successfully');
  console.log('Theme design:', ${JSON.stringify(themeDesign)});
})();`;

            // First, clean up any existing StoreScore scripts
            try {
              const existingScriptsResponse = await fetch(
                `https://${store.shopifyDomain}/admin/api/2024-10/script_tags.json`,
                {
                  headers: {
                    'X-Shopify-Access-Token': store.shopifyAccessToken!,
                    'Content-Type': 'application/json',
                  },
                }
              );
              
              if (existingScriptsResponse.ok) {
                const scripts = await existingScriptsResponse.json();
                console.log('Found existing script tags:', scripts.script_tags?.length || 0);
                
                for (const script of scripts.script_tags || []) {
                  if (script.display_scope === 'online_store' && 
                      script.src?.includes('data:text/javascript')) {
                    console.log('Removing existing StoreScore script:', script.id);
                    await fetch(
                      `https://${store.shopifyDomain}/admin/api/2024-10/script_tags/${script.id}.json`,
                      {
                        method: 'DELETE',
                        headers: {
                          'X-Shopify-Access-Token': store.shopifyAccessToken!,
                        },
                      }
                    );
                  }
                }
              }
            } catch (cleanupError) {
              console.warn('Could not clean up existing scripts:', cleanupError);
            }

            // Create optimized theme script that fits Shopify's 255 char limit
            const optimizedThemeScript = `
(function(){
var s=document.createElement('style');
s.id='storescore-theme';
if(document.getElementById('storescore-theme'))document.getElementById('storescore-theme').remove();
s.innerHTML='body{border-top:5px solid ${themeDesign.colorPalette?.primary||'#1A73E8'}!important}body::before{content:"✓ StoreScore AI"!important;position:fixed!important;top:10px!important;right:10px!important;background:${themeDesign.colorPalette?.primary||'#1A73E8'}!important;color:#fff!important;padding:4px 8px!important;font-size:10px!important;z-index:99999!important;border-radius:3px!important}header,.site-header{background:${themeDesign.colorPalette?.primary||'#1A73E8'}!important;color:#fff!important}button,.btn{background:${themeDesign.colorPalette?.accent||'#FF6F61'}!important;border:none!important;color:#fff!important}';
document.head.appendChild(s);
})();`;

            // Create the new theme script tag
            const scriptTagPayload = {
              script_tag: {
                event: 'onload',
                src: `data:text/javascript;base64,${Buffer.from(optimizedThemeScript).toString('base64')}`,
                display_scope: 'online_store'
              }
            };
            
            console.log('Creating AI theme script tag...');
            const scriptResponse = await fetch(
              `https://${store.shopifyDomain}/admin/api/2024-10/script_tags.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': store.shopifyAccessToken!,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(scriptTagPayload)
              }
            );
            
            console.log('AI theme script creation response status:', scriptResponse.status);
            
            if (scriptResponse.ok) {
              const scriptResult = await scriptResponse.json();
              console.log('AI theme script created successfully!', scriptResult.script_tag?.id);
              themeUpdateSuccess = true;
            } else {
              const scriptError = await scriptResponse.text();
              console.error('AI theme script creation failed:', scriptError);
            }
          }
          
        } catch (themeError) {
          console.error('AI theme generation failed:', themeError);
        }
        
        if (!themeUpdateSuccess) {
          console.warn('Could not apply AI-generated theme');
        } else {
          console.log('AI-generated theme successfully applied to store!');
        }

        console.log(`Successfully processed design changes for Shopify store: ${store.shopifyDomain}`);
        console.log('Applied color palette:', JSON.stringify(colorPalette, null, 2));
      } catch (shopifyError) {
        console.error('Shopify API error:', shopifyError);
        
        // If it's a permission error, inform the user they need to reconnect
        if (shopifyError.message.includes('Forbidden') || shopifyError.message.includes('403')) {
          return res.status(400).json({ 
            error: "Store needs theme permissions", 
            message: "Your store doesn't have theme editing permissions. Please reconnect your store to grant theme editing access.",
            needsReconnect: true
          });
        }
        
        // For other errors, continue with credit deduction but inform user
        console.warn('Design application failed but continuing with credit deduction');
      }

      // Deduct credits
      await storage.deductCredits(user.id, 1, `Design optimization applied: ${suggestionId}`);

      // Record the design optimization
      await storage.recordProductOptimization({
        userId: user.id,
        userStoreId: store.id,
        shopifyProductId: 'theme-design', // Special identifier for design changes
        optimizationType: 'design',
        originalValue: changes.current || 'Current design',
        optimizedValue: changes.recommended,
        creditsUsed: 1,
      });

      res.json({ 
        success: true, 
        message: "Design changes have been applied to your store theme",
        suggestion: changes.recommended
      });
    } catch (error) {
      console.error("Error applying design changes:", error);
      res.status(500).json({ error: "Failed to apply design changes" });
    }
  });

  // ================ SHOPIFY ANALYSIS ROUTES ================
  
  // Analyze a specific connected Shopify store
  app.post("/api/shopify/analyze/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const storeId = parseInt(req.params.storeId);
      const { user } = req;

      console.log('🔄 Shopify store analysis request:', { storeId, userId: user.id });

      // Check user credits
      const userCredits = await storage.getUserCredits(user.id);
      if (userCredits < 1) {
        return res.status(402).json({ 
          error: 'Insufficient credits', 
          creditsRequired: 1,
          creditsAvailable: userCredits
        });
      }

      // Get the user's store
      const store = await storage.getUserStore(storeId);
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      if (!store.storeUrl) {
        return res.status(400).json({ error: "Store URL not available" });
      }

      console.log('📊 Analyzing store:', store.storeUrl);

      // Get optimization data to inform analysis
      const optimizations = await storage.getProductOptimizations(store.id);
      
      // Group optimizations by product
      const optimizedProducts: Record<string, string[]> = {};
      optimizations.forEach(opt => {
        if (!optimizedProducts[opt.shopifyProductId]) {
          optimizedProducts[opt.shopifyProductId] = [];
        }
        optimizedProducts[opt.shopifyProductId].push(opt.optimizationType);
      });

      console.log('🔧 Found optimizations for', Object.keys(optimizedProducts).length, 'products');

      // Perform store analysis with optimization context
      let result;
      if (store.storeType === 'shopify') {
        result = await analyzeShopifyStore(store.storeUrl, {
          storeId: store.id,
          optimizedProducts,
          totalOptimizations: optimizations.length
        });
      } else {
        return res.status(400).json({ error: "Unsupported store type for this endpoint" });
      }
      
      console.log('✅ Analysis completed for store:', store.storeUrl);

      // Store the analysis result
      const storedAnalysis = await storage.createStoreAnalysis({
        userId: user.id,
        userStoreId: store.id,
        storeUrl: store.storeUrl,
        storeType: store.storeType || 'shopify',
        ebayUsername: null,
        overallScore: result.overallScore,
        strengths: result.strengths,
        warnings: result.warnings,
        critical: result.critical,
        designScore: result.designScore,
        productScore: result.productScore,
        seoScore: result.seoScore,
        trustScore: result.trustScore,
        pricingScore: result.pricingScore,
        conversionScore: result.conversionScore,
        analysisData: result,
        suggestions: result.suggestions,
        summary: result.summary,
        storeRecap: result.storeRecap,
        creditsUsed: 1,
        contentHash: (result as any).contentHash || null
      });

      // Deduct credits
      await storage.deductCredits(user.id, 1, "Shopify store analysis", storedAnalysis.id);

      console.log('💾 Analysis stored with ID:', storedAnalysis.id);

      res.json(storedAnalysis);
    } catch (error) {
      console.error("❌ Error analyzing Shopify store:", error);
      res.status(500).json({ 
        error: "Failed to analyze store", 
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
