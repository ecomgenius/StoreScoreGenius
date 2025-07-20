import OpenAI from 'openai';
import { storage } from '../storage';
import { ALEX } from '@shared/constants';
import { logInfo } from '@shared/errorHandler';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Dynamic context builder for Alex AI conversations
 */
export interface UserContext {
  userId: number;
  stores: Array<{
    id: number;
    name: string;
    storeUrl: string;
    lastAnalyzed?: string;
    healthScore?: number;
  }>;
  recentAnalyses: Array<{
    storeUrl: string;
    overallScore: number;
    designScore: number;
    trustScore: number;
    performanceScore: number;
    catalogScore: number;
    createdAt: Date;
  }>;
  pastConversations: Array<{
    topic: string;
    timestamp: Date;
    summary: string;
  }>;
  dashboardVisitTime: Date;
  timeSinceLastMessage?: number; // in hours
}

/**
 * System prompt for Alex AI - defines personality and behavior
 */
const SYSTEM_PROMPT = `You are Alex, an AI-powered eCommerce Manager assistant.
Your mission is to help users grow their online stores through suggestions, education and analysis.

You must:
- Be proactive and guide the user based on their specific store data
- Use the provided context (store data, product performance, history) to personalize responses
- Avoid hardcoded replies - every response should be contextual and dynamic  
- Adapt tone and focus based on store quality and past conversations
- Teach concepts when no urgent optimization tasks exist
- Store and recall previous interactions for continuity
- Evolve from assistant to coach as conversations progress
- Ask follow-up questions and provide action plans
- Link improvements to business outcomes

Personality traits:
- Friendly but professional
- Strategic thinking focused
- Educational and patient
- Results-oriented
- Encouraging but realistic

Always speak with clarity, personality, and strategic thinking. Keep responses concise but actionable.`;

/**
 * Builds dynamic context string for OpenAI prompt
 */
function buildDynamicContext(context: UserContext): string {
  const {
    stores,
    recentAnalyses,
    pastConversations,
    dashboardVisitTime,
    timeSinceLastMessage
  } = context;

  let contextString = `User opened the dashboard at ${dashboardVisitTime.toLocaleString()}.\n`;
  
  // Store information
  if (stores.length === 0) {
    contextString += "User has no connected stores yet.\n";
  } else if (stores.length === 1) {
    const store = stores[0];
    const analysis = recentAnalyses.find(a => a.storeUrl.includes(store.name) || store.storeUrl.includes(a.storeUrl));
    
    if (analysis) {
      contextString += `They have 1 connected Shopify store: "${store.name}" (score ${analysis.overallScore}/100).\n`;
      contextString += `Store breakdown: Design ${analysis.designScore}/100, Trust ${analysis.trustScore}/100, Performance ${analysis.performanceScore}/100, Catalog ${analysis.catalogScore}/100.\n`;
      
      // Identify weak areas
      const weakAreas = [];
      if (analysis.designScore < 70) weakAreas.push(`Design (${analysis.designScore}/100)`);
      if (analysis.trustScore < 70) weakAreas.push(`Trust (${analysis.trustScore}/100)`);
      if (analysis.performanceScore < 70) weakAreas.push(`Performance (${analysis.performanceScore}/100)`);
      if (analysis.catalogScore < 70) weakAreas.push(`Catalog (${analysis.catalogScore}/100)`);
      
      if (weakAreas.length > 0) {
        contextString += `Weak areas flagged: ${weakAreas.join(', ')}.\n`;
      }
      
      const daysSinceAnalysis = Math.floor((new Date().getTime() - new Date(analysis.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceAnalysis > 7) {
        contextString += `Last full store analysis was ${daysSinceAnalysis} days ago - might need refresh.\n`;
      }
    } else {
      contextString += `They have 1 connected store "${store.name}" but no recent analysis data available.\n`;
    }
  } else {
    contextString += `They have ${stores.length} connected stores: `;
    const storeDescriptions = stores.map(store => {
      const analysis = recentAnalyses.find(a => a.storeUrl.includes(store.name) || store.storeUrl.includes(a.storeUrl));
      return analysis ? `"${store.name}" (score ${analysis.overallScore}/100)` : `"${store.name}" (not analyzed)`;
    });
    contextString += storeDescriptions.join(', ') + '.\n';
  }

  // Past conversations
  if (pastConversations.length > 0) {
    const lastConversation = pastConversations[0];
    const hoursSince = timeSinceLastMessage || 0;
    
    if (hoursSince < 1) {
      contextString += `Last conversation was less than an hour ago, about ${lastConversation.topic}.\n`;
    } else if (hoursSince < 24) {
      contextString += `Last conversation was ${Math.floor(hoursSince)} hours ago, about ${lastConversation.topic}.\n`;
    } else {
      const daysSince = Math.floor(hoursSince / 24);
      contextString += `Last conversation was ${daysSince} days ago, about ${lastConversation.topic}.\n`;
    }
    
    // Add conversation topics for context
    const recentTopics = pastConversations.slice(0, 3).map(c => c.topic);
    contextString += `Previous topics discussed: ${recentTopics.join(', ')}.\n`;
  } else {
    contextString += "This is their first conversation with Alex.\n";
  }

  contextString += "\nWrite a proactive and friendly welcome message that:\n";
  contextString += "- References this specific context and store situation\n";
  contextString += "- Suggests concrete next actions or improvements\n";
  contextString += "- Offers guidance and strategic direction\n";
  contextString += "- Uses a conversational, encouraging tone\n";
  contextString += "- Keeps the response concise but actionable (max 150 words)";

  return contextString;
}

/**
 * Generates dynamic opening message using OpenAI
 */
export async function generateDynamicWelcome(context: UserContext): Promise<string> {
  try {
    logInfo('Alex AI', 'Generating dynamic welcome message', { userId: context.userId });
    
    const userPrompt = buildDynamicContext(context);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 300,
      temperature: 0.7
    });

    const welcome = response.choices[0].message.content || "Hey there! I'm Alex, your AI e-commerce manager. Let me analyze your store data and help you optimize for better results.";
    
    logInfo('Alex AI', 'Dynamic welcome generated successfully');
    return welcome;
    
  } catch (error) {
    console.error('Alex AI - Failed to generate dynamic welcome:', error);
    return "Hey there! I'm Alex, your AI e-commerce manager. I'm here to help optimize your store and boost your sales. What would you like to work on today?";
  }
}

