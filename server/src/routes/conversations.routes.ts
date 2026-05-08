import { Router } from "express";
import { ConversationsController } from "../controllers/conversations.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(ConversationsController.listConversations));
router.post("/", asyncHandler(ConversationsController.createConversation));
router.get("/:id", asyncHandler(ConversationsController.getConversation));
router.get("/:id/messages", asyncHandler(ConversationsController.getMessages));
router.delete("/:id", asyncHandler(ConversationsController.deleteConversation));

export default router;