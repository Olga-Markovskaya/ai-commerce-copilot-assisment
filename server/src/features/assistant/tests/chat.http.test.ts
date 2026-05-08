/**
 * HTTP-layer integration tests for the chat endpoint.
 *
 * Tests call AssistantService.handleUserMessage directly (the function that
 * ChatController delegates to), with mocked ConversationService and
 * AssistantOrchestrator. No real network, SQLite, or OpenAI calls occur.
 *
 * Covered invariants:
 *  - Missing / blank inputs throw HttpError 400
 *  - Unknown conversation throws HttpError 404
 *  - Valid request reaches the orchestrator and returns a response
 *  - Conversation title is updated only on the FIRST user message
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { AssistantService } from "../assistant.service.js";
import { HttpError } from "../../../utils/httpError.js";

// ── Shared mock objects ───────────────────────────────────────────────────

function makeConversation(userMessages = 0) {
  const messages = Array.from({ length: userMessages }, (_, i) => ({
    id: `msg-user-${i}`,
    role: "user" as const,
    content: `previous message ${i}`,
    createdAt: new Date().toISOString(),
  }));
  return {
    id: "conv-123",
    title: "New chat",
    messages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const assistantReply = { content: "Here are some options.", products: [] };

function makeAssistantMessage() {
  return {
    id: "msg-assistant",
    role: "assistant" as const,
    content: assistantReply.content,
    createdAt: new Date().toISOString(),
  };
}

function makeConversationService(overrides: Partial<ReturnType<typeof makeDefaultConversationService>> = {}) {
  return { ...makeDefaultConversationService(), ...overrides };
}

function makeDefaultConversationService() {
  return {
    getConversation: vi.fn(),
    addMessage: vi.fn(),
    addMessagePair: vi.fn(),
    updateTitle: vi.fn(),
    generateTitleFromMessage: vi.fn().mockReturnValue("Test chat title"),
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
  };
}

function makeOrchestrator() {
  return {
    processUserMessage: vi.fn().mockResolvedValue(assistantReply),
  };
}

function makeService(
  convService = makeConversationService(),
  orchestrator = makeOrchestrator(),
) {
  // Pass orchestrator directly so ServiceContainer is not involved
  return new AssistantService(convService as any, orchestrator as any);
}

// ── Request validation ────────────────────────────────────────────────────

describe("AssistantService.handleUserMessage — input validation", () => {
  it("throws HttpError 400 when conversationId is missing", async () => {
    const svc = makeService();
    await expect(
      svc.handleUserMessage({ conversationId: "", userMessage: "hello" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws HttpError 400 when userMessage is missing", async () => {
    const svc = makeService();
    await expect(
      svc.handleUserMessage({ conversationId: "conv-123", userMessage: "" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws HttpError 400 when userMessage is whitespace-only", async () => {
    const svc = makeService();
    await expect(
      svc.handleUserMessage({ conversationId: "conv-123", userMessage: "   " }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws HttpError that is an instance of HttpError", async () => {
    const svc = makeService();
    const error = await svc
      .handleUserMessage({ conversationId: "", userMessage: "" })
      .catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
  });

  it("throws HttpError 400 when userMessage exceeds 2000 characters", async () => {
    const svc = makeService();
    await expect(
      svc.handleUserMessage({
        conversationId: "conv-123",
        userMessage: "a".repeat(2001),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── Conversation lookup ───────────────────────────────────────────────────

describe("AssistantService.handleUserMessage — conversation lookup", () => {
  it("throws HttpError 404 when conversation does not exist", async () => {
    const convService = makeConversationService();
    convService.getConversation.mockReturnValue(null);
    const svc = makeService(convService);

    await expect(
      svc.handleUserMessage({ conversationId: "missing-id", userMessage: "hello" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── Successful flow ───────────────────────────────────────────────────────

describe("AssistantService.handleUserMessage — successful flow", () => {
  let convService: ReturnType<typeof makeConversationService>;
  let orchestrator: ReturnType<typeof makeOrchestrator>;

  beforeEach(() => {
    convService = makeConversationService();
    orchestrator = makeOrchestrator();
    const conv = makeConversation(1);
    const updatedConv = {
      ...conv,
      messages: [...conv.messages, makeAssistantMessage()],
    };
    convService.getConversation.mockReturnValue(conv);
    convService.addMessagePair.mockReturnValue(updatedConv);
  });

  it("calls orchestrator.processUserMessage once", async () => {
    const svc = makeService(convService, orchestrator);
    await svc.handleUserMessage({ conversationId: "conv-123", userMessage: "show me laptops" });
    expect(orchestrator.processUserMessage).toHaveBeenCalledOnce();
  });

  it("passes trimmed userMessage to the orchestrator", async () => {
    const svc = makeService(convService, orchestrator);
    await svc.handleUserMessage({ conversationId: "conv-123", userMessage: "  laptops  " });
    expect(orchestrator.processUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: "laptops" }),
    );
  });

  it("passes recentMessages with role+content objects to the orchestrator", async () => {
    // Conversation snapshot has 1 user message already
    const conv = makeConversation(1);
    const updatedConv = { ...conv, messages: [...conv.messages, makeAssistantMessage()] };
    convService.getConversation.mockReturnValue(conv);
    convService.addMessagePair.mockReturnValue(updatedConv);

    const svc = makeService(convService, orchestrator);
    await svc.handleUserMessage({ conversationId: "conv-123", userMessage: "show me laptops" });

    const call = orchestrator.processUserMessage.mock.calls[0][0];
    expect(call.recentMessages).toBeDefined();
    // Every element must have role and content
    for (const msg of call.recentMessages) {
      expect(msg).toHaveProperty("role");
      expect(msg).toHaveProperty("content");
      expect(["user", "assistant"]).toContain(msg.role);
    }
  });

  it("returns conversation and products in the response", async () => {
    const svc = makeService(convService, orchestrator);
    const result = await svc.handleUserMessage({
      conversationId: "conv-123",
      userMessage: "show me laptops",
    });
    expect(result).toHaveProperty("conversation");
    expect(result).toHaveProperty("products");
  });
});

// ── Conversation title update ─────────────────────────────────────────────

describe("AssistantService.handleUserMessage — conversation title update", () => {
  function setupConvService(userMessages: number) {
    const convService = makeConversationService();
    const conv = makeConversation(userMessages);
    const updatedConv = { ...conv, messages: [...conv.messages, makeAssistantMessage()] };
    convService.getConversation.mockReturnValue(conv);
    convService.addMessagePair.mockReturnValue(updatedConv);
    return convService;
  }

  it("updates title on the FIRST user message (pre-add snapshot has 0 user messages)", async () => {
    const convService = setupConvService(0);
    const svc = makeService(convService);

    await svc.handleUserMessage({
      conversationId: "conv-123",
      userMessage: "looking for a gift",
    });

    expect(convService.generateTitleFromMessage).toHaveBeenCalledWith("looking for a gift");
    expect(convService.updateTitle).toHaveBeenCalledWith("conv-123", "Test chat title");
  });

  it("does NOT update title on the second user message (pre-add snapshot has 1 user message)", async () => {
    const convService = setupConvService(1);
    const svc = makeService(convService);

    await svc.handleUserMessage({
      conversationId: "conv-123",
      userMessage: "under $100",
    });

    expect(convService.updateTitle).not.toHaveBeenCalled();
  });

  it("does NOT update title when it is already set (title !== 'New chat')", async () => {
    const convService = makeConversationService();
    const conv = { ...makeConversation(0), title: "Looking for a gift" };
    const updatedConv = { ...conv, messages: [makeAssistantMessage()] };
    convService.getConversation.mockReturnValue(conv);
    convService.addMessagePair.mockReturnValue(updatedConv);

    const svc = makeService(convService);
    await svc.handleUserMessage({
      conversationId: "conv-123",
      userMessage: "for my wife",
    });

    expect(convService.updateTitle).not.toHaveBeenCalled();
  });
});
