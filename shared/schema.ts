import { pgTable, text, serial, integer, jsonb, timestamp, boolean, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  aiCredits: integer("ai_credits").default(25).notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  subscriptionStatus: text("subscription_status").$type<'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'unpaid' | 'none'>().default('none').notNull(),
  trialEndsAt: timestamp("trial_ends_at"),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    emailIdx: index("email_idx").on(table.email),
    stripeCustomerIdx: index("stripe_customer_idx").on(table.stripeCustomerId),
  };
});

// User stores table
export const userStores = pgTable("user_stores", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  storeUrl: text("store_url"),
  storeType: text("store_type").$type<'shopify' | 'ebay'>().notNull(),
  ebayUsername: text("ebay_username"),
  shopifyAccessToken: text("shopify_access_token"),
  shopifyDomain: text("shopify_domain"),
  shopifyScope: text("shopify_scope"),
  isConnected: boolean("is_connected").default(false).notNull(),
  connectionStatus: text("connection_status").$type<'pending' | 'connected' | 'error' | 'disconnected'>().default('disconnected'),
  lastSyncAt: timestamp("last_sync_at"),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  lastAnalysisScore: integer("last_analysis_score"),
  aiRecommendationsCount: integer("ai_recommendations_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index("user_stores_user_id_idx").on(table.userId),
  };
});

// Store analyses table (updated with user reference)
export const storeAnalyses = pgTable("store_analyses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  userStoreId: integer("user_store_id").references(() => userStores.id),
  storeUrl: text("store_url"),
  storeType: text("store_type").$type<'shopify' | 'ebay'>().notNull(),
  ebayUsername: text("ebay_username"),
  overallScore: integer("overall_score").notNull(),
  strengths: jsonb("strengths").$type<string[]>().notNull(),
  warnings: jsonb("warnings").$type<string[]>().notNull(),
  critical: jsonb("critical").$type<string[]>().notNull(),
  designScore: integer("design_score").notNull(),
  productScore: integer("product_score").notNull(),
  seoScore: integer("seo_score").notNull(),
  trustScore: integer("trust_score").notNull(),
  pricingScore: integer("pricing_score").notNull(),
  conversionScore: integer("conversion_score").notNull(),
  analysisData: jsonb("analysis_data").$type<any>().notNull(),
  suggestions: jsonb("suggestions").$type<Array<{
    title: string;
    description: string;
    impact: string;
    category: string;
    priority: string;
  }>>().notNull(),
  summary: text("summary").notNull(),
  storeRecap: jsonb("store_recap").$type<any>().notNull(),
  creditsUsed: integer("credits_used").default(1).notNull(),
  contentHash: text("content_hash"), // Hash of store content for change detection
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index("store_analyses_user_id_idx").on(table.userId),
    userStoreIdIdx: index("store_analyses_user_store_id_idx").on(table.userStoreId),
  };
});

// Credit transactions table
export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  type: text("type").$type<'purchase' | 'usage' | 'refund' | 'bonus'>().notNull(),
  amount: integer("amount").notNull(), // positive for purchase/bonus, negative for usage
  description: text("description").notNull(),
  stripePaymentId: text("stripe_payment_id"),
  relatedAnalysisId: integer("related_analysis_id").references(() => storeAnalyses.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index("credit_transactions_user_id_idx").on(table.userId),
  };
});

// Subscription plans table
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  stripePriceId: text("stripe_price_id").unique().notNull(),
  stripeProductId: text("stripe_product_id").notNull(),
  price: integer("price").notNull(), // in cents
  currency: text("currency").default('usd').notNull(),
  interval: text("interval").$type<'month' | 'year'>().default('month').notNull(),
  aiCreditsIncluded: integer("ai_credits_included").default(0).notNull(),
  maxStores: integer("max_stores").default(1).notNull(),
  features: jsonb("features").$type<string[]>().default([]).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  trialDays: integer("trial_days").default(7).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    stripePriceIdIdx: index("subscription_plans_stripe_price_id_idx").on(table.stripePriceId),
  };
});

// User subscriptions table
export const userSubscriptions = pgTable("user_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  planId: integer("plan_id").references(() => subscriptionPlans.id).notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").unique().notNull(),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  status: text("status").$type<'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'unpaid'>().notNull(),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  canceledAt: timestamp("canceled_at"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index("user_subscriptions_user_id_idx").on(table.userId),
    stripeSubscriptionIdIdx: index("user_subscriptions_stripe_subscription_id_idx").on(table.stripeSubscriptionId),
  };
});



// User sessions table
export const userSessions = pgTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index("user_sessions_user_id_idx").on(table.userId),
    expiresAtIdx: index("user_sessions_expires_at_idx").on(table.expiresAt),
  };
});

// Product optimizations table - tracks AI optimizations applied to products
export const productOptimizations = pgTable("product_optimizations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  userStoreId: integer("user_store_id").references(() => userStores.id).notNull(),
  shopifyProductId: text("shopify_product_id").notNull(),
  optimizationType: text("optimization_type").$type<'title' | 'description' | 'pricing' | 'keywords'>().notNull(),
  originalValue: text("original_value"),
  optimizedValue: text("optimized_value").notNull(),
  creditsUsed: integer("credits_used").default(1).notNull(),
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
}, (table) => {
  return {
    userStoreProductIdx: index("product_optimizations_user_store_product_idx").on(table.userStoreId, table.shopifyProductId),
    userIdIdx: index("product_optimizations_user_id_idx").on(table.userId),
  };
});

// Schema validation
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
});

