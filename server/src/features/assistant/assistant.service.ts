import { HttpError } from "../../utils/httpError.js";
import { ConversationService } from "../conversations/conversation.service.js";
import { AssistantOrchestrator } from "./assistant.orchestrator.js";
import { ServiceContainer } from "../../services/serviceContainer.js";
import type { ProcessChatRequest, ProcessChatResponse, RecentMessage } from "./assistant.types.js";
import type { Conversation } from "../conversations/conversation.types.js";

export class AssistantService {
  private conversationService: ConversationService;
  private orchestrator: AssistantOrchestrator;

  constructor(conversationService: ConversationService, orchestrator?: AssistantOrchestrator) {
    this.conversationService = conversationService;
    this.orchestrator = orchestrator ?? ServiceContainer.getAssistantOrchestrator();
  }

  async handleUserMessage(request: ProcessChatRequest): Promise<ProcessChatResponse> {
    const { conversationId, userMessage } = request;

    if (!conversationId || !userMessage?.trim()) {
      throw HttpError.badRequest("Missing conversationId or userMessage");
    }

    const MAX_MESSAGE_LENGTH = 2000;
    if (userMessage.trim().length > MAX_MESSAGE_LENGTH) {
      throw HttpError.badRequest(
        `userMessage exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
      );
    }

    const conversation = this.conversationService.getConversation(conversationId);
    if (!conversation) {
      throw HttpError.notFound("Conversation not found");
    }

    await this.updateTitleIfNeeded(conversation, userMessage);

    const assistantReply = await this.orchestrator.processUserMessage({
      conversationId,
      userMessage: userMessage.trim(),
      recentMessages: conversation.messages.slice(-6).map((m): RecentMessage => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        products: m.products,
      })),
    });

    // Persist both messages in a single atomic transaction so a crash between
    // the two writes cannot leave an orphaned user message with no assistant reply.
    const finalConversation = this.conversationService.addMessagePair(
      conversationId,
      userMessage.trim(),
      assistantReply.content,
      assistantReply.products,
    );

    if (!finalConversation) {
      throw HttpError.internal("Failed to persist conversation");
    }

    const assistantMessage = finalConversation.messages[finalConversation.messages.length - 1];

    return {
      conversation: finalConversation,
      assistantMessage,
      products: assistantReply.products,
    };
  }

  private async updateTitleIfNeeded(conversation: Conversation, userMessage: string): Promise<void> {
    const isFirstUserMessage = conversation.title === "New chat" &&
      conversation.messages.filter(m => m.role === "user").length === 0;

    if (isFirstUserMessage) {
      const newTitle = this.conversationService.generateTitleFromMessage(userMessage);
      this.conversationService.updateTitle(conversation.id, newTitle);
    }
  }

}