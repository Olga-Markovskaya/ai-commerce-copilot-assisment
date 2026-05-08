import type { ProductCard } from "../products/product.types.js";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: ProductCard[];
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};