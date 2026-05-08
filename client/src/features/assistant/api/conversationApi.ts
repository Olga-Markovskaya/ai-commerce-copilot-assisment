// ProductCard is defined in @lib/types because it is shared with the products
// feature. Re-exported here so all existing assistant-internal imports remain
// unchanged (MessageBubble, ProductCard component, ProductCarousel, etc.).
import type { ProductCard } from "@lib/types";
export type { ProductCard };

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

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

export type MessagesPage = {
  messages: ChatMessage[];
  /** Pass as `before` param to load the next (older) page. Null when no more pages. */
  nextCursor: string | null;
  hasMore: boolean;
};

import { API_BASE_URL } from "@lib/api";

export class ConversationApiService {
  static async fetchConversations(): Promise<ConversationSummary[]> {
    const response = await fetch(`${API_BASE_URL}/api/conversations`);

    if (!response.ok) {
      throw new Error("Failed to fetch conversations");
    }

    const data = await response.json() as { conversations: ConversationSummary[] };
    return data.conversations;
  }

  static async createConversation(): Promise<Conversation> {
    const response = await fetch(`${API_BASE_URL}/api/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to create conversation");
    }

    const data = await response.json() as { conversation: Conversation };
    return data.conversation;
  }

  static async fetchConversation(id: string): Promise<Conversation> {
    const response = await fetch(`${API_BASE_URL}/api/conversations/${id}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Conversation not found");
      }
      throw new Error("Failed to fetch conversation");
    }

    const data = await response.json() as { conversation: Conversation };
    return data.conversation;
  }

  static async fetchMessages(
    conversationId: string,
    limit = 30,
    before?: string,
  ): Promise<MessagesPage> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set("before", before);

    const response = await fetch(
      `${API_BASE_URL}/api/conversations/${conversationId}/messages?${params}`,
    );

    if (!response.ok) {
      if (response.status === 404) throw new Error("Conversation not found");
      throw new Error("Failed to fetch messages");
    }

    return response.json() as Promise<MessagesPage>;
  }

  static async deleteConversation(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/conversations/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Conversation not found");
      }
      throw new Error("Failed to delete conversation");
    }
  }
}