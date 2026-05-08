import { describe, it, expect } from "vitest";
import { mentionsGroundedProduct } from "../assistantUtils.js";
import type { ProductCard } from "../../products/product.types.js";

/** Minimal ProductCard fixture — only fields required by the type. */
function makeProduct(id: number, title: string): ProductCard {
  return {
    id,
    title,
    description: "test",
    price: 50,
    discountPercentage: 0,
    rating: 4,
    stock: 10,
    availabilityStatus: "In Stock",
    category: "beauty",
    thumbnail: "https://example.com/img.jpg",
  };
}

const products: ProductCard[] = [
  makeProduct(1, "Chanel No. 5 Eau de Parfum"),
  makeProduct(2, "Ergonomic Office Chair Pro"),
];

describe("mentionsGroundedProduct — passing cases", () => {
  it("returns true when response mentions an exact product title", () => {
    expect(
      mentionsGroundedProduct(
        "I recommend the Chanel No. 5 Eau de Parfum — it would make a lovely gift.",
        products,
      ),
    ).toBe(true);
  });

  it("returns true with case-insensitive matching", () => {
    expect(
      mentionsGroundedProduct("the chanel no. 5 eau de parfum is a great choice.", products),
    ).toBe(true);
  });

  it("returns true for the second product in the list", () => {
    expect(
      mentionsGroundedProduct("The Ergonomic Office Chair Pro fits your budget.", products),
    ).toBe(true);
  });

  it("returns true when product title is embedded mid-sentence", () => {
    expect(
      mentionsGroundedProduct("For your home office, Ergonomic Office Chair Pro is ideal.", products),
    ).toBe(true);
  });
});

describe("mentionsGroundedProduct — failing cases (hallucination blocked)", () => {
  it("returns false for a fully hallucinated product not in the list", () => {
    expect(
      mentionsGroundedProduct("I recommend the Dyson Hair Dryer — excellent quality.", products),
    ).toBe(false);
  });

  it("returns false when response mentions a product from a previous conversation not in current list", () => {
    expect(
      mentionsGroundedProduct("The Samsung Galaxy S24 would be perfect.", products),
    ).toBe(false);
  });

  it("returns true for generic advisory text with no product-name patterns", () => {
    // Generic text has no TitleCase multi-word sequences → treated as safe advice,
    // not a hallucination. The grounding guard passes it through.
    expect(
      mentionsGroundedProduct("Here are some great options for your budget.", products),
    ).toBe(true);
  });

  it("returns false for an empty response string", () => {
    expect(mentionsGroundedProduct("", products)).toBe(false);
  });
});

describe("mentionsGroundedProduct — whitespace normalisation", () => {
  it("matches product title that has extra internal spaces in response", () => {
    const prods = [makeProduct(3, "Office Chair Pro")];
    expect(
      mentionsGroundedProduct("The Office  Chair  Pro is a solid pick.", prods),
    ).toBe(true);
  });
});

describe("mentionsGroundedProduct — empty product list", () => {
  it("returns false when products array is empty", () => {
    expect(mentionsGroundedProduct("Great options here.", [])).toBe(false);
  });
});
