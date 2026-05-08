import { describe, it, expect } from "vitest";
import { ShoppingIntentEnhancer } from "../shoppingIntentEnhancer.js";

const enhancer = new ShoppingIntentEnhancer();

describe("ShoppingIntentEnhancer — gift scenarios", () => {
  it("gift for wife under $100: no clarification, correct recipient and maxPrice", () => {
    const result = enhancer.enhance({ userMessage: "gift for my wife under $100" });
    expect(result.needsClarification).toBe(false);
    expect(result.analysis.recipient).toBe("wife");
    expect(result.analysis.occasion).toBe("gift");
    expect(result.analysis.maxPrice).toBe(100);
  });

  it("birthday gift for wife under $100: occasion is birthday, not gift", () => {
    const result = enhancer.enhance({ userMessage: "birthday gift for wife under $100" });
    expect(result.needsClarification).toBe(false);
    expect(result.analysis.occasion).toBe("birthday");
    // Confirm the duplicate "gift gift" issue is absent at the analysis level
    expect(result.analysis.occasion).not.toBe("gift gift");
    expect(result.analysis.recipient).toBe("wife");
    expect(result.analysis.maxPrice).toBe(100);
  });

  it("'find a gift' with no context triggers clarification", () => {
    const result = enhancer.enhance({ userMessage: "find a gift" });
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toBeTruthy();
    expect(typeof result.clarificationQuestion).toBe("string");
  });
});

describe("ShoppingIntentEnhancer — product search scenarios", () => {
  it("'nail polish' produces search params without clarification", () => {
    const result = enhancer.enhance({ userMessage: "nail polish" });
    expect(result.needsClarification).toBe(false);
    expect(result.searchParams).toBeDefined();
    expect(result.searchParams?.query).toBeTruthy();
  });

  it("'office chair under 500' produces maxPrice and furniture-related params", () => {
    const result = enhancer.enhance({ userMessage: "office chair under 500" });
    expect(result.needsClarification).toBe(false);
    expect(result.analysis.maxPrice).toBe(500);
    expect(result.analysis.candidateCategories).toContain("furniture");
  });

  it("'I need a laptop for work' detects laptops category", () => {
    const result = enhancer.enhance({ userMessage: "I need a laptop for work" });
    expect(result.analysis.candidateCategories).toContain("laptops");
    expect(result.needsClarification).toBe(false);
  });
});

describe("ShoppingIntentEnhancer — non-shopping messages are not promoted", () => {
  it.each(["thanks", "ok", "hello"])(
    "'%s' produces no candidate categories",
    (msg) => {
      const result = enhancer.enhance({ userMessage: msg });
      expect(result.analysis.candidateCategories).toHaveLength(0);
      expect(result.needsClarification).toBe(false);
    },
  );
});

describe("ShoppingIntentEnhancer — searchParams shape", () => {
  it("returns searchParams with required fields for a concrete query", () => {
    const result = enhancer.enhance({ userMessage: "perfume for my wife" });
    expect(result.searchParams).toBeDefined();
    const p = result.searchParams!;
    expect(typeof p.query).toBe("string");
    expect(p.query.length).toBeGreaterThan(0);
    expect(typeof p.limit).toBe("number");
    expect(p.limit).toBeGreaterThan(0);
  });
});
