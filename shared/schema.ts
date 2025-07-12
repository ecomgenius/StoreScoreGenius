import { pgTable, text, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const storeAnalyses = pgTable("store_analyses", {
  id: serial("id").primaryKey(),
  storeUrl: text("store_url"),
  ebayUsername: text("ebay_username"),
  storeType: text("store_type").notNull(), // 'shopify' or 'ebay'
  overallScore: integer("overall_score").notNull(),
  designScore: integer("design_score").notNull(),
  catalogScore: integer("catalog_score").notNull(),
  trustScore: integer("trust_score").notNull(),
  performanceScore: integer("performance_score").notNull(),
  suggestions: jsonb("suggestions").notNull(),
  analysisData: jsonb("analysis_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStoreAnalysisSchema = createInsertSchema(storeAnalyses).pick({
  storeUrl: true,
  ebayUsername: true,
  storeType: true,
});

export const analyzeStoreRequestSchema = z.object({
  storeUrl: z.string().url().optional(),
  ebayUsername: z.string().min(1).optional(),
  storeType: z.enum(['shopify', 'ebay']),
}).refine(
  (data) => {
    if (data.storeType === 'shopify' && !data.storeUrl) return false;
    if (data.storeType === 'ebay' && !data.ebayUsername) return false;
    return true;
  },
  {
    message: "Store URL is required for Shopify stores, eBay username is required for eBay stores",
  }
);

export type InsertStoreAnalysis = z.infer<typeof insertStoreAnalysisSchema>;
export type StoreAnalysis = typeof storeAnalyses.$inferSelect;
export type AnalyzeStoreRequest = z.infer<typeof analyzeStoreRequestSchema>;

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
