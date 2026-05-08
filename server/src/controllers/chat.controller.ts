import type { Request, Response } from "express";
import { ServiceContainer } from "../services/serviceContainer.js";
import { AssistantService } from "../features/assistant/assistant.service.js";
import { HttpError } from "../utils/httpError.js";

export class ChatController {
  static async handleChatMessage(req: Request, res: Response): Promise<void> {
    const { conversationId, userMessage } = req.body;

    if (!conversationId || !userMessage) {
      throw HttpError.badRequest("Missing required fields: conversationId, userMessage");
    }

    const assistantService = new AssistantService(ServiceContainer.getConversationService());
    const result = await assistantService.handleUserMessage({
      conversationId,
      userMessage,
    });

    res.json(result);
  }
}