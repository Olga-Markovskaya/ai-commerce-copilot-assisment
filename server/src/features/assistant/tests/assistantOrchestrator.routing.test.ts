/**
 * Routing integration tests for AssistantOrchestrator.
 *
 * Strategy:
 *  - Inject a vi.fn() mock for ProductSearchService → no DummyJSON / network calls.
 *  - Do NOT inject openAiProvider → orchestrator runs in rule-based-only mode,
 *    which is fully deterministic and makes zero OpenAI calls.
 *  - No SQLite — ServiceContainer is never reached because productSearchService
 *    is always supplied in the deps object.
 *
 * Each test group maps to one routing branch of processUserMessage().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssistantOrchestrator } from "../assistant.orchestrator.js";
import type { ProductSearchService } from "../../products/productSearch.service.js";
import type { ProductCard } from "../../products/product.types.js";
import type { RecentMessage } from "../assistant.types.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeProduct(id: number, title: string): ProductCard {
  return {
    id,
    title,
    description: "test product",
    price: 80,
    discountPercentage: 5,
    rating: 4.2,
    stock: 10,
    availabilityStatus: "In Stock",
    category: "beauty",
    thumbnail: "https://example.com/img.jpg",
  };
}

const MOCK_PRODUCTS: ProductCard[] = [
  makeProduct(1, "Floral Eau de Parfum"),
  makeProduct(2, "Velvet Rose Fragrance"),
];

// ─── Shared setup ────────────────────────────────────────────────────────────

let mockSearchProducts: ReturnType<typeof vi.fn>;
let mockProductSearchService: ProductSearchService;
let orchestrator: AssistantOrchestrator;

beforeEach(() => {
  mockSearchProducts = vi.fn().mockResolvedValue({
    products: MOCK_PRODUCTS,
    total: MOCK_PRODUCTS.length,
  });

  mockProductSearchService = {
    searchProducts: mockSearchProducts,
  } as unknown as ProductSearchService;

  // No openAiProvider in deps → rule-based responses only, zero OpenAI calls
  orchestrator = new AssistantOrchestrator({
    productSearchService: mockProductSearchService,
  });
});

// ─── 1. Greeting shortcut (MessagePrecheck) ──────────────────────────────────

describe("greeting shortcut — MessagePrecheck exits before product search", () => {
  it.each(["hi", "hello", "hey"])(
    "'%s' returns a greeting response without calling product search",
    async (msg) => {
      const reply = await orchestrator.processUserMessage({
        conversationId: "c1",
        userMessage: msg,
      });

      expect(reply.content).toBeTruthy();
      expect(mockSearchProducts).not.toHaveBeenCalled();
      expect(reply.products).toBeUndefined();
    },
  );
});

// ─── 2. Acknowledgement shortcut (MessagePrecheck) ───────────────────────────

describe("acknowledgement shortcut — MessagePrecheck exits before product search", () => {
  it.each(["thanks", "thank you", "ok", "cool", "great"])(
    "'%s' returns a response without triggering product search or clarification",
    async (msg) => {
      const reply = await orchestrator.processUserMessage({
        conversationId: "c1",
        userMessage: msg,
      });

      expect(reply.content).toBeTruthy();
      expect(mockSearchProducts).not.toHaveBeenCalled();
      // Acknowledgements must not surface a clarification question
      expect(reply.content).not.toMatch(/^who|^what kind|^could you|^which/i);
    },
  );
});

// ─── 3. Clear product search via IntentClassifier keyword ────────────────────

describe("clear product search — IntentClassifier keyword route", () => {
  it("'show me running shoes under $100' calls searchProducts with maxPrice 100", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "show me running shoes under $100",
    });

    expect(mockSearchProducts).toHaveBeenCalledOnce();
    expect(mockSearchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ maxPrice: 100 }),
    );
    // Rule-based reply attaches the returned products
    expect(reply.products).toEqual(MOCK_PRODUCTS);
  });

  it("'find me laptops under $800' calls searchProducts with maxPrice 800", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "find me laptops under $800",
    });

    expect(mockSearchProducts).toHaveBeenCalledOnce();
    expect(mockSearchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ maxPrice: 800 }),
    );
    expect(reply.products).toEqual(MOCK_PRODUCTS);
  });

  it("returns no-results message when searchProducts returns empty array", async () => {
    mockSearchProducts.mockResolvedValueOnce({ products: [], total: 0 });

    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "show me laptops under $10",
    });

    expect(mockSearchProducts).toHaveBeenCalledOnce();
    // The no-results guard returns products: [] (empty array), not undefined
    expect(reply.products).toEqual([]);
    expect(reply.content).toMatch(/couldn't find|no products|try/i);
  });
});

// ─── 4. Natural shopping intent promoted by intelligence layer ────────────────

describe("natural shopping intent — intelligence layer promotion", () => {
  it("'gift for wife under $100' routes to product search with maxPrice 100", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "gift for wife under $100",
    });

    expect(mockSearchProducts).toHaveBeenCalledOnce();
    expect(mockSearchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ maxPrice: 100 }),
    );
    expect(reply.products).toEqual(MOCK_PRODUCTS);
  });

  it("'nail polish' is promoted to product search by intelligence (beauty category)", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "nail polish",
    });

    // Intelligence detects beauty / nail-related synonyms → promotes to product_search
    expect(mockSearchProducts).toHaveBeenCalledOnce();
    expect(reply.products).toEqual(MOCK_PRODUCTS);
  });

  it("'perfume for my wife' is promoted to product search by intelligence", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "perfume for my wife",
    });

    expect(mockSearchProducts).toHaveBeenCalledOnce();
    expect(reply.products).toEqual(MOCK_PRODUCTS);
  });
});

// ─── 5. Clarification branch ─────────────────────────────────────────────────

describe("clarification branch — intelligence marks query as too vague", () => {
  it("'find a gift' returns clarification question without calling product search", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "find a gift",
    });

    // Intelligence: occasion=gift, no recipient/budget → needsClarification=true
    // IntentClassifier: product_search (has "find") → enhanced clarification overrides
    expect(mockSearchProducts).not.toHaveBeenCalled();
    expect(reply.content).toBeTruthy();
    expect(reply.content).toContain("?");
    expect(reply.products).toBeUndefined();
  });
});

// ─── 6. General chat fallback ─────────────────────────────────────────────────

describe("general chat fallback — no shopping signals", () => {
  it("'what is artificial intelligence' falls through to general chat without product search", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "what is artificial intelligence",
    });

    expect(mockSearchProducts).not.toHaveBeenCalled();
    expect(reply.content).toBeTruthy();
    expect(reply.products).toBeUndefined();
  });

  it("'tell me about yourself' falls through to general chat without product search", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "tell me about yourself",
    });

    expect(mockSearchProducts).not.toHaveBeenCalled();
    expect(reply.content).toBeTruthy();
  });
});

// ─── 7. ProductSearchService failure — stays in shopping scope ────────────────

describe("product search failure — stays in shopping scope", () => {
  it("when searchProducts throws, reply is shopping-scoped (no crash, no products)", async () => {
    mockSearchProducts.mockRejectedValueOnce(new Error("DummyJSON timeout"));

    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "show me laptops",
    });

    // Must not throw and must return a valid AssistantReply
    expect(reply).toBeDefined();
    expect(typeof reply.content).toBe("string");
    // Fallback returns empty products or undefined — never a broken state
    expect(reply.products == null || Array.isArray(reply.products)).toBe(true);
  });
});

// ─── 8. Product-context follow-ups — operate on previous product cards ────────

describe("product-context follow-ups — no fresh search", () => {
  const previousProducts: ProductCard[] = [
    { ...makeProduct(10, "Phone A"), price: 499, rating: 4.1, category: "smartphones" },
    { ...makeProduct(11, "Phone B"), price: 399, rating: 4.8, category: "smartphones" },
    { ...makeProduct(12, "Phone C"), price: 299, rating: 4.3, category: "smartphones" },
  ];

  function makeRecentWithProducts(): RecentMessage[] {
    return [
      { role: "user", content: "Find me a phone under $500" },
      { role: "assistant", content: "Here are some options.", products: previousProducts },
    ];
  }

  it("'Which one has the best rating?' answers from previous products without calling search", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "Which one has the best rating?",
      recentMessages: makeRecentWithProducts(),
    });

    expect(mockSearchProducts).not.toHaveBeenCalled();
    expect(reply.products?.length).toBe(1);
    expect(reply.products?.[0]?.id).toBe(11); // highest rating
    expect(reply.products?.every((p) => previousProducts.some((x) => x.id === p.id))).toBe(true);
  });

  it("'Compare the top 2 options' compares only from previous products without calling search", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "Compare the top 2 options",
      recentMessages: makeRecentWithProducts(),
    });

    expect(mockSearchProducts).not.toHaveBeenCalled();
    expect(reply.products?.length).toBe(2);
    expect(reply.products?.map((p) => p.id)).toEqual([10, 11]); // preserves shown order
  });

  it("chains: best rating (subset) then compare top 2 uses the broader primary set", async () => {
    const recentMessages: RecentMessage[] = [
      { role: "user", content: "Find me a phone under $500" },
      { role: "assistant", content: "Here are some options.", products: previousProducts },
      { role: "user", content: "Which one has the best rating?" },
      {
        role: "assistant",
        content: 'From the products shown above, the highest-rated option is "Phone B".',
        products: [previousProducts[1]!], // subset follow-up
      },
    ];

    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "Compare the top 2 options",
      recentMessages,
    });

    expect(mockSearchProducts).not.toHaveBeenCalled();
    expect(reply.products?.length).toBe(2);
    // Should compare from the original broader set, not the 1-item subset.
    expect(reply.products?.map((p) => p.id)).toEqual([10, 11]);
  });

  it("'Only show the cheapest ones' filters within previous products without calling search", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "Only show the cheapest ones",
      recentMessages: makeRecentWithProducts(),
    });

    expect(mockSearchProducts).not.toHaveBeenCalled();
    expect(reply.products?.length).toBeGreaterThan(0);
    expect(reply.products?.[0]?.id).toBe(12); // cheapest
    expect(reply.products?.every((p) => previousProducts.some((x) => x.id === p.id))).toBe(true);
  });

  it("'Recommend only products that are shown in the product cards' does not trigger clarification or search", async () => {
    const reply = await orchestrator.processUserMessage({
      conversationId: "c1",
      userMessage: "Recommend only products that are shown in the product cards",
      recentMessages: makeRecentWithProducts(),
    });

    expect(mockSearchProducts).not.toHaveBeenCalled();
    expect(reply.content).toMatch(/only use the products shown/i);
    expect(reply.products?.map((p) => p.id)).toEqual(previousProducts.map((p) => p.id));
  });
});
