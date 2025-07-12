import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeStoreRequestSchema } from "@shared/schema";
import { analyzeShopifyStore, analyzeEbayStore } from "./services/storeAnalyzer";

export async function registerRoutes(app: Express): Promise<Server> {
  // Analyze store endpoint
  app.post("/api/analyze-store", async (req, res) => {
    try {
      const requestData = analyzeStoreRequestSchema.parse(req.body);
      
      let analysisResult;
      
      if (requestData.storeType === 'shopify' && requestData.storeUrl) {
        analysisResult = await analyzeShopifyStore(requestData.storeUrl);
      } else if (requestData.storeType === 'ebay' && requestData.ebayUsername) {
        analysisResult = await analyzeEbayStore(requestData.ebayUsername);
      } else {
        return res.status(400).json({ 
          message: "Invalid request: Store URL required for Shopify, username required for eBay" 
        });
      }

      // Store the analysis result
      const storeAnalysis = await storage.createStoreAnalysis({
        storeUrl: requestData.storeUrl || null,
        ebayUsername: requestData.ebayUsername || null,
        storeType: requestData.storeType,
        overallScore: analysisResult.overallScore,
        designScore: analysisResult.designScore,
        catalogScore: analysisResult.catalogScore,
        trustScore: analysisResult.trustScore,
        performanceScore: analysisResult.performanceScore,
        suggestions: analysisResult.suggestions,
        analysisData: {
          summary: analysisResult.summary
        }
      });

      res.json({
        id: storeAnalysis.id,
        ...analysisResult
      });
    } catch (error: any) {
      console.error("Store analysis error:", error);
      res.status(500).json({ 
        message: error.message || "Failed to analyze store" 
      });
    }
  });

  // Get analysis by ID
  app.get("/api/analysis/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const analysis = await storage.getStoreAnalysis(id);
      
      if (!analysis) {
        return res.status(404).json({ message: "Analysis not found" });
      }
      
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve analysis" });
    }
  });

  // Get recent analyses
  app.get("/api/recent-analyses", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const analyses = await storage.getRecentAnalyses(limit);
      res.json(analyses);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve recent analyses" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
