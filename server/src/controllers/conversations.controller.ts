import type { Request, Response } from "express";
import { ServiceContainer } from "../services/serviceContainer.js";
import { HttpError } from "../utils/httpError.js";

export class ConversationsController {
  static async listConversations(req: Request, res: Response): Promise<void> {
    const conversationService = ServiceContainer.getConversationService();
    const conversations = conversationService.listConversations();
    res.json({ conversations });
  }

  static async createConversation(req: Request, res: Response): Promise<void> {
    const conversationService = ServiceContainer.getConversationService();
    const conversation = conversationService.createConversation();
    res.json({ conversation });
  }

  static async getConversation(req: Request, res: Response): Promise<void> {
    const conversationService = ServiceContainer.getConversationService();
    const id = req.params.id as string;
    const conversation = conversationService.getConversation(id);
    
    if (!conversation) {
      throw HttpError.notFound("Conversation not found");
    }

    res.json({ conversation });
  }

  static async getMessages(req: Request, res: Response): Promise<void> {
    const conversationService = ServiceContainer.getConversationService();
    const id = req.params.id as string;

    const limitRaw = parseInt(req.query.limit as string, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 30;
    const before = typeof req.query.before === "string" ? req.query.before : undefined;

    const page = conversationService.getConversationMessages(id, limit, before);

    if (!page) {
      throw HttpError.notFound("Conversation not found");
    }

    res.json(page);
  }

  static async deleteConversation(req: Request, res: Response): Promise<void> {
    const conversationService = ServiceContainer.getConversationService();
    const id = req.params.id as string;
    const deleted = conversationService.deleteConversation(id);
    
    if (!deleted) {
      throw HttpError.notFound("Conversation not found");
    }

    res.json({ success: true });
  }
}