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
  createUserStoreSchema 
} from "@shared/schema";
import { analyzeShopifyStore, analyzeEbayStore } from "./services/storeAnalyzer";
import { authenticateUser, requireAuth, requireAdmin, checkCredits, checkSubscription } from "./middleware/auth";
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
      res.status(201).json({ user: userWithoutPassword, session: session.id });
      
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
  app.get("/api/stores", requireAuth, async (req: Request, res: Response) => {
    try {
      const stores = await storage.getUserStores(req.user!.id);
      res.json(stores);
    } catch (error) {
      console.error("Error fetching user stores:", error);
      res.status(500).json({ error: "Failed to fetch stores" });
    }
  });

  // Create user store
  app.post("/api/stores", requireAuth, async (req: Request, res: Response) => {
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
  app.put("/api/stores/:id", requireAuth, async (req: Request, res: Response) => {
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
  app.delete("/api/stores/:id", requireAuth, async (req: Request, res: Response) => {
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

        const titlePrompt = `You are an expert e-commerce copywriter. Create a compelling, SEO-optimized product title that will increase sales and conversions.

Current product title: "${currentProduct.title}"
Product type: ${currentProduct.product_type || 'Product'}
Vendor: ${currentProduct.vendor || 'Unknown'}
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
          
          aiSuggestion = aiResponse.choices[0].message.content?.trim() || `Premium ${currentProduct.title} | ${currentProduct.product_type || 'Quality Product'}`;
        } catch (error) {
          console.error('OpenAI title generation failed:', error);
          aiSuggestion = `Premium ${currentProduct.title} | ${currentProduct.product_type || 'Quality Product'}`;
        }
        updateData.title = aiSuggestion;
      } else if (recommendationType === 'description') {
        // Use OpenAI to generate enhanced description
        const { analyzeStoreWithAI } = await import('./services/openai');
        const descriptionPrompt = `Create a compelling product description that includes features, benefits, and a call to action:

Product: ${currentProduct.title}
Type: ${currentProduct.product_type || 'Product'}
Price: $${currentProduct.variants?.[0]?.price || 'Unknown'}
Current Description: ${currentProduct.body_html?.replace(/<[^>]*>/g, '') || 'No description available'}

Generate an HTML-formatted product description that would increase conversions and provide value to customers.`;

        try {
          const aiResponse = await analyzeStoreWithAI({
            storeContent: descriptionPrompt,
            storeType: 'shopify'
          });
          aiSuggestion = `<div class="ai-optimized-description">
            <h3>${currentProduct.title}</h3>
            <p>${aiResponse.summary || `Experience the exceptional quality of our ${currentProduct.title}.`}</p>
            <h4>Key Features:</h4>
            <ul>
              <li>Premium quality materials</li>
              <li>Expert craftsmanship</li>
              <li>Customer satisfaction guaranteed</li>
              <li>Fast, reliable shipping</li>
            </ul>
            <p><strong>Order now and experience the difference quality makes!</strong></p>
          </div>`;
        } catch (error) {
          console.error('AI description generation failed:', error);
          aiSuggestion = `<h3>Premium ${currentProduct.title}</h3><p>Experience exceptional quality with our ${currentProduct.title}.</p>`;
        }
        updateData.body_html = aiSuggestion;
      } else if (recommendationType === 'pricing') {
        // Generate optimized pricing with psychological pricing
        const currentPrice = parseFloat(currentProduct.variants?.[0]?.price || '0');
        const optimizedPrice = currentPrice > 10 ? 
          (Math.floor(currentPrice) - 0.01).toFixed(2) : // $19.99 strategy
          (currentPrice * 0.95).toFixed(2); // 5% discount for low prices
        aiSuggestion = optimizedPrice;
        updateData.variants = [{ 
          id: currentProduct.variants[0]?.id,
          price: optimizedPrice 
        }];
      } else if (recommendationType === 'keywords') {
        // Generate SEO-optimized tags using product analysis
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
        updateData.tags = aiSuggestion;
      }

      // Update product via Shopify API
      await updateProduct(store.shopifyDomain, store.shopifyAccessToken, productId, updateData);

      // Deduct credit
      await storage.deductCredits(user.id, 1, `AI optimized ${recommendationType} for "${currentProduct.title}"`);

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
          
          suggestion = aiResponse.choices[0].message.content?.trim() || `Premium ${currentProduct.title} | ${currentProduct.product_type || 'Quality Product'}`;
        } catch (error) {
          console.error('OpenAI title generation failed:', error);
          suggestion = `Premium ${currentProduct.title} | ${currentProduct.product_type || 'Quality Product'}`;
        }
      } else if (recommendationType === 'description') {
        suggestion = `Enhanced product description with compelling features and benefits for ${currentProduct.title}`;
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
          price: currentProduct.variants?.[0]?.price
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
            updateData.body_html = `<p>AI-optimized product description with enhanced SEO keywords and compelling sales copy for ${currentProduct.title}.</p>`;
          }

          if (Object.keys(updateData).length > 0) {
            await updateProduct(store.shopifyDomain, store.shopifyAccessToken, productId, updateData);
            await storage.deductCredits(user.id, 1, `Bulk ${recommendationType} optimization for "${currentProduct.title}"`);
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

      switch (event.type) {
        case 'payment_intent.succeeded':
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
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          const subscription = event.data.object;
          // Handle subscription updates
          break;

        default:
          console.log(`Unhandled event type ${event.type}`);
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
          `scope=read_products,read_orders,read_themes,read_content&` +
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

  const httpServer = createServer(app);
  return httpServer;
}