import { describe, it, expect } from "vitest";
import { ShoppingIntentAnalyzer } from "../shoppingIntentAnalyzer.js";

const analyzer = new ShoppingIntentAnalyzer();

describe("ShoppingIntentAnalyzer — recipient & occasion extraction", () => {
  it("detects recipient=wife and occasion=gift for 'gift for wife under $100'", () => {
    const result = analyzer.analyze({ userMessage: "gift for wife under $100" });
    expect(result.recipient).toBe("wife");
    expect(result.occasion).toBe("gift");
  });

  it("occasion is birthday (not 'gift') for 'birthday gift for wife under $100'", () => {
    const result = analyzer.analyze({ userMessage: "birthday gift for wife under $100" });
    expect(result.occasion).toBe("birthday");
    expect(result.recipient).toBe("wife");
  });

  it("occasion is anniversary for 'anniversary gift for husband'", () => {
    const result = analyzer.analyze({ userMessage: "anniversary gift for husband" });
    expect(result.occasion).toBe("anniversary");
    expect(result.recipient).toBe("husband");
  });
});

describe("ShoppingIntentAnalyzer — budget extraction", () => {
  it("extracts maxPrice=100 from 'under $100'", () => {
    const result = analyzer.analyze({ userMessage: "gift for wife under $100" });
    expect(result.maxPrice).toBe(100);
  });

  it("extracts maxPrice=500 from 'under 500'", () => {
    const result = analyzer.analyze({ userMessage: "office chair under 500" });
    expect(result.maxPrice).toBe(500);
  });

  it("does not set maxPrice when no budget is mentioned", () => {
    const result = analyzer.analyze({ userMessage: "nail polish" });
    expect(result.maxPrice).toBeUndefined();
  });
});

describe("ShoppingIntentAnalyzer — category detection", () => {
  it("detects furniture for 'office chair under 500'", () => {
    const result = analyzer.analyze({ userMessage: "office chair under 500" });
    expect(result.candidateCategories).toContain("furniture");
  });

  it("detects laptops for 'I need a laptop for work'", () => {
    const result = analyzer.analyze({ userMessage: "I need a laptop for work" });
    expect(result.candidateCategories).toContain("laptops");
  });

  it("detects beauty for 'something for manicure'", () => {
    const result = analyzer.analyze({ userMessage: "something for manicure" });
    expect(result.candidateCategories).toContain("beauty");
  });

  it("detects fragrances for 'perfume for my wife'", () => {
    const result = analyzer.analyze({ userMessage: "perfume for my wife" });
    expect(result.candidateCategories).toContain("fragrances");
  });
});

describe("ShoppingIntentAnalyzer — clarification policy", () => {
  it("needs clarification for bare 'find a gift' (no recipient, no budget)", () => {
    const result = analyzer.analyze({ userMessage: "find a gift" });
    expect(result.needsClarification).toBe(true);
  });

  it("does NOT need clarification for 'gift for wife under $100'", () => {
    const result = analyzer.analyze({ userMessage: "gift for wife under $100" });
    expect(result.needsClarification).toBe(false);
  });

  it("does NOT need clarification for 'something for manicure'", () => {
    const result = analyzer.analyze({ userMessage: "something for manicure" });
    expect(result.needsClarification).toBe(false);
  });
});

describe("ShoppingIntentAnalyzer — non-shopping messages", () => {
  const nonShoppingMessages = ["thanks", "ok", "hello", "great", "bye"];

  it.each(nonShoppingMessages)(
    "'%s' produces no candidate categories and no product terms",
    (msg) => {
      const result = analyzer.analyze({ userMessage: msg });
      expect(result.candidateCategories).toHaveLength(0);
      expect(result.productTerms).toHaveLength(0);
    },
  );

  it.each(nonShoppingMessages)(
    "'%s' does not trigger clarification",
    (msg) => {
      const result = analyzer.analyze({ userMessage: msg });
      expect(result.needsClarification).toBe(false);
    },
  );
});

describe("ShoppingIntentAnalyzer — word-boundary matching prevents false category matches", () => {
  it("'product cards' does not trigger vehicle category ('car' ⊂ 'cards')", () => {
    const result = analyzer.analyze({
      userMessage: "recommend only products that are shown in the product cards",
    });
    expect(result.candidateCategories).not.toContain("vehicle");
  });

  it("'laptop' does not trigger tops category ('top' ⊂ 'laptop')", () => {
    const result = analyzer.analyze({ userMessage: "gaming laptop under $10" });
    expect(result.candidateCategories).not.toContain("tops");
  });

  it("'laptop' still triggers laptops category", () => {
    const result = analyzer.analyze({ userMessage: "gaming laptop under $10" });
    expect(result.candidateCategories).toContain("laptops");
  });

  it("'car' as a standalone word still triggers vehicle category", () => {
    const result = analyzer.analyze({ userMessage: "I need a car" });
    expect(result.candidateCategories).toContain("vehicle");
  });

  it("'top' as a standalone word still triggers tops category", () => {
    const result = analyzer.analyze({ userMessage: "show me a top" });
    expect(result.candidateCategories).toContain("tops");
  });
});

describe("ShoppingIntentAnalyzer — recentMessages context merge", () => {
  it("merges 'gift' + 'for my wife' into gift-for-wife context", () => {
    const result = analyzer.analyze({
      userMessage: "for my wife",
      recentMessages: ["find a gift"],
    });
    expect(result.recipient).toBe("wife");
  });

  it("merges 'gift for wife' + 'under $100' to preserve recipient and add budget", () => {
    const result = analyzer.analyze({
      userMessage: "under $100",
      recentMessages: ["gift for wife"],
    });
    expect(result.maxPrice).toBe(100);
  });
});