export const insertUserStoreSchema = createInsertSchema(userStores).pick({
  userId: true,
  name: true,
  storeUrl: true,
  storeType: true,
  ebayUsername: true,
});

export const insertStoreAnalysisSchema = createInsertSchema(storeAnalyses).pick({
  userId: true,
  userStoreId: true,
  storeUrl: true,
  storeType: true,
  ebayUsername: true,
  overallScore: true,
  strengths: true,
  warnings: true,
  critical: true,
  designScore: true,
  productScore: true,
  seoScore: true,
  trustScore: true,
  pricingScore: true,
  conversionScore: true,
  analysisData: true,
  suggestions: true,
  summary: true,
  storeRecap: true,
  creditsUsed: true,
});

export const analyzeStoreRequestSchema = z.object({
  storeUrl: z.string().optional(),
  storeType: z.enum(['shopify', 'ebay']),
  ebayUsername: z.string().optional(),
  userStoreId: z.number().optional(),
}).refine((data) => {
  if (data.storeType === 'shopify' && !data.storeUrl) {
    return false;
  }
  if (data.storeType === 'ebay' && !data.ebayUsername) {
    return false;
  }
  return true;
}, {
  message: "storeUrl is required for Shopify stores, ebayUsername is required for eBay stores"
});

export const registerUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export const loginUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createUserStoreSchema = z.object({
  name: z.string().min(1),
  storeUrl: z.string().optional(),
  storeType: z.enum(['shopify', 'ebay']),
  ebayUsername: z.string().optional(),
}).refine((data) => {
  if (data.storeType === 'shopify' && !data.storeUrl) {
    return false;
  }
  if (data.storeType === 'ebay' && !data.ebayUsername) {
    return false;
  }
  return true;
}, {
  message: "storeUrl is required for Shopify stores, ebayUsername is required for eBay stores"
});

export const createSubscriptionSchema = z.object({
  planId: z.number(),
  paymentMethodId: z.string(),
});

export const updateSubscriptionSchema = z.object({
  planId: z.number().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});

export const updatePaymentMethodSchema = z.object({
  paymentMethodId: z.string(),
});

// Trial subscription schema
export const createTrialSubscriptionSchema = z.object({
  paymentMethodId: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

// Type exports
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertUserStore = z.infer<typeof insertUserStoreSchema>;
export type InsertStoreAnalysis = z.infer<typeof insertStoreAnalysisSchema>;
export type StoreAnalysis = typeof storeAnalyses.$inferSelect;
export type User = typeof users.$inferSelect;
export type UserStore = typeof userStores.$inferSelect;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;
export type ProductOptimization = typeof productOptimizations.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type AnalyzeStoreRequest = z.infer<typeof analyzeStoreRequestSchema>;
export type RegisterUserRequest = z.infer<typeof registerUserSchema>;
export type LoginUserRequest = z.infer<typeof loginUserSchema>;
export type CreateUserStoreRequest = z.infer<typeof createUserStoreSchema>;
export type CreateSubscriptionRequest = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionRequest = z.infer<typeof updateSubscriptionSchema>;
export type UpdatePaymentMethodRequest = z.infer<typeof updatePaymentMethodSchema>;

export interface StoreAnalysisResult {
  // Overall scoring section
  overallScore: number; // 0-100
  strengths: string[];
  warnings: string[];
  critical: string[];
  
  // Detailed category scores
  designScore: number; // 0-20 points
  productScore: number; // 0-25 points  
  seoScore: number; // 0-20 points
  trustScore: number; // 0-15 points
  pricingScore: number; // 0-10 points
  conversionScore: number; // 0-10 points
  
  // Detailed analysis per category
  designAnalysis: {
    mobileResponsive: boolean;
    pageSpeed: number; // seconds
    navigationClarity: boolean;
    brandingConsistency: boolean;
    score: number;
  };
  
  productAnalysis: {
    productCount: number;
    highQualityImages: boolean;
    detailedDescriptions: number; // percentage
    structuredTitles: boolean;
    trendingProducts: boolean;
    score: number;
  };
  
  seoAnalysis: {
    metaTitlesPresent: boolean;
    keywordOptimization: boolean;
    categoriesUsed: boolean;
    cleanUrls: boolean;
    score: number;
  };
  
  trustAnalysis: {
    returnPolicy: boolean;
    aboutPage: boolean;
    contactInfo: boolean;
    sslSecurity: boolean;
    socialProof: number; // review count or rating
    score: number;
  };
  
  pricingAnalysis: {
    competitive: boolean;
    priceRange: 'low' | 'medium' | 'high';
    valuePerception: 'underpriced' | 'fair' | 'overpriced';
    score: number;
  };
  
  conversionAnalysis: {
    clearCtas: boolean;
    reviewsDisplayed: boolean;
    promotions: boolean;
    supportOptions: boolean;
    score: number;
  };
  
  // AI-generated suggestions
  suggestions: Array<{
    title: string;
    description: string;
    impact: string;
    category: 'design' | 'product' | 'seo' | 'trust' | 'pricing' | 'conversion';
    priority: 'low' | 'medium' | 'high' | 'critical';
  }>;
  
  summary: string;
  screenshot?: string; // Base64 encoded screenshot
  
  // Store intelligence recap
  storeRecap: {
    mainCategories: Array<{
      name: string;
      viralScore: number; // 1-10 scale
      demandScore: number; // 1-10 scale
      description: string;
    }>;
    storeSize: 'small' | 'medium' | 'large' | 'enterprise';
    estimatedProducts: string;
    targetAudience: string;
    businessModel: string;
    competitiveAdvantage: string;
  };
}