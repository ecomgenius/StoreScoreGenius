import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key" 
});

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
    const prompt = `
Analyze this ${data.storeType} store and provide a comprehensive scoring and improvement analysis.

Store Content:
${data.storeContent}

Provide analysis in JSON format with:
1. Scores (0-100) for:
   - overallScore: Overall store performance
   - designScore: Visual design, layout, branding
   - catalogScore: Product variety, descriptions, pricing
   - trustScore: Reviews, policies, trust indicators
   - performanceScore: Site speed, mobile responsiveness

2. suggestions: Array of 4-6 specific improvement recommendations, each with:
   - title: Clear, actionable title
   - description: Detailed explanation (50-100 words)
   - impact: Expected improvement (e.g., "+15% conversion potential")
   - category: One of 'design', 'catalog', 'trust', 'performance'

3. summary: 1-2 sentence overall assessment

Focus on actionable insights that can drive sales and improve user experience. Be specific and data-driven in your recommendations.
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
