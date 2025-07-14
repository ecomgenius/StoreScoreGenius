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

      // Fetch products from Shopify
      const products = await fetchStoreProducts(store.shopifyDomain, store.shopifyAccessToken);
      res.json(products);
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

      // First, fetch the current product data
      const currentProduct = await fetch(`https://${store.shopifyDomain}/admin/api/2023-10/products/${productId}.json`, {
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
      const currentProduct = await fetch(`https://${store.shopifyDomain}/admin/api/2023-10/products/${productId}.json`, {
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
          const currentProduct = await fetch(`https://${store.shopifyDomain}/admin/api/2023-10/products/${productId}.json`, {
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
        
        // Get active theme first
        const themesResponse = await fetch(`https://${store.shopifyDomain}/admin/api/2023-10/themes.json`, {
          headers: {
            'X-Shopify-Access-Token': store.shopifyAccessToken!,
            'Content-Type': 'application/json',
          },
        });

        if (!themesResponse.ok) {
          console.error(`Themes API error: ${themesResponse.status} ${themesResponse.statusText}`);
          
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
        const activeTheme = themesData.themes.find((theme: any) => theme.role === 'main');

        if (!activeTheme) {
          throw new Error('No active theme found');
        }

        // Apply changes based on suggestion type
        // Handle different data structures - frontend sends suggestion.suggestions
        let colorPalette;
        if (changes.colorPalette) {
          colorPalette = changes.colorPalette;
        } else if (changes.recommended && typeof changes.recommended === 'string') {
          // Try to parse colors from the recommended text
          try {
            const recommendedText = changes.recommended;
            // Extract hex colors from text using regex
            const hexColorRegex = /#[0-9A-Fa-f]{6}/g;
            const extractedColors = recommendedText.match(hexColorRegex) || [];
            
            if (extractedColors.length >= 4) {
              colorPalette = {
                primary: extractedColors[0],
                secondary: extractedColors[1],
                accent: extractedColors[2],
                background: extractedColors[3],
                text: extractedColors[4] || '#333333'
              };
            }
          } catch (e) {
            console.warn('Could not parse colors from recommended text');
          }
        }
        
        console.log('Extracted color palette:', colorPalette);
        
        if (colorPalette) {
          let colorUpdateSuccess = false;
          
          // Try method 1: Update theme settings (requires write_themes permission)
          try {
            const settingsResponse = await fetch(
              `https://${store.shopifyDomain}/admin/api/2023-10/themes/${activeTheme.id}/assets.json?asset[key]=config/settings_data.json`,
              {
                headers: {
                  'X-Shopify-Access-Token': store.shopifyAccessToken!,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (settingsResponse.ok) {
              const settingsData = await settingsResponse.json();
              let settings = {};
              
              try {
                settings = JSON.parse(settingsData.asset.value);
              } catch (e) {
                console.warn('Could not parse existing settings, using defaults');
                settings = { current: {} };
              }

              // Update color settings (common theme setting names)
              const colorMappings = {
                primary: ['color_primary', 'accent_color', 'brand_color'],
                secondary: ['color_secondary', 'secondary_color'],
                background: ['color_body_bg', 'background_color', 'body_color'],
                text: ['color_body_text', 'text_color', 'body_text'],
                accent: ['color_accent', 'accent_color_2', 'highlight_color']
              };

              let colorsUpdated = false;
              Object.entries(colorPalette).forEach(([colorType, hexColor]) => {
                const possibleKeys = colorMappings[colorType as keyof typeof colorMappings] || [];
                possibleKeys.forEach(key => {
                  if (settings.current && settings.current[key] !== undefined) {
                    settings.current[key] = hexColor;
                    colorsUpdated = true;
                  }
                });
              });

              // Update the settings if any colors were mapped
              if (colorsUpdated) {
                const updateResponse = await fetch(
                  `https://${store.shopifyDomain}/admin/api/2023-10/themes/${activeTheme.id}/assets.json`,
                  {
                    method: 'PUT',
                    headers: {
                      'X-Shopify-Access-Token': store.shopifyAccessToken!,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      asset: {
                        key: 'config/settings_data.json',
                        value: JSON.stringify(settings)
                      }
                    })
                  }
                );

                if (updateResponse.ok) {
                  console.log('Successfully updated theme settings with colors:', colorPalette);
                  colorUpdateSuccess = true;
                } else {
                  console.warn('Theme settings update failed:', updateResponse.status, updateResponse.statusText);
                }
              }
            }
          } catch (settingsError) {
            console.warn('Theme settings update failed:', settingsError.message);
          }

          // Method 2: Inject custom CSS (works with existing permissions)
          if (!colorUpdateSuccess) {
            try {
              console.log('Falling back to CSS injection method');
              console.log('Will create CSS with colors:', colorPalette);
              
              const customCSS = `/* StoreScore AI Color Optimization - Applied ${new Date().toLocaleString()} */
:root {
  --storescore-primary: ${colorPalette.primary} !important;
  --storescore-secondary: ${colorPalette.secondary} !important;
  --storescore-background: ${colorPalette.background} !important;
  --storescore-text: ${colorPalette.text} !important;
  --storescore-accent: ${colorPalette.accent} !important;
}

/* DEBUG: Test if CSS is loading */
body::before {
  content: "StoreScore CSS Active";
  position: fixed;
  top: 0;
  right: 0;
  background: #4CAF50;
  color: white;
  padding: 5px 10px;
  font-size: 12px;
  z-index: 9999;
}

/* Test border for immediate visibility */
body {
  border-top: 5px solid ${colorPalette.primary} !important;
}

/* Apply optimized colors to common Shopify elements */
.site-header, .header, .page-header,
.shopify-section-header, .top-bar,
[class*="header"], header, nav, .navigation { 
  background-color: ${colorPalette.primary} !important; 
  background: ${colorPalette.primary} !important;
  color: white !important;
}

button, .btn, .button, 
input[type="submit"], input[type="button"],
.btn-primary, [class*="button"], [class*="btn"],
.product-form__cart-submit, .cart__submit,
.shopify-payment-button__button, .add-to-cart { 
  background-color: ${colorPalette.accent} !important; 
  background: ${colorPalette.accent} !important;
  border-color: ${colorPalette.accent} !important;
  color: white !important;
}

.btn:hover, .button:hover { 
  background-color: var(--storescore-primary) !important; 
}

.price, .product__price, .product-price,
[class*="price"], .money, .currency,
.product-form__price, span[class*="price"] { 
  color: ${colorPalette.primary} !important; 
  font-weight: 700 !important;
  font-size: 1.1em !important;
}

.product-form__buttons .btn,
.product__add-to-cart { 
  background-color: var(--storescore-accent) !important; 
  color: white !important;
}

/* Navigation and links */
.site-nav__link, .nav-link,
[class*="navigation"] a { 
  color: var(--storescore-text) !important; 
}

/* Secondary elements */
.badge, .label, .tag,
[class*="badge"] { 
  background-color: var(--storescore-secondary) !important; 
  color: white !important;
}`;

              const cssUpdateResponse = await fetch(
                `https://${store.shopifyDomain}/admin/api/2023-10/themes/${activeTheme.id}/assets.json`,
                {
                  method: 'PUT',
                  headers: {
                    'X-Shopify-Access-Token': store.shopifyAccessToken!,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    asset: {
                      key: 'assets/storescore-colors.css',
                      value: customCSS
                    }
                  })
                }
              );

              if (cssUpdateResponse.ok) {
                console.log('Successfully injected custom CSS for color optimization');
                console.log('CSS file created: assets/storescore-colors.css');
                console.log('Colors applied:', colorPalette);
                colorUpdateSuccess = true;
                
                // Also try to add the CSS link to theme.liquid
                try {
                  const themeResponse = await fetch(
                    `https://${store.shopifyDomain}/admin/api/2023-10/themes/${activeTheme.id}/assets.json?asset[key]=layout/theme.liquid`,
                    {
                      headers: {
                        'X-Shopify-Access-Token': store.shopifyAccessToken!,
                        'Content-Type': 'application/json',
                      },
                    }
                  );
                  
                  if (themeResponse.ok) {
                    const themeData = await themeResponse.json();
                    let themeContent = themeData.asset.value;
                    
                    // Check if our CSS is already linked
                    if (!themeContent.includes('storescore-colors.css')) {
                      // Add before closing </head>
                      themeContent = themeContent.replace(
                        '</head>',
                        '  {{ "storescore-colors.css" | asset_url | stylesheet_tag }}\n</head>'
                      );
                      
                      // Update theme.liquid
                      const updateThemeResponse = await fetch(
                        `https://${store.shopifyDomain}/admin/api/2023-10/themes/${activeTheme.id}/assets.json`,
                        {
                          method: 'PUT',
                          headers: {
                            'X-Shopify-Access-Token': store.shopifyAccessToken!,
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            asset: {
                              key: 'layout/theme.liquid',
                              value: themeContent
                            }
                          })
                        }
                      );
                      
                      if (updateThemeResponse.ok) {
                        console.log('Successfully linked CSS to theme.liquid');
                      }
                    }
                  }
                } catch (linkError) {
                  console.warn('Could not link CSS to theme.liquid:', linkError.message);
                }
              }
            } catch (cssError) {
              console.error('CSS injection failed:', cssError.message);
              throw new Error('Failed to apply color changes - store may need theme permissions');
            }
          }

          if (!colorUpdateSuccess) {
            throw new Error('Could not apply color changes to store theme');
          }
        }

        console.log(`Successfully applied design changes to Shopify store: ${store.shopifyDomain}`);
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
          `scope=read_products,write_products,read_themes,write_themes&` +
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
      
      // Redirect to dashboard with success message
      res.redirect(`/dashboard/stores?connected=true&shop=${encodeURIComponent(shopInfo.name)}`);
    } catch (error) {
      console.error("Error in Shopify OAuth callback:", error);
      res.redirect('/dashboard/stores?error=connection_failed');
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

      res.json({ 
        success: true, 
        message: "Trust optimization has been applied",
        suggestion: changes.recommended
      });
    } catch (error) {
      console.error("Error applying trust recommendation:", error);
      res.status(500).json({ error: "Failed to apply trust recommendation" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}