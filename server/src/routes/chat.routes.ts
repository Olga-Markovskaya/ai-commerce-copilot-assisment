import { Router } from "express";
import { ChatController } from "../controllers/chat.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post("/", asyncHandler(ChatController.handleChatMessage));

export default router;