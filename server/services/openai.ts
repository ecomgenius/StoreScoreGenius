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

export async function analyzeStoreWithAI(data: StoreAnalysisData): Promise<{
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
}> {
  try {
    console.log("Starting AI analysis for store type:", data.storeType);
    console.log("Content length:", data.storeContent.length);
    const prompt = `
Analyze this ${data.storeType} store and provide a comprehensive scoring and improvement analysis.

Store Information:
${data.storeContent}

${data.storeUrl ? `Store URL: ${data.storeUrl}` : ''}
${data.ebayUsername ? `eBay Username: ${data.ebayUsername}` : ''}

Even if detailed content is not available, provide realistic analysis based on:
- Platform type (${data.storeType})
- Common ${data.storeType} best practices
- General e-commerce optimization principles
- URL structure analysis (if available)

Provide analysis in JSON format with:
1. Scores (0-100) for:
   - overallScore: Overall store performance estimate
   - designScore: Visual design, layout, branding potential
   - catalogScore: Product variety, descriptions, pricing optimization
   - trustScore: Reviews, policies, trust indicators potential
   - performanceScore: Site speed, mobile responsiveness expectations

2. suggestions: Array of 5-6 specific improvement recommendations, each with:
   - title: Clear, actionable title
   - description: Detailed explanation (50-100 words) focusing on ${data.storeType} best practices
   - impact: Expected improvement (e.g., "+15% conversion potential", "+20% trust improvement")
   - category: One of 'design', 'catalog', 'trust', 'performance'

3. summary: 1-2 sentence overall assessment focusing on ${data.storeType} optimization opportunities

Provide realistic, actionable insights for ${data.storeType} stores that can drive sales and improve user experience. Focus on platform-specific optimizations and common improvement areas.
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

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate and sanitize the response
    return {
      overallScore: Math.max(0, Math.min(100, Math.round(result.overallScore || 0))),
      designScore: Math.max(0, Math.min(100, Math.round(result.designScore || 0))),
      catalogScore: Math.max(0, Math.min(100, Math.round(result.catalogScore || 0))),
      trustScore: Math.max(0, Math.min(100, Math.round(result.trustScore || 0))),
      performanceScore: Math.max(0, Math.min(100, Math.round(result.performanceScore || 0))),
      suggestions: Array.isArray(result.suggestions) ? result.suggestions.slice(0, 6) : [],
      summary: result.summary || "Analysis completed successfully."
    };
  } catch (error) {
    console.error("OpenAI analysis failed:", error);
    throw new Error("Failed to analyze store with AI: " + error.message);
  }
}
