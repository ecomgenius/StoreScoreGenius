import express, { type Request, type Response, type Express } from "express";
import { createServer, type Server } from "http";
import cookieParser from "cookie-parser";
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
  createShopifyAnalysisContent 
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
  app.get("/api/analysis/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const analysis = await storage.getStoreAnalysis(id);
      
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      // Check if user owns this analysis or if it's a guest analysis
      if (analysis.userId && (!req.user || analysis.userId !== req.user.id)) {
        return res.status(404).json({ error: "Analysis not found" });
      }
      
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
      
      // Generate OAuth URL for SaaS application
      const { authUrl, state } = generateShopifyAuthUrl(domain, req.user!.id);
      
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
        apiKey: SHOPIFY_API_KEY,
        apiSecret: SHOPIFY_API_SECRET ? 'Set' : 'Missing'
      });
      
      res.json({ authUrl: finalAuthUrl });
    } catch (error) {
      console.error("Error initiating Shopify OAuth:", error);
      const currentRedirectUri = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/shopify/callback`
        : 'http://localhost:5000/api/shopify/callback';
        
      res.status(500).json({ 
        error: "Failed to initiate Shopify connection",
        details: `This might be due to incorrect Shopify Partner App configuration. Please ensure:
1. SHOPIFY_API_KEY and SHOPIFY_API_SECRET are from a Partner App with OAuth enabled
2. Add this exact redirect URI to your Partner App settings: ${currentRedirectUri}`
      });
    }
  });
  
  // Shopify OAuth callback
  app.get("/api/shopify/callback", async (req: Request, res: Response) => {
    try {
      console.log('Debug - Shopify callback received:', req.query);
      const { code, state, shop } = req.query;
      
      if (!code || !state || !shop) {
        console.log('Debug - Missing parameters:', { code: !!code, state: !!state, shop: !!shop });
        return res.status(400).send("Missing required parameters");
      }
      
      // Parse state to get userId and optionally userStoreId
      const stateParts = (state as string).split(':');
      const userId = stateParts.length >= 3 ? parseInt(stateParts[2]) : parseInt(stateParts[1]);
      const userStoreId = stateParts.length >= 4 ? parseInt(stateParts[3]) : null;
      
      if (!userId || isNaN(userId)) {
        console.log('Debug - State parsing:', { state, stateParts, userId, userStoreId });
        return res.status(400).send("Invalid state parameter");
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
      
      if (userStoreId) {
        // Update existing store
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
        // Create new store
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
      
      // Update store last analyzed timestamp
      await storage.updateUserStore(store.id, { lastAnalyzedAt: new Date() });
      
      res.json(storedAnalysis);
    } catch (error) {
      console.error("Error analyzing Shopify store:", error);
      res.status(500).json({ error: "Failed to analyze store" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}