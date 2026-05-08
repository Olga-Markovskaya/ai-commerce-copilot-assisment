import type { ProductCard } from "../products/product.types.js";
import type { Conversation, ChatMessage } from "../conversations/conversation.types.js";

/** A single turn from conversation history, preserving the speaker role. */
export type RecentMessage = {
  role: "user" | "assistant";
  content: string;
  /** Present only for assistant turns that returned product cards. */
  products?: ProductCard[];
};

export type AssistantReply = {
  content: string;
  products?: ProductCard[];
};

export type ProcessChatRequest = {
  conversationId: string;
  userMessage: string;
};

export type ProcessChatResponse = {
  conversation: Conversation;
  assistantMessage: ChatMessage;
  products?: ProductCard[];
};