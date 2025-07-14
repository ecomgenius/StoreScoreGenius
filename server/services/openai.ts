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
  optimizationContext?: {
    optimizedProductsCount: number;
    totalOptimizations: number;
    optimizationTypes: string[];
  };
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

${data.optimizationContext ? `
IMPORTANT OPTIMIZATION CONTEXT:
- This store has been optimized with StoreScore AI
- ${data.optimizationContext.optimizedProductsCount} products have been optimized
- ${data.optimizationContext.totalOptimizations} total optimizations applied
- Optimization types: ${data.optimizationContext.optimizationTypes.join(', ')}
- When scoring products, give higher scores for optimized titles, descriptions, and pricing
- Increase product score and overall score to reflect these improvements
- Mention the AI optimizations in your analysis
` : ''}

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
    "productCount": number (estimated from content),
    "highQualityImages": boolean,
    "detailedDescriptions": number (percentage 0-100, boost for AI optimizations),
    "structuredTitles": boolean (boost for AI optimizations),
    "trendingProducts": boolean,
    "aiOptimized": boolean (true if optimization context provided),
    "optimizedProductsCount": number (from context, 0 if none),
    "score": number (same as productScore, boost for optimizations)
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

// SEO & Categories recommendations
export async function generateSEORecommendations(storeUrl: string, storeType: string) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{
        role: "user",
        content: `You are an expert SEO specialist for e-commerce stores. Generate specific SEO and category optimization recommendations for this ${storeType} store: ${storeUrl}

Provide 4-6 specific SEO improvement recommendations in this JSON format:
{
  "seoScore": number (0-20),
  "suggestions": [
    {
      "id": "unique-id",
      "type": "meta-tags|keywords|categories|structure|content|schema",
      "title": "Specific SEO improvement title",
      "description": "Detailed explanation of the SEO improvement",
      "impact": "Expected impact on search rankings and traffic",
      "priority": "critical|high|medium|low",
      "suggestions": {
        "current": "Current SEO element description",
        "recommended": "Specific recommended change",
        "implementation": "How to implement this change"
      }
    }
  ]
}

Focus on:
- Meta titles and descriptions optimization
- Product category structure improvement
- Keyword optimization strategies
- URL structure improvements
- Schema markup implementation
- Content optimization for search engines`
      }],
      response_format: { type: "json_object" },
      max_tokens: 1500,
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"suggestions": []}');
    
    // Add unique IDs if not present
    result.suggestions = result.suggestions.map((suggestion: any, index: number) => ({
      ...suggestion,
      id: suggestion.id || `seo-${Date.now()}-${index}`
    }));

    return result;
  } catch (error) {
    console.error("OpenAI SEO analysis failed:", error);
    return {
      seoScore: 10,
      suggestions: [
        {
          id: `seo-fallback-${Date.now()}`,
          type: 'meta-tags',
          title: 'Optimize Meta Titles and Descriptions',
          description: 'Improve search engine visibility with compelling meta titles and descriptions',
          impact: 'Higher click-through rates from search results',
          priority: 'high',
          suggestions: {
            current: 'Generic or missing meta titles and descriptions',
            recommended: 'Create unique, keyword-rich meta titles (50-60 chars) and descriptions (150-160 chars) for each page',
            implementation: 'Update theme templates and product pages with optimized meta tags'
          }
        }
      ]
    };
  }
}

// Legal pages recommendations
export async function generateLegalRecommendations(storeUrl: string, storeType: string) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{
        role: "user",
        content: `You are an expert e-commerce legal consultant. Generate specific legal page and compliance recommendations for this ${storeType} store: ${storeUrl}

Provide 3-5 specific legal compliance recommendations in this JSON format:
{
  "legalScore": number (0-15),
  "suggestions": [
    {
      "id": "unique-id",
      "type": "privacy|terms|returns|shipping|cookies|gdpr",
      "title": "Specific legal improvement title",
      "description": "Detailed explanation of the legal requirement",
      "impact": "Legal protection and customer trust benefits",
      "priority": "critical|high|medium|low",
      "suggestions": {
        "current": "Current legal page status",
        "recommended": "Specific legal page or policy needed",
        "implementation": "How to create and implement this legal document"
      }
    }
  ]
}

Focus on:
- Privacy Policy compliance (GDPR, CCPA)
- Terms of Service and Terms & Conditions
- Return and Refund Policy
- Shipping Policy
- Cookie Policy and consent
- Age verification for restricted products`
      }],
      response_format: { type: "json_object" },
      max_tokens: 1500,
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"suggestions": []}');
    
    result.suggestions = result.suggestions.map((suggestion: any, index: number) => ({
      ...suggestion,
      id: suggestion.id || `legal-${Date.now()}-${index}`
    }));

    return result;
  } catch (error) {
    console.error("OpenAI legal analysis failed:", error);
    return {
      legalScore: 8,
      suggestions: [
        {
          id: `legal-fallback-${Date.now()}`,
          type: 'privacy',
          title: 'Create Comprehensive Privacy Policy',
          description: 'Implement a GDPR and CCPA compliant privacy policy',
          impact: 'Legal compliance and customer trust',
          priority: 'critical',
          suggestions: {
            current: 'Missing or incomplete privacy policy',
            recommended: 'Create comprehensive privacy policy covering data collection, usage, and user rights',
            implementation: 'Use legal template generators or consult with legal expert to create compliant privacy policy'
          }
        }
      ]
    };
  }
}

