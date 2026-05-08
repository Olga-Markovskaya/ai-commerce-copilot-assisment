import { Router } from "express";
import { ChatController } from "../controllers/chat.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// POST /api/chat - Send message to assistant
router.post("/", asyncHandler(ChatController.handleChatMessage));

export default router;