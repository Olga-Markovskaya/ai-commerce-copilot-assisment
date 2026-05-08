import { Router } from "express";
import { ConversationsController } from "../controllers/conversations.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// GET /api/conversations - List all conversations
router.get("/", asyncHandler(ConversationsController.listConversations));

// POST /api/conversations - Create new conversation
router.post("/", asyncHandler(ConversationsController.createConversation));

// GET /api/conversations/:id - Get specific conversation with messages
router.get("/:id", asyncHandler(ConversationsController.getConversation));

// GET /api/conversations/:id/messages?limit=30&before=<cursor>
router.get("/:id/messages", asyncHandler(ConversationsController.getMessages));

// DELETE /api/conversations/:id - Delete conversation
router.delete("/:id", asyncHandler(ConversationsController.deleteConversation));

export default router;