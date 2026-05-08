import type { AssistantIntent } from "../../features/assistant/intent.types.js";

export type GenerateAssistantReplyInput = {
  systemPrompt: string;
  userPrompt: string;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

export type ExtractIntentInput = {
  userMessage: string;
  conversationContext?: {
    recentMessages: string[];
  };
};

export interface LlmProvider {
  generateAssistantReply(input: GenerateAssistantReplyInput): Promise<string>;
  
  // Optional: structured intent extraction (for providers that support it)
  extractIntent?(input: ExtractIntentInput): Promise<AssistantIntent>;
}

export type LlmProviderConfig = {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
};