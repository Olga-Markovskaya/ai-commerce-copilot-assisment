import { API_BASE_URL } from "@lib/api";
import type { Conversation, ChatMessage } from "./conversationApi";

export type SendChatMessageRequest = {
  conversationId: string;
  userMessage: string;
};

export type SendChatMessageResponse = {
  conversation: Conversation;
  assistantMessage: ChatMessage;
};

export type ChatApiError = {
  error: string;
};

export class ChatApiService {
  static async sendChatMessage(
    conversationId: string,
    userMessage: string,
  ): Promise<SendChatMessageResponse> {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId,
        userMessage,
      } as SendChatMessageRequest),
    });

    if (!response.ok) {
      let errorMessage = "Failed to send message";
      
      try {
        const errorData = (await response.json()) as ChatApiError;
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Ignore JSON parse errors, use default message
      }
      
      throw new Error(errorMessage);
    }

    return response.json() as Promise<SendChatMessageResponse>;
  }
}