/**
 * Generates contextual responses during conversations
 */
export async function generateContextualResponse(
  userMessage: string,
  context: UserContext,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  try {
    logInfo('Alex AI', 'Generating contextual response', { userId: context.userId });
    
    // Build conversation context
    const contextString = buildDynamicContext(context);
    const enhancedSystemPrompt = `${SYSTEM_PROMPT}\n\nCurrent Context:\n${contextString}`;
    
    // Create messages array with history
    const messages = [
      { role: "system" as const, content: enhancedSystemPrompt },
      ...conversationHistory.slice(-ALEX.MAX_CONVERSATION_HISTORY), // Keep last 10 messages
      { role: "user" as const, content: userMessage }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages,
      max_tokens: 400,
      temperature: 0.8
    });

    const reply = response.choices[0].message.content || "I'm here to help! Could you tell me more about what you'd like to improve with your store?";
    
    logInfo('Alex AI', 'Contextual response generated successfully');
    return reply;
    
  } catch (error) {
    console.error('Alex AI - Failed to generate contextual response:', error);
    return "I'm having trouble processing that right now. Could you try rephrasing your question?";
  }
}

/**
 * Analyzes conversation to extract topics and insights for memory
 */
export async function extractConversationInsights(
  messages: Array<{ content: string; isFromAlex: boolean }>
): Promise<{
  topic: string;
  summary: string;
  keyPoints: string[];
}> {
  try {
    const conversationText = messages
      .map(m => `${m.isFromAlex ? 'Alex' : 'User'}: ${m.content}`)
      .join('\n');

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "Analyze this eCommerce conversation and extract: 1) Main topic (2-4 words), 2) Brief summary (1 sentence), 3) Key points discussed. Return as JSON."
        },
        {
          role: "user", 
          content: `Conversation:\n${conversationText}\n\nReturn format: {"topic": "string", "summary": "string", "keyPoints": ["string1", "string2"]}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      topic: result.topic || 'General Discussion',
      summary: result.summary || 'Discussion about store optimization',
      keyPoints: result.keyPoints || []
    };
    
  } catch (error) {
    console.error('Alex AI - Failed to extract conversation insights:', error);
    return {
      topic: 'General Discussion',
      summary: 'Conversation about store optimization',
      keyPoints: []
    };
  }
}