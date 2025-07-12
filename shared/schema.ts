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
  overallScore: number;
  designScore: number;
  catalogScore: number;
  trustScore: number;
  performanceScore: number;
  suggestions: Array<{
    title: string;
    description: string;
    impact: string;
    category: 'design' | 'catalog' | 'trust' | 'performance';
  }>;
  summary: string;
}
