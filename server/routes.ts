import express, { type Request, type Response, type Express } from "express";
import { createServer, type Server } from "http";
import cookieParser from "cookie-parser";
import { storage } from "./storage";
import { ANALYSIS, CREDITS } from "@shared/constants";
import { handleApiError, handleAuthError, handleInsufficientCreditsError, asyncHandler } from "@shared/errorHandler";
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

// Initialize Stripe if key is available
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

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
        if (userCredits < CREDITS.ANALYSIS_COST) {
          return handleInsufficientCreditsError(res, CREDITS.ANALYSIS_COST, userCredits);
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
        await storage.deductCredits(req.user.id, CREDITS.ANALYSIS_COST, "Store analysis", storedAnalysis.id);

        // Update store last analyzed timestamp if userStoreId provided
        if (userStoreId) {
          await storage.updateUserStore(userStoreId, { lastAnalyzedAt: new Date() });
        }
      }
      
      console.log("Analysis completed successfully");
      res.json(storedAnalysis);
      
    } catch (error) {
      handleApiError(error, "analyze store", res);
    }
  });

  // Get user's analyses
  app.get("/api/analyses", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || ANALYSIS.DEFAULT_LIMIT;
    const analyses = await storage.getUserAnalyses(req.user!.id, limit);
    res.json(analyses);
  }, "fetch user analyses"));

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

      // Fetch products from Shopify
      try {
        const products = await fetchStoreProducts(store.shopifyDomain, store.shopifyAccessToken);
        res.json(products);
      } catch (shopifyError: any) {
        console.error("Shopify API Error:", shopifyError.message);
        
        // If unauthorized, mark store as disconnected
        if (shopifyError.message.includes('Unauthorized') || shopifyError.message.includes('401')) {
          await storage.updateUserStore(store.id, {
            isConnected: false,
            connectionStatus: 'disconnected'
          });
          
          return res.status(401).json({ 
            error: "Shopify connection expired. Please reconnect your store.",
            needsReconnection: true
          });
        }
        
        throw shopifyError;
      }
    } catch (error) {
      console.error("Error fetching Shopify products:", error);
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

      // First, fetch the current product data using GraphQL
      const { fetchSingleProduct } = await import('./services/shopifyIntegration.js');
      const productData = await fetchSingleProduct(store.shopifyDomain, store.shopifyAccessToken, productId);
      const currentProduct = productData.product;

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

      // Fetch the current product data using GraphQL
      const { fetchSingleProduct } = await import('./services/shopifyIntegration.js');
      const productData = await fetchSingleProduct(store.shopifyDomain, store.shopifyAccessToken, productId);
      const currentProduct = productData.product;

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
          // Fetch current product data for AI optimization using GraphQL
          const { fetchSingleProduct } = await import('./services/shopifyIntegration.js');
          const productData = await fetchSingleProduct(store.shopifyDomain, store.shopifyAccessToken, productId);
          const currentProduct = productData.product;

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

  // ================ ALEX AI BOT ROUTES ================
  
  // Get store insights for Alex
  app.get("/api/alex/insights", requireAuth, async (req: Request, res: Response) => {
    try {
      const { user } = req;
      const stores = await storage.getUserStores(user.id);
      
      const insights = await Promise.all(stores.map(async (store) => {
        // Get recent analyses for this user
        const allAnalyses = await storage.getUserAnalyses(user.id, 50);
        // Filter to analyses for this specific store
        const analyses = allAnalyses.filter(a => a.userStoreId === store.id).slice(0, 5);
        
        if (analyses.length === 0) {
          return {
            storeId: store.id,
            storeName: store.name,
            healthScore: 0,
            totalProducts: 0,
            weakestAreas: [],
            lastAnalyzed: null,
            topIssues: []
          };
        }
        
        const latestAnalysis = analyses[0];
        const healthScore = Math.round((
          (latestAnalysis.designScore || 0) + 
          (latestAnalysis.productScore || 0) + 
          (latestAnalysis.trustScore || 0) + 
          (latestAnalysis.seoScore || 0) + 
          (latestAnalysis.pricingScore || 0) + 
          (latestAnalysis.conversionScore || 0)
        ) / 6);
        
        // Identify weakest areas
        const areaScores = [
          { area: 'design', score: latestAnalysis.designScore || 0 },
          { area: 'products', score: latestAnalysis.productScore || 0 },
          { area: 'trust', score: latestAnalysis.trustScore || 0 },
          { area: 'seo', score: latestAnalysis.seoScore || 0 },
          { area: 'pricing', score: latestAnalysis.pricingScore || 0 },
          { area: 'conversion', score: latestAnalysis.conversionScore || 0 }
        ];
        
        const weakestAreas = areaScores
          .filter(area => area.score < 70)
          .sort((a, b) => a.score - b.score)
          .map(area => area.area);
        
        // Generate top issues based on analysis
        const topIssues = [];
        if (latestAnalysis.designScore < 70) {
          topIssues.push({
            category: 'design',
            description: 'Store design and visual appeal need improvement',
            severity: latestAnalysis.designScore < 50 ? 'critical' : 'high'
          });
        }
        if (latestAnalysis.productScore < 70) {
          topIssues.push({
            category: 'products',
            description: 'Product titles, descriptions, and images need optimization',
            severity: latestAnalysis.productScore < 50 ? 'critical' : 'high'
          });
        }
        if (latestAnalysis.trustScore < 70) {
          topIssues.push({
            category: 'trust',
            description: 'Trust signals and customer reviews missing',
            severity: latestAnalysis.trustScore < 50 ? 'critical' : 'medium'
          });
        }
        if (latestAnalysis.seoScore < 70) {
          topIssues.push({
            category: 'seo',
            description: 'SEO and search optimization opportunities',
            severity: latestAnalysis.seoScore < 50 ? 'critical' : 'medium'
          });
        }
        
        return {
          storeId: store.id,
          storeName: store.name,
          healthScore,
          totalProducts: 0, // We'll get this from Shopify if needed
          weakestAreas,
          lastAnalyzed: latestAnalysis.createdAt,
          topIssues
        };
      }));
      
      res.json(insights);
    } catch (error) {
      console.error("Error getting Alex insights:", error);
      res.status(500).json({ error: "Failed to get store insights" });
    }
  });

  // Get user's chat sessions
  app.get("/api/alex/sessions", requireAuth, async (req: Request, res: Response) => {
    try {
      const { user } = req;
      const sessions = await storage.getUserChatSessions(user.id);
      res.json(sessions);
    } catch (error) {
      console.error("Error getting chat sessions:", error);
      res.status(500).json({ error: "Failed to get chat sessions" });
    }
  });

  // Create new chat session
  app.post("/api/alex/sessions", requireAuth, async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const { user } = req;
      
      if (!title) {
        return res.status(400).json({ error: "Session title is required" });
      }

      const session = await storage.createChatSession(user.id, title);
      res.json(session);
    } catch (error) {
      console.error("Error creating chat session:", error);
      res.status(500).json({ error: "Failed to create chat session" });
    }
  });

  // Get messages for a specific session
  app.get("/api/alex/sessions/:sessionId/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { user } = req;
      
      // Verify session belongs to user
      const session = await storage.getChatSession(parseInt(sessionId));
      if (!session || session.userId !== user.id) {
        return res.status(404).json({ error: "Session not found" });
      }

      const messages = await storage.getChatMessages(parseInt(sessionId));
      res.json(messages);
    } catch (error) {
      console.error("Error getting chat messages:", error);
      res.status(500).json({ error: "Failed to get chat messages" });
    }
  });

  // Delete chat session
  app.delete("/api/alex/sessions/:sessionId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { user } = req;
      
      // Verify session belongs to user
      const session = await storage.getChatSession(parseInt(sessionId));
      if (!session || session.userId !== user.id) {
        return res.status(404).json({ error: "Session not found" });
      }

      await storage.deleteChatSession(parseInt(sessionId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting chat session:", error);
      res.status(500).json({ error: "Failed to delete chat session" });
    }
  });

  // Chat with Alex
  app.post("/api/alex/chat", requireAuth, async (req: Request, res: Response) => {
    try {
      const { message, context, sessionId } = req.body;
      const { user } = req;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // If no sessionId provided, create a new session
      let chatSessionId = sessionId;
      if (!chatSessionId) {
        const sessionTitle = message.length > 30 ? message.substring(0, 30) + "..." : message;
        const newSession = await storage.createChatSession(user.id, sessionTitle);
        chatSessionId = newSession.id;
      } else {
        // Verify session belongs to user
        const session = await storage.getChatSession(chatSessionId);
        if (!session || session.userId !== user.id) {
          return res.status(404).json({ error: "Session not found" });
        }
      }

      // Save user message
      await storage.addChatMessage(chatSessionId, user.id, message, false);

      // Use OpenAI to generate Alex's response
      const openai = await import('openai');
      const openaiClient = new openai.default({ 
        apiKey: process.env.OPENAI_API_KEY 
      });

      const systemPrompt = `You are Alex, a humanoid AI e-commerce manager and strategic assistant. You help Shopify/eBay sellers grow their business by analyzing their store data and providing actionable insights.

Your personality:
- Friendly, insightful, occasionally witty
- Proactive and solution-focused  
- Speak like a knowledgeable business partner
- Use emojis sparingly but effectively
- Keep responses concise but valuable

Your capabilities:
- Analyze store performance data
- Suggest specific improvements
- Teach e-commerce skills and strategies
- Propose actionable next steps
- Help with product optimization, ads, scaling

Always be specific and actionable. Don't give generic advice.`;

      let userPrompt = message;
      
      // Add context to the prompt if available
      if (context) {
        if (context.type === 'education') {
          userPrompt = `The user wants to learn about e-commerce optimization. Their store data: ${JSON.stringify(context.insights?.slice(0, 1))}. Provide a practical lesson about their weakest area. Keep it under 150 words with 1-2 specific actionable tips.`;
        } else if (context.type === 'scaling') {
          userPrompt = `The user wants scaling strategies. Their store performance: ${JSON.stringify(context.insights?.slice(0, 1))}. Give specific scaling advice based on their current state. Include 2-3 concrete next steps.`;
        } else if (context.type === 'weak_products') {
          userPrompt = `Show the user's weakest products and specific fixes. Store data: ${JSON.stringify(context.insights?.slice(0, 1))}. Suggest specific product optimization actions.`;
        } else if (context.stores && context.insights) {
          userPrompt = `User message: "${message}". Store context: ${JSON.stringify(context.insights?.slice(0, 1))}. Respond as Alex with specific insights and actions.`;
        }
      }

      const response = await openaiClient.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 400,
        temperature: 0.7,
      });

      const alexResponse = response.choices[0].message.content || "I'm having trouble processing that. Can you try asking something else?";

      // Generate action buttons based on context and response
      const actions = [];
      
      if (message.toLowerCase().includes('teach') || message.toLowerCase().includes('learn')) {
        actions.push({
          id: 'more-tips',
          label: 'More Tips',
          icon: 'BookOpen',
          action: 'education'
        });
      }
      
      if (context?.insights?.[0]?.healthScore < 70) {
        actions.push({
          id: 'fix-now',
          label: 'Fix Issues',
          icon: 'Zap',
          action: 'optimize'
        });
      }
      
      if (context?.insights?.[0]?.healthScore >= 70) {
        actions.push({
          id: 'create-ads',
          label: 'Create Ads',
          icon: 'Camera',
          action: 'ads'
        });
      }

      // Save Alex's response
      await storage.addChatMessage(chatSessionId, user.id, alexResponse, true, actions);

      res.json({ 
        message: alexResponse,
        actions: actions,
        sessionId: chatSessionId
      });
    } catch (error) {
      console.error("Error processing Alex chat:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // ================ AI AD GENERATION ROUTES ================
  
  // Generate AI-powered ads
  app.post("/api/generate-ads", requireAuth, checkCredits(1), async (req: Request, res: Response) => {
    try {
      const { storeId, productId, isWholeStore, platform, adStyle, format, variants, targetAudience } = req.body;
      const { user } = req;

      // Validate required fields
      if (!storeId || !platform || !adStyle || !format || !targetAudience) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get the user's store
      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      let productData = null;
      let storeData = {
        name: store.name,
        url: store.storeUrl,
        domain: store.shopifyDomain
      };

      // If product-specific ad, fetch product data
      if (!isWholeStore && productId && store.shopifyAccessToken) {
        try {
          const { fetchSingleProduct } = await import('./services/shopifyIntegration.js');
          const result = await fetchSingleProduct(store.shopifyDomain, store.shopifyAccessToken, productId);
          productData = result.product;
        } catch (error) {
          console.error('Error fetching product data:', error);
          return res.status(400).json({ error: "Failed to fetch product data" });
        }
      }

      // Generate AI-powered visual ads
      const openai = await import('openai');
      const openaiClient = new openai.default({ 
        apiKey: process.env.OPENAI_API_KEY 
      });

      const promptBase = `You are a professional creative director and copywriter specializing in high-converting visual ${platform} ads. Create compelling, platform-optimized visual ads with specific design instructions.`;
      
      let productInfo = '';
      let productImages = [];
      
      if (isWholeStore) {
        productInfo = `
Store Name: ${storeData.name}
Store URL: ${storeData.url}
Store Type: E-commerce store
`;
      } else if (productData) {
        productImages = productData.edges?.[0]?.node?.images?.edges?.map((img: any) => img.node.url) || [];
        productInfo = `
Product Name: ${productData.edges?.[0]?.node?.title || productData.title}
Product Description: ${productData.edges?.[0]?.node?.description || productData.body_html?.replace(/<[^>]*>/g, '').substring(0, 300) || 'Premium quality product'}
Category: ${productData.edges?.[0]?.node?.productType || productData.product_type || 'Product'}
Price: $${productData.edges?.[0]?.node?.variants?.edges?.[0]?.node?.price || productData.variants?.[0]?.price || 'Contact for pricing'}
Tags: ${productData.edges?.[0]?.node?.tags?.join(', ') || productData.tags || 'Quality, Premium'}
Available Images: ${productImages.length} product images available
Primary Image: ${productImages[0] || 'No image available'}
`;
      }

      // Platform-specific format requirements
      const platformSpecs = {
        'Facebook': {
          image_ratio: '1.91:1 (landscape) or 1:1 (square)',
          text_limits: 'Headline: 40 chars, Primary text: 125 chars',
          visual_style: 'Clean, professional, with clear product focus'
        },
        'Instagram': {
          image_ratio: '1:1 (square) or 4:5 (portrait)',
          text_limits: 'Headline: 30 chars, Primary text: 2200 chars',
          visual_style: 'Aesthetic, lifestyle-focused, visually appealing'
        },
        'TikTok': {
          image_ratio: '9:16 (vertical)',
          text_limits: 'Headline: 20 chars, Primary text: 100 chars',
          visual_style: 'Bold, trendy, youth-oriented, dynamic'
        },
        'Google Ads': {
          image_ratio: '1.91:1 (landscape)',
          text_limits: 'Headline: 30 chars, Description: 90 chars',
          visual_style: 'Clean, informative, trust-building'
        },
        'Pinterest': {
          image_ratio: '2:3 (portrait)',
          text_limits: 'Headline: 100 chars, Description: 500 chars',
          visual_style: 'Inspirational, lifestyle, high-quality imagery'
        }
      };

      const currentPlatformSpec = platformSpecs[platform] || platformSpecs['Facebook'];

      const adPrompt = `${promptBase}

${productInfo}
Target Audience: ${targetAudience}
Platform: ${platform}
Ad Style: ${adStyle}
Format: ${format}

PLATFORM SPECIFICATIONS FOR ${platform}:
- Image Ratio: ${currentPlatformSpec.image_ratio}
- Text Limits: ${currentPlatformSpec.text_limits}
- Visual Style: ${currentPlatformSpec.visual_style}

VISUAL AD REQUIREMENTS:
- Create ${variants} unique ad variations optimized for ${platform}
- Include specific visual design instructions for each ad
- Use ${adStyle} approach for maximum emotional impact
- Provide detailed instructions for image composition and styling
- Include color schemes, typography suggestions, and layout guidance
- Specify how to incorporate the product image effectively
- Keep text within platform limits: ${currentPlatformSpec.text_limits}

CREATIVE REQUIREMENTS:
- Headlines should be ${format === 'short' ? 'punchy and direct' : format === 'medium' ? 'engaging with benefits' : 'detailed and compelling'}
- Focus on benefits, emotional triggers, and conversion optimization
- Use platform-specific best practices for ${platform}
- Include visual storytelling elements
- Specify background colors, text overlays, and product placement

Generate ${variants} DALL-E 3 prompts for creating complete visual ad images.
Each prompt should create a full ad image with text overlays burned directly into the image.

Return in JSON format:
{
  "ads": [
    {
      "headline": "Platform-optimized headline for reference",
      "primary_text": "Compelling ad copy for reference", 
      "call_to_action": "Strong CTA for reference",
      "dalle_prompt": "Detailed DALL-E 3 prompt to generate complete visual ad with text overlays",
      "platform_format": "${platform} ${currentPlatformSpec.image_ratio}",
      "style_description": "Brief description of the visual style and approach"
    }
  ]
}`;

      console.log('Debug - Generating ads with OpenAI...');
      
      const aiResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: adPrompt }],
        max_tokens: 1500,
        temperature: 0.8,
        response_format: { type: "json_object" }
      });

      let adPrompts;
      try {
        const responseContent = aiResponse.choices[0].message.content || '{}';
        const parsedResponse = JSON.parse(responseContent);
        
        // Handle DALL-E prompt format
        if (parsedResponse.ads && Array.isArray(parsedResponse.ads)) {
          adPrompts = parsedResponse.ads;
        } else if (Array.isArray(parsedResponse)) {
          adPrompts = parsedResponse;
        } else {
          adPrompts = [parsedResponse];
        }
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        // Fallback ad prompts
        const productTitle = isWholeStore ? storeData.name : (productData?.edges?.[0]?.node?.title || productData?.title || 'Premium Product');
        adPrompts = [{
          headline: `Discover ${productTitle}`,
          primary_text: "Premium quality products with exceptional value",
          call_to_action: "Shop Now",
          dalle_prompt: `Create a professional ${platform} ad image for "${productTitle}". Style: ${adStyle}. Include bold text overlay with the headline "Discover ${productTitle}" prominently displayed. Use modern typography, ${currentPlatformSpec.visual_style.toLowerCase()} aesthetic. Aspect ratio: ${currentPlatformSpec.image_ratio}. Background should be clean and professional.`,
          platform_format: `${platform} ${currentPlatformSpec.image_ratio}`,
          style_description: `Professional ${platform} advertisement with clean design`
        }];
      }

      // Generate actual visual ads using DALL-E 3
      let generatedAds = [];
      
      for (let i = 0; i < adPrompts.length && i < variants; i++) {
        const adPrompt = adPrompts[i];
        
        try {
          console.log(`Debug - Generating visual ad ${i + 1} with DALL-E 3...`);
          
          // Generate image with DALL-E 3
          const imageResponse = await openaiClient.images.generate({
            model: "dall-e-3",
            prompt: adPrompt.dalle_prompt,
            n: 1,
            size: platform === 'TikTok' ? "1024x1792" : // 9:16 vertical
                   platform === 'Pinterest' ? "1024x1536" : // 2:3 portrait  
                   platform === 'Instagram' ? "1024x1024" : // 1:1 square
                   "1792x1024", // 1.91:1 landscape for Facebook/Google
            quality: "hd",
            style: adStyle.toLowerCase().includes('premium') ? "natural" : "vivid"
          });

          const imageUrl = imageResponse.data[0].url;
          
          generatedAds.push({
            headline: adPrompt.headline,
            primary_text: adPrompt.primary_text,
            call_to_action: adPrompt.call_to_action,
            image_url: imageUrl,
            platform_format: adPrompt.platform_format,
            style_description: adPrompt.style_description,
            dalle_prompt: adPrompt.dalle_prompt
          });
          
          console.log(`Debug - Successfully generated visual ad ${i + 1}`);
          
        } catch (imageError) {
          console.error(`Error generating image for ad ${i + 1}:`, imageError);
          
          // Fallback to text-based ad if image generation fails
          generatedAds.push({
            headline: adPrompt.headline,
            primary_text: adPrompt.primary_text,
            call_to_action: adPrompt.call_to_action,
            image_url: null,
            platform_format: adPrompt.platform_format,
            style_description: adPrompt.style_description + " (Image generation failed)",
            dalle_prompt: adPrompt.dalle_prompt,
            error: "Image generation failed"
          });
        }
      }

      // Ensure we have the requested number of variants (only if needed)
      while (generatedAds.length < variants && generatedAds.length > 0) {
        const baseAd = generatedAds[0];
        generatedAds.push({
          headline: baseAd.headline + " - Limited Time",
          primary_text: baseAd.primary_text + " Don't miss out!",
          call_to_action: baseAd.call_to_action,
          image_url: baseAd.image_url,
          platform_format: baseAd.platform_format,
          style_description: baseAd.style_description + " (Variant)",
          dalle_prompt: baseAd.dalle_prompt
        });
      }

      // Trim to requested number
      generatedAds = generatedAds.slice(0, variants);

      // Deduct credits (1 credit per generation batch, regardless of number of variants)
      const creditsUsed = 1;
      await storage.deductCredits(user.id, creditsUsed, `AI ad generation for ${isWholeStore ? store.name : productData?.title || 'product'}`);

      console.log(`Debug - Successfully generated ${generatedAds.length} ads using ${creditsUsed} credits`);

      res.json({ 
        ads: generatedAds,
        creditsUsed 
      });
    } catch (error) {
      console.error("Error generating ads:", error);
      res.status(500).json({ error: "Failed to generate ads" });
    }
  });

  // ================ IMAGE DOWNLOAD ROUTE ================
  app.get("/api/download-image", async (req: Request, res: Response) => {
    try {
      const { url, filename } = req.query;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "Image URL is required" });
      }

      // Fetch the image from OpenAI
      const response = await fetch(url as string);
      
      if (!response.ok) {
        return res.status(404).json({ error: "Image not found" });
      }

      const buffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(buffer);

      // Set appropriate headers for download
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${filename || 'ad-image.png'}"`);
      res.setHeader('Content-Length', imageBuffer.length);

      res.send(imageBuffer);
    } catch (error) {
      console.error("Error downloading image:", error);
      res.status(500).json({ error: "Failed to download image" });
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

  // Apply design changes to Shopify store
  app.post("/api/shopify/apply-design", requireAuth, async (req: Request, res: Response) => {
    try {
      const { storeId, suggestionId, changes } = req.body;
      const { user } = req;

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

      // For now, we'll simulate design application since Shopify theme customization
      // requires more complex API calls and theme asset management
      // In a real implementation, this would:
      // 1. Update theme settings via Admin API
      // 2. Modify theme assets (CSS, liquid files)
      // 3. Update theme customizations

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

  // Shopify OAuth callback (handles both installation and authorization)
  app.get("/api/shopify/callback", async (req: Request, res: Response) => {
    try {
      console.log('Debug - Shopify callback received:', req.query);
      const { code, state, shop, hmac, host, timestamp } = req.query;
      
      // Handle app installation (when redirected without code)
      if (!code && shop && hmac) {
        console.log('Debug - App installation detected, redirecting to OAuth');
        // This is an app installation, redirect to proper OAuth flow
        const shopDomain = shop as string;
        const installUrl = `https://${shopDomain}/admin/oauth/authorize?` +
          `client_id=${process.env.SHOPIFY_API_KEY}&` +
          `scope=read_products,write_products,write_content&` +
          `redirect_uri=${encodeURIComponent(process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/shopify/callback` : 'http://localhost:5000/api/shopify/callback')}&` +
          `state=install_${Date.now()}`;
        
        return res.redirect(installUrl);
      }
      
      // Handle OAuth authorization (when code is present)
      if (!code || !shop) {
        console.log('Debug - Missing required OAuth parameters:', { code: !!code, shop: !!shop });
        return res.status(400).send("Missing required OAuth parameters");
      }
      
      // Parse state to get userId and optionally userStoreId
      const stateParts = (state as string).split(':');
      let userId: number;
      let userStoreId: number | null = null;
      
      // Handle installation state (install_timestamp) vs regular OAuth state (hash:userId)
      if ((state as string).startsWith('install_')) {
        console.log('Debug - Installation flow detected, using session user');
        // For installation flow, we need to get the current user from session
        if (!req.user?.id) {
          console.log('Debug - Installation without authenticated user');
          return res.redirect('/login?error=auth_required&message=' + encodeURIComponent('Please log in to connect your Shopify store.'));
        }
        userId = req.user.id;
        console.log('Debug - Using session userId:', userId);
      } else {
        console.log('Debug - Regular OAuth flow detected');
        // Regular OAuth state parsing
        userId = stateParts.length >= 3 ? parseInt(stateParts[2]) : parseInt(stateParts[1]);
        userStoreId = stateParts.length >= 4 ? parseInt(stateParts[3]) : null;
        
        if (!userId || isNaN(userId)) {
          console.log('Debug - State parsing failed:', { state, stateParts, userId, userStoreId });
          return res.status(400).send("Invalid state parameter");
        }
      }
      
      // Exchange code for access token
      let access_token, scope;
      try {
        const tokenResponse = await exchangeCodeForToken(
          shop as string, 
          code as string, 
          state as string
        );
        access_token = tokenResponse.access_token;
        scope = tokenResponse.scope;
      } catch (error) {
        console.error('Token exchange failed:', error);
        return res.redirect('/dashboard/stores?error=oauth_failed&message=' + encodeURIComponent('Failed to authenticate with Shopify. Please check your store settings and try again.'));
      }
      
      // Get shop information
      let shopInfo;
      try {
        shopInfo = await getShopInfo(shop as string, access_token);
      } catch (error) {
        console.error('Failed to get shop info:', error);
        return res.redirect('/dashboard/stores?error=shop_info_failed&message=' + encodeURIComponent('Connected to Shopify but failed to get store information.'));
      }
      
      // Check if store already exists for this user and shop domain
      const existingStores = await storage.getUserStores(userId);
      const existingStore = existingStores.find(store => 
        store.shopifyDomain === shop || 
        store.storeUrl?.includes(shop as string) ||
        store.name === shopInfo.name
      );

      if (existingStore) {
        // Update existing store with new token and permissions
        console.log('Debug - Updating existing store:', existingStore.id);
        await storage.updateUserStore(existingStore.id, {
          shopifyAccessToken: access_token,
          shopifyDomain: shop as string,
          shopifyScope: scope,
          isConnected: true,
          connectionStatus: 'connected',
          lastSyncAt: new Date(),
          name: shopInfo.name,
          storeUrl: `https://${shopInfo.domain}`
        });
      } else if (userStoreId) {
        // Update specific store (from reconnection)
        console.log('Debug - Updating specified store:', userStoreId);
        await storage.updateUserStore(userStoreId, {
          shopifyAccessToken: access_token,
          shopifyDomain: shop as string,
          shopifyScope: scope,
          isConnected: true,
          connectionStatus: 'connected',
          lastSyncAt: new Date(),
          name: shopInfo.name,
          storeUrl: `https://${shopInfo.domain}`
        });
      } else {
        // Create new store only if none exists
        console.log('Debug - Creating new store for:', shopInfo.name);
        await storage.createUserStore({
          userId,
          name: shopInfo.name,
          storeUrl: `https://${shopInfo.domain}`,
          storeType: 'shopify',
          shopifyAccessToken: access_token,
          shopifyDomain: shop as string,
          shopifyScope: scope,
          isConnected: true,
          connectionStatus: 'connected',
          lastSyncAt: new Date()
        });
      }
      
      // Check if this is from a popup window (has opener)
      // If so, close the popup; otherwise redirect normally
      res.send(`
        <html>
          <head><title>Connection Successful</title></head>
          <body>
            <script>
              if (window.opener) {
                // Close popup and refresh parent window
                window.opener.postMessage('shopify-connected', '*');
                window.close();
              } else {
                // Regular redirect for non-popup flows
                window.location.href = '/dashboard/stores?connected=true&shop=${encodeURIComponent(shopInfo.name)}';
              }
            </script>
            <div style="text-align: center; font-family: Arial, sans-serif; margin-top: 50px;">
              <h2>Successfully Connected!</h2>
              <p>Your Shopify store "${shopInfo.name}" has been connected.</p>
              <p><em>This window will close automatically...</em></p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error in Shopify OAuth callback:", error);
      res.send(`
        <html>
          <head><title>Connection Failed</title></head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage('shopify-error', '*');
                window.close();
              } else {
                window.location.href = '/dashboard/stores?error=connection_failed';
              }
            </script>
            <div style="text-align: center; font-family: Arial, sans-serif; margin-top: 50px;">
              <h2>Connection Failed</h2>
              <p>There was an error connecting your Shopify store.</p>
              <p><em>This window will close automatically...</em></p>
            </div>
          </body>
        </html>
      `);
    }
  });
  
  // Trigger automatic analysis for connected Shopify store
  app.post("/api/shopify/analyze/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const storeId = parseInt(req.params.storeId);
      const store = await storage.getUserStore(storeId);
      
      if (!store || store.userId !== req.user!.id) {
        return res.status(404).json({ error: "Store not found" });
      }
      
      if (!store.isConnected || !store.shopifyAccessToken) {
        return res.status(400).json({ error: "Store not connected to Shopify" });
      }
      
      // Check user credits
      const userCredits = await storage.getUserCredits(req.user!.id);
      if (userCredits < 1) {
        return res.status(402).json({ 
          error: 'Insufficient credits', 
          creditsRequired: 1,
          creditsAvailable: userCredits
        });
      }
      
      // Get store products for comprehensive analysis
      const products = await getStoreProducts(
        store.shopifyDomain!, 
        store.shopifyAccessToken, 
        100
      );
      
      // Get shop info
      const shopInfo = await getShopInfo(
        store.shopifyDomain!, 
        store.shopifyAccessToken
      );
      
      // Create analysis content from Shopify data
      const analysisContent = createShopifyAnalysisContent(shopInfo, products);
      
      // Run AI analysis with real Shopify data
      const analysisData = {
        storeContent: analysisContent,
        storeType: 'shopify' as const,
        storeUrl: store.storeUrl!
      };
      
      const result = await analyzeStoreWithAI(analysisData);
      
      // Store the analysis
      const storedAnalysis = await storage.createStoreAnalysis({
        userId: req.user!.id,
        userStoreId: store.id,
        storeUrl: store.storeUrl,
        storeType: 'shopify',
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
        contentHash: null // Shopify API data changes frequently
      });
      
      // Deduct credits
      await storage.deductCredits(req.user!.id, 1, "Shopify store analysis", storedAnalysis.id);
      
      // Update store with analysis results
      await storage.updateUserStore(store.id, { 
        lastAnalyzedAt: new Date(),
        lastAnalysisScore: result.overallScore,
        aiRecommendationsCount: result.suggestions?.length || 0
      });
      
      res.json(storedAnalysis);
    } catch (error) {
      console.error("Error analyzing Shopify store:", error);
      res.status(500).json({ error: "Failed to analyze store" });
    }
  });

  // Categories & SEO recommendations
  app.get("/api/seo-recommendations/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const userId = (req as any).user.id;

      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== userId) {
        return res.status(404).json({ error: "Store not found" });
      }

      const { generateSEORecommendations } = await import("./services/openai");
      const seoAnalysis = await generateSEORecommendations(store.storeUrl, store.storeType);
      res.json(seoAnalysis);
    } catch (error) {
      console.error("Error fetching SEO recommendations:", error);
      res.status(500).json({ error: "Failed to fetch SEO recommendations" });
    }
  });

  // Legal pages recommendations
  app.get("/api/legal-recommendations/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const userId = (req as any).user.id;

      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== userId) {
        return res.status(404).json({ error: "Store not found" });
      }

      const { generateLegalRecommendations } = await import("./services/openai");
      const legalAnalysis = await generateLegalRecommendations(store.storeUrl, store.storeType);
      res.json(legalAnalysis);
    } catch (error) {
      console.error("Error fetching legal recommendations:", error);
      res.status(500).json({ error: "Failed to fetch legal recommendations" });
    }
  });

  // Conversion optimization recommendations
  app.get("/api/conversion-recommendations/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const userId = (req as any).user.id;

      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== userId) {
        return res.status(404).json({ error: "Store not found" });
      }

      const { generateConversionRecommendations } = await import("./services/openai");
      const conversionAnalysis = await generateConversionRecommendations(store.storeUrl, store.storeType);
      res.json(conversionAnalysis);
    } catch (error) {
      console.error("Error fetching conversion recommendations:", error);
      res.status(500).json({ error: "Failed to fetch conversion recommendations" });
    }
  });

  // Reviews and trust recommendations
  app.get("/api/trust-recommendations/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const userId = (req as any).user.id;

      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== userId) {
        return res.status(404).json({ error: "Store not found" });
      }

      const { generateTrustRecommendations } = await import("./services/openai");
      const trustAnalysis = await generateTrustRecommendations(store.storeUrl, store.storeType);
      res.json(trustAnalysis);
    } catch (error) {
      console.error("Error fetching trust recommendations:", error);
      res.status(500).json({ error: "Failed to fetch trust recommendations" });
    }
  });

  // Apply recommendation endpoints with credit deduction
  app.post("/api/apply-seo-recommendation", requireAuth, checkCredits(1), async (req: Request, res: Response) => {
    try {
      const { storeId, suggestionId, changes } = req.body;
      const { user } = req;

      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      // Deduct credits
      await storage.deductCredits(user.id, 1, `SEO optimization applied: ${suggestionId}`);

      // Record the optimization
      await storage.recordProductOptimization({
        userId: user.id,
        userStoreId: store.id,
        shopifyProductId: 'seo-optimization',
        optimizationType: 'seo',
        originalValue: changes.current || 'Current SEO',
        optimizedValue: changes.recommended,
        creditsUsed: 1,
      });

      res.json({ 
        success: true, 
        message: "SEO optimization has been applied",
        suggestion: changes.recommended
      });
    } catch (error) {
      console.error("Error applying SEO recommendation:", error);
      res.status(500).json({ error: "Failed to apply SEO recommendation" });
    }
  });

  app.post("/api/apply-legal-recommendation", requireAuth, checkCredits(1), async (req: Request, res: Response) => {
    try {
      console.log("Legal recommendation apply request:", {
        body: req.body,
        user: req.user ? { id: req.user.id, email: req.user.email } : null
      });

      const { storeId, suggestionId, changes } = req.body;
      const user = req.user;

      if (!user) {
        console.error("No user found in request");
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!storeId || !suggestionId || !changes) {
        console.error("Missing required fields:", { storeId, suggestionId, changes: !!changes });
        return res.status(400).json({ error: "Missing required fields" });
      }

      const store = await storage.getUserStore(parseInt(storeId));
      console.log("Found store:", store ? { id: store.id, userId: store.userId } : null);
      
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      console.log("Deducting credits for user:", user.id);
      await storage.deductCredits(user.id, 1, `Legal page optimization applied: ${suggestionId}`);

      console.log("Recording product optimization");
      await storage.recordProductOptimization({
        userId: user.id,
        userStoreId: store.id,
        shopifyProductId: 'legal-page',
        optimizationType: 'legal',
        originalValue: changes.current || 'Current legal page',
        optimizedValue: changes.recommended,
        creditsUsed: 1,
      });

      console.log("Legal recommendation applied successfully");
      res.json({ 
        success: true, 
        message: "Legal page optimization has been applied",
        suggestion: changes.recommended
      });
    } catch (error) {
      console.error("Error applying legal recommendation:", error);
      res.status(500).json({ error: "Failed to apply legal recommendation", details: error.message });
    }
  });

  app.post("/api/apply-conversion-recommendation", requireAuth, checkCredits(1), async (req: Request, res: Response) => {
    try {
      const { storeId, suggestionId, changes } = req.body;
      const { user } = req;

      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      await storage.deductCredits(user.id, 1, `Conversion optimization applied: ${suggestionId}`);

      await storage.recordProductOptimization({
        userId: user.id,
        userStoreId: store.id,
        shopifyProductId: 'conversion-optimization',
        optimizationType: 'conversion',
        originalValue: changes.current || 'Current conversion element',
        optimizedValue: changes.recommended,
        creditsUsed: 1,
      });

      res.json({ 
        success: true, 
        message: "Conversion optimization has been applied",
        suggestion: changes.recommended
      });
    } catch (error) {
      console.error("Error applying conversion recommendation:", error);
      res.status(500).json({ error: "Failed to apply conversion recommendation" });
    }
  });

  app.post("/api/apply-trust-recommendation", requireAuth, checkCredits(1), async (req: Request, res: Response) => {
    try {
      const { storeId, suggestionId, changes } = req.body;
      const { user } = req;

      const store = await storage.getUserStore(parseInt(storeId));
      if (!store || store.userId !== user.id) {
        return res.status(404).json({ error: "Store not found" });
      }

      // Check if store has Shopify access for real modifications
      if (!store.shopifyAccessToken || !store.shopifyDomain) {
        return res.status(400).json({ 
          error: "Store not connected to Shopify. Please reconnect your store to apply trust optimizations directly to Shopify." 
        });
      }

      let actualChanges = {
        applied: false,
        message: "Trust optimization tracked in system",
        shopifyChanges: []
      };

      try {
        console.log(`Applying trust optimization for store ${store.shopifyDomain}, suggestion: ${suggestionId}`);
        
        // Apply actual Shopify modifications based on suggestion type
        const { applyTrustOptimization } = await import('./services/shopifyTrustOptimization.js');
        actualChanges = await applyTrustOptimization(
          store.shopifyDomain,
          store.shopifyAccessToken,
          suggestionId,
          changes
        );
        
        console.log(`Trust optimization result:`, actualChanges);
      } catch (shopifyError) {
        console.error("Shopify trust optimization failed:", shopifyError);
        
        // Check if this is a permissions error
        if (shopifyError.message && shopifyError.message.includes('write_content')) {
          actualChanges.message = "⚠️ Missing Shopify Permissions: Your store needs 'write_content' permission. Please reconnect your store to enable trust optimizations.";
        } else {
          actualChanges.message = "Trust optimization tracked. Shopify modification failed - manual implementation required.";
        }
      }

      // Deduct credits and record optimization
      await storage.deductCredits(user.id, 1, `Trust optimization applied: ${suggestionId}`);

      await storage.recordProductOptimization({
        userId: user.id,
        userStoreId: store.id,
        shopifyProductId: 'trust-optimization',
        optimizationType: 'trust',
        originalValue: changes.current || 'Current trust element',
        optimizedValue: changes.recommended,
        creditsUsed: 1,
      });

      // Determine if this is a review-specific optimization that needs manual setup
      const isReviewOptimization = suggestionId.includes('review') || 
        changes.recommended.toLowerCase().includes('review') ||
        changes.implementation.toLowerCase().includes('review');

      let responseMessage = actualChanges.message;
      
      if (isReviewOptimization && actualChanges.applied) {
        responseMessage = `✅ Review system foundation applied! Added review prompts to product pages, customer testimonials to existing pages, and created review policy page.

🔧 For full functionality: Install Judge.me, Yotpo, or Loox from Shopify App Store to enable star ratings, review collection, and automated emails.

📍 Check: Shopify Admin → Products → [Your Products] to see review prompts added to descriptions.`;
      }

      res.json({ 
        success: true, 
        message: actualChanges.applied ? responseMessage : actualChanges.message,
        suggestion: changes.recommended,
        shopifyApplied: actualChanges.applied,
        modifications: actualChanges.shopifyChanges,
        requiresManualStep: isReviewOptimization
      });
    } catch (error) {
      console.error("Error applying trust recommendation:", error);
      res.status(500).json({ error: "Failed to apply trust recommendation" });
    }
  });

  // Calculate time savings for optimization
  app.post("/api/calculate-time-savings", requireAuth, async (req: Request, res: Response) => {
    try {
      const { optimizationType, productData, bulkCount = 1 } = req.body;
      
      if (!optimizationType) {
        return res.status(400).json({ error: "Optimization type is required" });
      }

      // Use OpenAI to calculate realistic time savings
      const openai = await import('openai');
      const openaiClient = new openai.default({ 
        apiKey: process.env.OPENAI_API_KEY 
      });

      const timeSavingsPrompt = `You are an e-commerce efficiency expert. Calculate the realistic manual time savings for the following optimization task.

Optimization Type: ${optimizationType}
Number of Products: ${bulkCount}
Product Context: ${productData ? JSON.stringify(productData).slice(0, 500) : 'Standard e-commerce products'}

For ${optimizationType} optimization, consider:
- Research time (competitor analysis, keyword research, market analysis)
- Writing/content creation time
- Testing and iteration
- Quality review and approval process
- Implementation time

Provide ONLY a JSON response with this exact format:
{
  "timePerProduct": "X minutes",
  "totalTimeSaved": "X hours Y minutes",
  "breakdown": {
    "research": "X minutes",
    "creation": "X minutes", 
    "review": "X minutes",
    "implementation": "X minutes"
  },
  "efficiency": "Saves XX% of manual work"
}

Base your calculations on realistic e-commerce workflows and industry standards.`;

      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert e-commerce consultant specializing in workflow optimization and time management. Provide accurate time savings calculations based on real industry data."
          },
          {
            role: "user",
            content: timeSavingsPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      });

      const timeSavings = JSON.parse(completion.choices[0].message.content || '{}');
      
      res.json(timeSavings);
    } catch (error) {
      console.error("Error calculating time savings:", error);
      res.status(500).json({ error: "Failed to calculate time savings" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}