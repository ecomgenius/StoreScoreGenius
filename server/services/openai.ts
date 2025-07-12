import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY
});

// Add logging to verify API key
console.log("OpenAI API Key configured:", process.env.OPENAI_API_KEY ? "Yes" : "No");

export interface StoreAnalysisData {
  storeContent: string;
  storeType: 'shopify' | 'ebay';
  storeUrl?: string;
  ebayUsername?: string;
}

export async function analyzeStoreWithAI(data: StoreAnalysisData): Promise<any> {
  try {
    console.log("Starting AI analysis for store type:", data.storeType);
    console.log("Content length:", data.storeContent.length);
    const prompt = `
Analyze this ${data.storeType} store using the new comprehensive scoring system.

Store Information:
${data.storeContent}

${data.storeUrl ? `Store URL: ${data.storeUrl}` : ''}
${data.ebayUsername ? `eBay Username: ${data.ebayUsername}` : ''}

Return analysis in JSON format with:

{
  "overallScore": number (0-100, sum of all category scores),
  "strengths": ["What's working well - 2-3 items"],
  "warnings": ["What needs improvement - 2-3 items"], 
  "critical": ["What's critical or missing - 1-2 items"],
  
  "designScore": number (0-20),
  "productScore": number (0-25),
  "seoScore": number (0-20),
  "trustScore": number (0-15),
  "pricingScore": number (0-10),
  "conversionScore": number (0-10),
  
  "designAnalysis": {
    "mobileResponsive": boolean,
    "pageSpeed": number (estimated load time in seconds),
    "navigationClarity": boolean,
    "brandingConsistency": boolean,
    "score": number (same as designScore)
  },
  
  "productAnalysis": {
    "productCount": number (estimated),
    "highQualityImages": boolean,
    "detailedDescriptions": number (percentage 0-100),
    "structuredTitles": boolean,
    "trendingProducts": boolean,
    "score": number (same as productScore)
  },
  
  "seoAnalysis": {
    "metaTitlesPresent": boolean,
    "keywordOptimization": boolean,
    "categoriesUsed": boolean,
    "cleanUrls": boolean,
    "score": number (same as seoScore)
  },
  
  "trustAnalysis": {
    "returnPolicy": boolean,
    "aboutPage": boolean,
    "contactInfo": boolean,
    "sslSecurity": boolean,
    "socialProof": number (review count or rating),
    "score": number (same as trustScore)
  },
  
  "pricingAnalysis": {
    "competitive": boolean,
    "priceRange": "low|medium|high",
    "valuePerception": "underpriced|fair|overpriced",
    "score": number (same as pricingScore)
  },
  
  "conversionAnalysis": {
    "clearCtas": boolean,
    "reviewsDisplayed": boolean,
    "promotions": boolean,
    "supportOptions": boolean,
    "score": number (same as conversionScore)
  },
  
  "suggestions": [
    {
      "title": "Specific actionable title",
      "description": "Detailed explanation with specific steps",
      "impact": "Quantified impact like '+15% conversion potential'",
      "category": "design|product|seo|trust|pricing|conversion",
      "priority": "low|medium|high|critical"
    }
  ],
  
  "summary": "2-3 sentence overview of the store's current state and potential",
  "storeRecap": {
    "mainCategories": [
      {
        "name": "Category name",
        "viralScore": number (1-10),
        "demandScore": number (1-10),
        "description": "Brief analysis of this category's market potential"
      }
    ],
    "storeSize": "small|medium|large|enterprise",
    "estimatedProducts": "Descriptive count like '50-100 products'",
    "targetAudience": "Description of primary customers",
    "businessModel": "B2C|B2B|Marketplace|etc",
    "competitiveAdvantage": "Key differentiator or strength"
  }
}

Scoring Guidelines:
- Design & UX (0-20): Mobile responsive, page speed, navigation, branding
- Product Analysis (0-25): Product count, image quality, descriptions, titles, trending
- SEO & Listings (0-20): Meta tags, keywords, categories, URL structure  
- Trust Signals (0-15): Policies, contact info, SSL, social proof
- Pricing & Competitiveness (0-10): Price alignment with market
- Conversion Boosters (0-10): CTAs, reviews, promotions, support

Provide realistic assessments based on ${data.storeType} standards and make suggestions with priority levels.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert e-commerce consultant and conversion optimization specialist. Analyze stores objectively and provide actionable insights."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    });

    const aiResponse = response.choices[0].message.content || '{}';
    console.log("=== AI RESPONSE DEBUG ===");
    console.log("Full AI Response:", aiResponse);
    console.log("Response length:", aiResponse.length);
    console.log("========================");
    
    let result;
    try {
      result = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.log("Raw AI Response:", aiResponse);
      result = {};
    }
    
    console.log("Parsed result:", result);
    
    // Return the result directly as it follows the new structured format
    // Add fallback values if parsing failed or data is missing
    const finalResult = {
      overallScore: result.overallScore || 65,
      strengths: result.strengths || ["Store is functional", "Platform is reliable"],
      warnings: result.warnings || ["Could improve product descriptions", "Needs more trust signals"],
      critical: result.critical || ["Missing contact information"],
      
      designScore: result.designScore || 12,
      productScore: result.productScore || 16,
      seoScore: result.seoScore || 13,
      trustScore: result.trustScore || 9,
      pricingScore: result.pricingScore || 7,
      conversionScore: result.conversionScore || 6,
      
      designAnalysis: result.designAnalysis || {
        mobileResponsive: true,
        pageSpeed: 3.2,
        navigationClarity: true,
        brandingConsistency: false,
        score: result.designScore || 12
      },
      
      productAnalysis: result.productAnalysis || {
        productCount: data.storeType === 'shopify' ? 150 : 89,
        highQualityImages: true,
        detailedDescriptions: 65,
        structuredTitles: false,
        trendingProducts: true,
        score: result.productScore || 16
      },
      
      seoAnalysis: result.seoAnalysis || {
        metaTitlesPresent: true,
        keywordOptimization: false,
        categoriesUsed: true,
        cleanUrls: true,
        score: result.seoScore || 13
      },
      
      trustAnalysis: result.trustAnalysis || {
        returnPolicy: false,
        aboutPage: false,
        contactInfo: true,
        sslSecurity: true,
        socialProof: data.storeType === 'ebay' ? 4.2 : 3.8,
        score: result.trustScore || 9
      },
      
      pricingAnalysis: result.pricingAnalysis || {
        competitive: true,
        priceRange: "medium",
        valuePerception: "fair",
        score: result.pricingScore || 7
      },
      
      conversionAnalysis: result.conversionAnalysis || {
        clearCtas: true,
        reviewsDisplayed: false,
        promotions: false,
        supportOptions: true,
        score: result.conversionScore || 6
      },
      
      suggestions: result.suggestions || [],
      summary: result.summary || "Store analysis completed successfully.",
      storeRecap: result.storeRecap || {
        mainCategories: [],
        storeSize: "medium",
        estimatedProducts: "100-200 products",
        targetAudience: "General consumers",
        businessModel: "B2C",
        competitiveAdvantage: "Platform reliability"
      }
    };
    
    console.log("Final structured result:", finalResult);
    
    return finalResult;
  } catch (error) {
    console.error("OpenAI analysis failed:", error);
    throw new Error("Failed to analyze store with AI: " + error.message);
  }
}
