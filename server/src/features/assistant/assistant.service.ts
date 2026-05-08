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

    // Validate inputs
    if (!conversationId || !userMessage?.trim()) {
      throw HttpError.badRequest("Missing conversationId or userMessage");
    }

    const MAX_MESSAGE_LENGTH = 2000;
    if (userMessage.trim().length > MAX_MESSAGE_LENGTH) {
      throw HttpError.badRequest(
        `userMessage exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
      );
    }

    // Find conversation
    const conversation = this.conversationService.getConversation(conversationId);
    if (!conversation) {
      throw HttpError.notFound("Conversation not found");
    }

    // Update conversation title if this is the first user message (reads snapshot, no DB write yet)
    await this.updateTitleIfNeeded(conversation, userMessage);

    // Process the message — the expensive async step (OpenAI / product retrieval)
    const assistantReply = await this.orchestrator.processUserMessage({
      conversationId,
      userMessage: userMessage.trim(),
      recentMessages: conversation.messages.slice(-3).map((m): RecentMessage => ({
        role: m.role as "user" | "assistant",
        content: m.content,
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

    // Find the assistant message we just added
    const assistantMessage = finalConversation.messages[finalConversation.messages.length - 1];

    return {
      conversation: finalConversation,
      assistantMessage,
      products: assistantReply.products,
    };
  }

  private async updateTitleIfNeeded(conversation: Conversation, userMessage: string): Promise<void> {
    // Use the pre-add snapshot: if it has zero user messages, the current message is the first.
    const isFirstUserMessage = conversation.title === "New chat" &&
      conversation.messages.filter(m => m.role === "user").length === 0;

    if (isFirstUserMessage) {
      const newTitle = this.conversationService.generateTitleFromMessage(userMessage);
      this.conversationService.updateTitle(conversation.id, newTitle);
    }
  }

}