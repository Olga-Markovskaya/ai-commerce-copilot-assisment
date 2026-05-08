import OpenAI from "openai";
import { config } from "../../config/env.js";
import type { 
  LlmProvider, 
  LlmProviderConfig,
  GenerateAssistantReplyInput,
  ExtractIntentInput 
} from "./llmProvider.types.js";
import type { AssistantIntent } from "../../features/assistant/intent.types.js";
import { SHOPPING_ASSISTANT_SYSTEM_PROMPT } from "../../features/assistant/prompts/shoppingAssistantPrompt.js";

export class OpenAiProvider implements LlmProvider {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(providerConfig?: LlmProviderConfig) {
    const apiKey = providerConfig?.apiKey || config.openai.apiKey;
    this.model = providerConfig?.model || config.openai.model;
    this.maxTokens = providerConfig?.maxTokens || config.openai.maxCompletionTokens;
    this.temperature = providerConfig?.temperature || 0.7;

    if (!apiKey) {
      throw new Error("OpenAI API key is required. Please set OPENAI_API_KEY environment variable.");
    }

    this.client = new OpenAI({
      apiKey: apiKey,
      timeout: 15000,
    });
  }

  async generateAssistantReply(input: GenerateAssistantReplyInput): Promise<string> {
    try {
      // Build messages array with system prompt and conversation history
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { 
          role: "system", 
          content: input.systemPrompt || SHOPPING_ASSISTANT_SYSTEM_PROMPT 
        }
      ];

      // Add conversation history if provided
      if (input.conversationHistory) {
        input.conversationHistory.forEach(msg => {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        });
      }

      // Add the user's current message
      messages.push({
        role: "user",
        content: input.userPrompt
      });

      // Call OpenAI API
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        max_completion_tokens: this.maxTokens,
        temperature: this.temperature,
      });

      const assistantReply = response.choices[0]?.message?.content;
      
      if (!assistantReply) {
        throw new Error("OpenAI returned empty response");
      }

      return assistantReply;

    } catch (error) {
      console.error("OpenAI API error:", error);
      
      if (error instanceof Error) {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      
      throw new Error("Unknown OpenAI API error occurred");
    }
  }

  async extractIntent(input: ExtractIntentInput): Promise<AssistantIntent> {
    try {
      const systemPrompt = `You are an intent classifier for a shopping assistant. 
Extract the user's intent and return ONLY a JSON object with one of these structures:

For product search: {"type": "product_search", "query": "user's search terms", "category": "beauty|laptops|smartphones|etc", "minPrice": number, "maxPrice": number, "sortBy": "price_asc|price_desc|rating_desc"}

For greeting: {"type": "greeting"}

For clarification needed: {"type": "clarification_needed", "question": "What specific information do you need?"}

For general chat: {"type": "general_chat"}

CRITICAL RULES:
- ONLY recommend products that exist in search results
- Do not invent prices, stock, discounts, brands, or products
- Ask clarification if request is too vague
- Keep responses short - products render as cards in UI

Return ONLY the JSON object, no other text.`;

      const userPrompt = `User message: "${input.userMessage}"

${input.conversationContext?.recentMessages ? `Recent context: ${input.conversationContext.recentMessages.slice(-2).join(', ')}` : ''}

Extract intent as JSON:`;

      const response = await this.generateAssistantReply({
        systemPrompt,
        userPrompt,
      });

      // Parse the JSON response
      try {
        const cleanResponse = response.trim();
        const intent = JSON.parse(cleanResponse) as AssistantIntent;
        
        // Validate the response has a valid type
        if (!intent.type || !['product_search', 'greeting', 'clarification_needed', 'general_chat'].includes(intent.type)) {
          console.warn("Invalid intent type from OpenAI, falling back to general_chat");
          return { type: "general_chat" };
        }
        
        return intent;
      } catch (parseError) {
        console.error("Failed to parse OpenAI intent JSON:", parseError, "Response:", response);
        return { type: "general_chat" };
      }

    } catch (error) {
      console.error("OpenAI intent extraction error:", error);
      // Fallback to general chat on any error
      return { type: "general_chat" };
    }
  }
}