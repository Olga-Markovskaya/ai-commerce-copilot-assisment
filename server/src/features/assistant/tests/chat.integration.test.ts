/**
 * HTTP integration tests for POST /api/chat.
 *
 * These tests exercise the full Express stack through supertest:
 *   request → CORS → helmet → json parser → rate limiter
 *   → chat router → ChatController → AssistantService → AssistantOrchestrator
 *
 * SQLite and the real ServiceContainer are mocked at the module level so no
 * database is opened and no real OpenAI / DummyJSON calls are made.
 *
 * Covered:
 *  - Missing conversationId   → 400 from Express route
 *  - Missing userMessage      → 400 from Express route
 *  - userMessage too long     → 400 from service-level guard
 *  - Unknown conversationId   → 404 from service-level lookup
 *  - Valid request            → 200 with correct JSON shape
 *  - Error body never leaks internal stack traces
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

// ── SQLite mock — prevents real DB file creation at module load ───────────
vi.mock("../../../db/sqlite.js", () => ({
  db: {
    prepare: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue(null),
      all: vi.fn().mockReturnValue([]),
      run: vi.fn(),
    }),
    exec: vi.fn(),
    pragma: vi.fn(),
  },
}));

// ── Shared controllable mock functions ────────────────────────────────────
const mockGetConversation = vi.fn();
const mockAddMessagePair = vi.fn();
const mockUpdateTitle = vi.fn();
const mockGenerateTitleFromMessage = vi.fn().mockReturnValue("Test title");
const mockProcessUserMessage = vi.fn();

// ── ServiceContainer mock — provides mock services to controllers ─────────
vi.mock("../../../services/serviceContainer.js", () => ({
  ServiceContainer: {
    getConversationService: vi.fn(() => ({
      getConversation: mockGetConversation,
      addMessagePair: mockAddMessagePair,
      updateTitle: mockUpdateTitle,
      generateTitleFromMessage: mockGenerateTitleFromMessage,
    })),
    getProductSearchService: vi.fn(() => ({})),
    getAssistantOrchestrator: vi.fn(() => ({
      processUserMessage: mockProcessUserMessage,
    })),
  },
}));

// ── Import app AFTER mocks are registered ─────────────────────────────────
import { createApp } from "../../../app.js";

const app = createApp();

// ── Fixture builders ──────────────────────────────────────────────────────

function makeConversation(title = "New chat") {
  return {
    id: "conv-abc",
    title,
    messages: [] as Array<{ id: string; role: string; content: string; createdAt: string }>,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeAssistantMessage(content = "Here are some options for you.") {
  return {
    id: "msg-assistant",
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("POST /api/chat — HTTP integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy-path orchestrator response (overridden per-test when needed)
    mockProcessUserMessage.mockResolvedValue({
      content: "Here are some options for you.",
      products: [],
    });
  });

  // ── 400 — missing fields ────────────────────────────────────────────────

  it("returns 400 when conversationId is missing", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ userMessage: "show me laptops" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).not.toContain("stack"); // no internal leakage
  });

  it("returns 400 when userMessage is missing", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ conversationId: "conv-abc" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when userMessage is whitespace only", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ conversationId: "conv-abc", userMessage: "   " });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when userMessage exceeds 2000 characters", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ conversationId: "conv-abc", userMessage: "x".repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(typeof res.body.error).toBe("string");
  });

  // ── 404 — unknown conversation ──────────────────────────────────────────

  it("returns 404 when conversation does not exist", async () => {
    mockGetConversation.mockReturnValue(null);

    const res = await request(app)
      .post("/api/chat")
      .send({ conversationId: "no-such-id", userMessage: "hello" });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  // ── 200 — happy path ────────────────────────────────────────────────────

  it("returns 200 with correct response shape for a valid request", async () => {
    const conv = makeConversation("Existing chat");
    const assistantMsg = makeAssistantMessage("Here are some options for you.");
    const finalConv = { ...conv, messages: [assistantMsg] };

    mockGetConversation.mockReturnValue(conv);
    mockAddMessagePair.mockReturnValue(finalConv);

    const res = await request(app)
      .post("/api/chat")
      .send({ conversationId: "conv-abc", userMessage: "show me laptops" });

    expect(res.status).toBe(200);

    // Top-level shape
    expect(res.body).toHaveProperty("conversation");
    expect(res.body).toHaveProperty("assistantMessage");
    expect(res.body).toHaveProperty("products");

    // Conversation id matches what was looked up
    expect(res.body.conversation.id).toBe("conv-abc");

    // Assistant message has the expected content from our mock
    expect(res.body.assistantMessage.role).toBe("assistant");
    expect(res.body.assistantMessage.content).toBe("Here are some options for you.");

    // Products is an array (empty in this mock)
    expect(Array.isArray(res.body.products)).toBe(true);

    // No raw error or stack trace in response
    expect(res.body).not.toHaveProperty("error");
    expect(JSON.stringify(res.body)).not.toContain("stack");
  });

  it("calls the orchestrator exactly once for a valid request", async () => {
    const conv = makeConversation();
    const assistantMsg = makeAssistantMessage();
    const finalConv = { ...conv, messages: [assistantMsg] };

    mockGetConversation.mockReturnValue(conv);
    mockAddMessagePair.mockReturnValue(finalConv);

    await request(app)
      .post("/api/chat")
      .send({ conversationId: "conv-abc", userMessage: "looking for a gift" });

    expect(mockProcessUserMessage).toHaveBeenCalledOnce();
    expect(mockProcessUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: "looking for a gift" }),
    );
  });

  it("does not expose internal error details in error responses", async () => {
    // Force an unexpected internal error
    mockGetConversation.mockImplementation(() => {
      throw new Error("DB connection dropped");
    });

    const res = await request(app)
      .post("/api/chat")
      .send({ conversationId: "conv-abc", userMessage: "hello" });

    expect(res.status).toBe(500);
    // asyncHandler must return a generic message, not the raw error
    expect(res.body.error).toBe("Internal server error");
    expect(JSON.stringify(res.body)).not.toContain("DB connection dropped");
  });
});