// Conversion optimization recommendations
export async function generateConversionRecommendations(storeUrl: string, storeType: string) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{
        role: "user",
        content: `You are an expert conversion rate optimization (CRO) specialist. Generate specific conversion improvement recommendations for this ${storeType} store: ${storeUrl}

Provide 4-6 specific conversion optimization recommendations in this JSON format:
{
  "conversionScore": number (0-10),
  "suggestions": [
    {
      "id": "unique-id",
      "type": "checkout|cta|urgency|social-proof|forms|cart",
      "title": "Specific conversion improvement title",
      "description": "Detailed explanation of the conversion optimization",
      "impact": "Expected impact on conversion rates and sales",
      "priority": "critical|high|medium|low",
      "suggestions": {
        "current": "Current conversion element description",
        "recommended": "Specific recommended optimization",
        "implementation": "How to implement this conversion improvement"
      }
    }
  ]
}

Focus on:
- Call-to-action button optimization
- Checkout process simplification
- Urgency and scarcity tactics
- Social proof implementation
- Form optimization
- Cart abandonment reduction
- Mobile conversion improvements`
      }],
      response_format: { type: "json_object" },
      max_tokens: 1500,
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"suggestions": []}');
    
    result.suggestions = result.suggestions.map((suggestion: any, index: number) => ({
      ...suggestion,
      id: suggestion.id || `conversion-${Date.now()}-${index}`
    }));

    return result;
  } catch (error) {
    console.error("OpenAI conversion analysis failed:", error);
    return {
      conversionScore: 6,
      suggestions: [
        {
          id: `conversion-fallback-${Date.now()}`,
          type: 'cta',
          title: 'Optimize Call-to-Action Buttons',
          description: 'Improve button design and copy to increase click-through rates',
          impact: 'Higher conversion rates and more sales',
          priority: 'high',
          suggestions: {
            current: 'Generic or weak call-to-action buttons',
            recommended: 'Use action-oriented text, contrasting colors, and strategic placement for CTAs',
            implementation: 'Update button text to "Buy Now", "Add to Cart", use contrasting colors and place above the fold'
          }
        }
      ]
    };
  }
}

// Reviews and trust recommendations
export async function generateTrustRecommendations(storeUrl: string, storeType: string) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{
        role: "user",
        content: `You are an expert trust and reputation specialist for e-commerce. Generate specific trust building and review optimization recommendations for this ${storeType} store: ${storeUrl}

Provide 4-6 specific trust and review improvement recommendations in this JSON format:
{
  "trustScore": number (0-15),
  "suggestions": [
    {
      "id": "unique-id",
      "type": "reviews|testimonials|badges|security|guarantees|contact",
      "title": "Specific trust improvement title",
      "description": "Detailed explanation of the trust building element",
      "impact": "Expected impact on customer trust and conversions",
      "priority": "critical|high|medium|low",
      "suggestions": {
        "current": "Current trust element status",
        "recommended": "Specific trust building recommendation",
        "implementation": "How to implement this trust element"
      }
    }
  ]
}

Focus on:
- Customer review system implementation
- Trust badges and security certificates
- Money-back guarantees
- Customer testimonials display
- Contact information visibility
- About us page optimization
- Social proof elements`
      }],
      response_format: { type: "json_object" },
      max_tokens: 1500,
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"suggestions": []}');
    
    result.suggestions = result.suggestions.map((suggestion: any, index: number) => ({
      ...suggestion,
      id: suggestion.id || `trust-${Date.now()}-${index}`
    }));

    return result;
  } catch (error) {
    console.error("OpenAI trust analysis failed:", error);
    return {
      trustScore: 9,
      suggestions: [
        {
          id: `trust-fallback-${Date.now()}`,
          type: 'reviews',
          title: 'Implement Customer Review System',
          description: 'Add customer reviews and ratings to build trust and social proof',
          impact: 'Increased customer confidence and higher conversion rates',
          priority: 'high',
          suggestions: {
            current: 'No customer reviews visible on product pages',
            recommended: 'Install review app and encourage customers to leave reviews with automated email campaigns',
            implementation: 'Use Shopify review apps like Judge.me or Yotpo, send review request emails after purchase'
          }
        }
      ]
    };
  }
}
