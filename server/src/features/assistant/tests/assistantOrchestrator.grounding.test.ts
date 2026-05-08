/**
 * Grounding integration tests for AssistantOrchestrator.
 *
 * Strategy:
 *  - Inject a mock ProductSearchService → no DummyJSON / network calls.
 *  - Inject a mock OpenAiProvider → no real OpenAI calls.
 *  - Vary the text returned by generateAssistantReply to cover all grounding cases.
 *  - No SQLite required.
 *
 * The grounding guard in handleProductSearch uses `mentionsGroundedProduct`:
 *  - PASS  if response explicitly names a grounded product title
 *  - PASS  if response is generic (no product-name-like TitleCase patterns)
 *  - BLOCK if response contains product-name-like patterns not in the grounded list
 *           → falls back to deterministic rule-based response
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssistantOrchestrator } from "../assistant.orchestrator.js";
import type { ProductSearchService } from "../../products/productSearch.service.js";
import type { OpenAiProvider } from "../../../providers/llm/openAiProvider.js";
import type { ProductCard } from "../../products/product.types.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeProduct(id: number, title: string): ProductCard {
  return {
    id,
    title,
    description: "test product",
    price: 120,
    discountPercentage: 5,
    rating: 4.5,
    stock: 20,
    availabilityStatus: "In Stock",
    category: "sports-accessories",
    thumbnail: "https://example.com/img.jpg",
  };
}

// Current search results (the only products the LLM is allowed to reference)
const CURRENT_PRODUCTS: ProductCard[] = [
  makeProduct(1, "Nike Pegasus 40"),
  makeProduct(2, "Adidas Ultraboost"),
];

// ─── Shared setup ────────────────────────────────────────────────────────────

let mockSearchProducts: ReturnType<typeof vi.fn>;
let mockGenerateAssistantReply: ReturnType<typeof vi.fn>;
let orchestrator: AssistantOrchestrator;

beforeEach(() => {
  mockSearchProducts = vi.fn().mockResolvedValue({
    products: CURRENT_PRODUCTS,
    total: CURRENT_PRODUCTS.length,
  });

  // Default: return a grounded response; individual tests override as needed
  mockGenerateAssistantReply = vi
    .fn()
    .mockResolvedValue(
      "The Nike Pegasus 40 is the standout pick here — excellent cushioning and well-reviewed.",
    );

  const mockProductSearchService = {
    searchProducts: mockSearchProducts,
  } as unknown as ProductSearchService;

  const mockOpenAiProvider = {
    generateAssistantReply: mockGenerateAssistantReply,
    // extractIntent not needed for product recommendation path
  } as unknown as OpenAiProvider;

  orchestrator = new AssistantOrchestrator({
    productSearchService: mockProductSearchService,
    openAiProvider: mockOpenAiProvider,
  });
});

// ─── Helper: trigger the product-search → recommendation path ─────────────────
// "show me" is an IntentClassifier PRODUCT_KEYWORD → guaranteed product_search route
const SEARCH_QUERY = "show me running shoes";

// ─── 1. Grounded recommendation is allowed ────────────────────────────────────

describe("grounded recommendation — passes through unchanged", () => {
  it("response mentioning a grounded product title is returned as-is", async () => {
    mockGenerateAssistantReply.mockResolvedValueOnce(
      "The Nike Pegasus 40 is the standout pick here — excellent cushioning.",
    );

    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: SEARCH_QUERY,
    });

    expect(mockGenerateAssistantReply).toHaveBeenCalledOnce();
    expect(reply.content).toContain("Nike Pegasus 40");
    expect(reply.products).toEqual(CURRENT_PRODUCTS);
  });

  it("response mentioning the second grounded product is also allowed", async () => {
    mockGenerateAssistantReply.mockResolvedValueOnce(
      "Both options are solid but the Adidas Ultraboost edges ahead for long-distance runs.",
    );

    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: SEARCH_QUERY,
    });

    expect(reply.content).toContain("Adidas Ultraboost");
    expect(reply.products).toEqual(CURRENT_PRODUCTS);
  });
});

// ─── 2. Hallucinated product name is blocked ──────────────────────────────────

describe("hallucinated product — blocked, falls back to grounded rule-based response", () => {
  it("response mentioning 'Hoka Clifton 9' (not in current products) is rejected", async () => {
    mockGenerateAssistantReply.mockResolvedValueOnce(
      "I recommend the Hoka Clifton 9 for your training sessions. The Hoka Clifton 9 offers excellent cushioning.",
    );

    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: SEARCH_QUERY,
    });

    // Hallucinated product must not appear in the final response
    expect(reply.content).not.toContain("Hoka Clifton 9");
    // Rule-based fallback still surfaces the real products
    expect(reply.products).toEqual(CURRENT_PRODUCTS);
    // The fallback is deterministic text from AssistantResponseBuilder
    expect(reply.content).toBeTruthy();
  });
});

// ─── 3. Stale product from conversation history is blocked ────────────────────

describe("stale product reference — blocked when not in current search results", () => {
  it("'Adidas Ultraboost' is blocked when current results contain only 'Nike Pegasus 40'", async () => {
    // Override current search results: only Nike Pegasus 40 returned this turn
    mockSearchProducts.mockResolvedValueOnce({
      products: [makeProduct(1, "Nike Pegasus 40")],
      total: 1,
    });

    // LLM tries to reference Adidas Ultraboost from a previous turn
    mockGenerateAssistantReply.mockResolvedValueOnce(
      "The Adidas Ultraboost is the perfect choice based on your preferences.",
    );

    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: SEARCH_QUERY,
    });

    // Stale product reference must not appear
    expect(reply.content).not.toContain("Adidas Ultraboost");
    // Real current product is still attached
    expect(reply.products).toEqual([makeProduct(1, "Nike Pegasus 40")]);
  });
});

// ─── 4. Generic advisory text is allowed ─────────────────────────────────────

describe("generic advisory text — passes through without fallback", () => {
  it("response with no product-name patterns is returned as-is", async () => {
    const genericText = "I found a few good options based on your budget.";
    mockGenerateAssistantReply.mockResolvedValueOnce(genericText);

    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: SEARCH_QUERY,
    });

    // Generic text has no TitleCase product patterns → treated as safe
    expect(reply.content).toBe(genericText);
    expect(reply.products).toEqual(CURRENT_PRODUCTS);
  });

  it("short advisory sentence without product names is passed through", async () => {
    const genericText = "Here are some great options for your budget and preferences.";
    mockGenerateAssistantReply.mockResolvedValueOnce(genericText);

    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: SEARCH_QUERY,
    });

    expect(reply.content).toBe(genericText);
    expect(reply.products).toEqual(CURRENT_PRODUCTS);
  });
});

// ─── 5. Empty product results never reach the grounding guard ─────────────────

describe("empty product results — OpenAI is never called, safe message returned", () => {
  it("returns deterministic no-results message without calling OpenAI", async () => {
    mockSearchProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: SEARCH_QUERY,
    });

    // OpenAI must not be called when there are no products to recommend
    expect(mockGenerateAssistantReply).not.toHaveBeenCalled();
    // No fake product names can appear in the safe fallback message
    expect(reply.content).toMatch(/couldn't find|no products|try/i);
    expect(reply.content).not.toContain("Hoka");
    expect(reply.content).not.toContain("Nike");
    expect(reply.content).not.toContain("Adidas");
    expect(reply.products).toEqual([]);
  });
});
