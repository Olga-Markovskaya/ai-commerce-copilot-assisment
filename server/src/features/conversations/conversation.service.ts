import { createId } from "../../utils/ids.js";
import { ConversationRepository } from "./conversation.repository.js";
import type { ConversationMessagesPage } from "./conversation.repository.js";
import type { ChatMessage, Conversation, ConversationSummary } from "./conversation.types.js";
import type { ProductCard } from "../products/product.types.js";

export class ConversationService {
  constructor(private repository: ConversationRepository) {}

  listConversations(): ConversationSummary[] {
    return this.repository.listConversations();
  }

  getConversation(id: string): Conversation | null {
    return this.repository.getConversationById(id);
  }

  getConversationMessages(
    conversationId: string,
    limit: number,
    before?: string,
  ): ConversationMessagesPage | null {
    if (!this.repository.conversationExists(conversationId)) return null;
    return this.repository.getConversationMessages(conversationId, limit, before);
  }

  createConversation(): Conversation {
    return this.repository.createConversation();
  }

  deleteConversation(id: string): boolean {
    return this.repository.deleteConversation(id);
  }

  addMessage(conversationId: string, role: "user" | "assistant", content: string, products?: ProductCard[]): Conversation | null {
    const message: ChatMessage = {
      id: createId(),
      role,
      content,
      createdAt: new Date().toISOString(),
    };

    if (role === "assistant" && products && products.length > 0) {
      message.products = products;
    }

    return this.repository.addMessage(conversationId, message);
  }

  addMessagePair(
    conversationId: string,
    userContent: string,
    assistantContent: string,
    assistantProducts?: ProductCard[],
  ): Conversation | null {
    // Give the assistant message a timestamp 1 ms after the user message so that
    // ORDER BY created_at reflects the correct within-turn order. Using the same
    // `now` for both produced identical timestamps, making the sort order depend
    // on the random UUID — which caused messages to display out of order.
    const userCreatedAt = new Date();
    const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1);

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: userContent,
      createdAt: userCreatedAt.toISOString(),
    };

    const assistantMessage: ChatMessage = {
      id: createId(),
      role: "assistant",
      content: assistantContent,
      createdAt: assistantCreatedAt.toISOString(),
      ...(assistantProducts && assistantProducts.length > 0 ? { products: assistantProducts } : {}),
    };

    return this.repository.addMessagePair(conversationId, userMessage, assistantMessage);
  }

  updateTitle(conversationId: string, title: string): Conversation | null {
    return this.repository.updateConversationTitle(conversationId, title);
  }

  generateTitleFromMessage(content: string): string {
    const title = content.trim().slice(0, 40);
    return title || "New chat";
  }
}