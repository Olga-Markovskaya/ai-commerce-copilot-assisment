import { describe, it, expect } from "vitest";
import {
  byRatingDescIdAsc,
  byPriceAscIdAsc,
  byPriceDescIdAsc,
  byScoredProductDescIdAsc,
} from "../sortComparators.js";
import type { ProductCard } from "../../product.types.js";

/** Minimal ProductCard fixture. */
function makeProduct(
  id: number,
  overrides: Partial<Pick<ProductCard, "price" | "rating">> = {},
): ProductCard {
  return {
    id,
    title: `Product ${id}`,
    description: "test",
    price: overrides.price ?? 100,
    discountPercentage: 0,
    rating: overrides.rating ?? 4.0,
    stock: 10,
    availabilityStatus: "In Stock",
    category: "beauty",
    thumbnail: "https://example.com/img.jpg",
  };
}

// ─── byRatingDescIdAsc ────────────────────────────────────────────────────────

describe("byRatingDescIdAsc", () => {
  it("higher rating comes first", () => {
    const a = makeProduct(1, { rating: 3.5 });
    const b = makeProduct(2, { rating: 4.8 });
    expect(byRatingDescIdAsc(a, b)).toBeGreaterThan(0); // b before a
    expect(byRatingDescIdAsc(b, a)).toBeLessThan(0);   // b before a
  });

  it("equal ratings: lower id comes first (stable tie-breaker)", () => {
    const a = makeProduct(1, { rating: 4.0 });
    const b = makeProduct(2, { rating: 4.0 });
    expect(byRatingDescIdAsc(a, b)).toBeLessThan(0); // id 1 before id 2
    expect(byRatingDescIdAsc(b, a)).toBeGreaterThan(0);
  });

  it("identical products: comparator returns 0", () => {
    const a = makeProduct(5, { rating: 4.2 });
    expect(byRatingDescIdAsc(a, a)).toBe(0);
  });

  it("sorts an array deterministically", () => {
    const products = [
      makeProduct(3, { rating: 4.0 }),
      makeProduct(1, { rating: 4.0 }),
      makeProduct(2, { rating: 4.5 }),
    ];
    const sorted = [...products].sort(byRatingDescIdAsc);
    expect(sorted.map((p) => p.id)).toEqual([2, 1, 3]);
  });
});

// ─── byPriceAscIdAsc ─────────────────────────────────────────────────────────

describe("byPriceAscIdAsc", () => {
  it("lower price comes first", () => {
    const a = makeProduct(1, { price: 50 });
    const b = makeProduct(2, { price: 200 });
    expect(byPriceAscIdAsc(a, b)).toBeLessThan(0);
    expect(byPriceAscIdAsc(b, a)).toBeGreaterThan(0);
  });

  it("equal prices: lower id comes first", () => {
    const a = makeProduct(1, { price: 100 });
    const b = makeProduct(2, { price: 100 });
    expect(byPriceAscIdAsc(a, b)).toBeLessThan(0);
  });

  it("sorts an array deterministically", () => {
    const products = [
      makeProduct(3, { price: 100 }),
      makeProduct(1, { price: 100 }),
      makeProduct(2, { price: 50 }),
    ];
    const sorted = [...products].sort(byPriceAscIdAsc);
    expect(sorted.map((p) => p.id)).toEqual([2, 1, 3]);
  });
});

// ─── byPriceDescIdAsc ────────────────────────────────────────────────────────

describe("byPriceDescIdAsc", () => {
  it("higher price comes first", () => {
    const a = makeProduct(1, { price: 50 });
    const b = makeProduct(2, { price: 200 });
    expect(byPriceDescIdAsc(a, b)).toBeGreaterThan(0);
    expect(byPriceDescIdAsc(b, a)).toBeLessThan(0);
  });

  it("equal prices: lower id comes first", () => {
    const a = makeProduct(1, { price: 100 });
    const b = makeProduct(2, { price: 100 });
    expect(byPriceDescIdAsc(a, b)).toBeLessThan(0);
  });

  it("sorts an array deterministically", () => {
    const products = [
      makeProduct(3, { price: 100 }),
      makeProduct(1, { price: 200 }),
      makeProduct(2, { price: 100 }),
    ];
    const sorted = [...products].sort(byPriceDescIdAsc);
    expect(sorted.map((p) => p.id)).toEqual([1, 2, 3]);
  });
});

// ─── byScoredProductDescIdAsc ─────────────────────────────────────────────────

describe("byScoredProductDescIdAsc", () => {
  it("higher score comes first", () => {
    const a = { product: makeProduct(1), score: 30 };
    const b = { product: makeProduct(2), score: 80 };
    expect(byScoredProductDescIdAsc(a, b)).toBeGreaterThan(0);
    expect(byScoredProductDescIdAsc(b, a)).toBeLessThan(0);
  });

  it("equal scores: lower product id comes first", () => {
    const a = { product: makeProduct(1), score: 50 };
    const b = { product: makeProduct(2), score: 50 };
    expect(byScoredProductDescIdAsc(a, b)).toBeLessThan(0);
    expect(byScoredProductDescIdAsc(b, a)).toBeGreaterThan(0);
  });

  it("sorts a mixed-score array deterministically", () => {
    const scored = [
      { product: makeProduct(3), score: 50 },
      { product: makeProduct(1), score: 50 },
      { product: makeProduct(2), score: 80 },
    ];
    const sorted = [...scored].sort(byScoredProductDescIdAsc);
    expect(sorted.map((s) => s.product.id)).toEqual([2, 1, 3]);
  });

  it("same product compared to itself returns 0", () => {
    const a = { product: makeProduct(5), score: 40 };
    expect(byScoredProductDescIdAsc(a, a)).toBe(0);
  });
});

// ─── Cross-check: same input always produces the same order ──────────────────

describe("ranking stability — same input, same output", () => {
  it("byRatingDescIdAsc produces identical order on repeated sort calls", () => {
    const products = [
      makeProduct(4, { rating: 3.9 }),
      makeProduct(2, { rating: 4.5 }),
      makeProduct(1, { rating: 4.5 }),
      makeProduct(3, { rating: 3.9 }),
    ];
    const sorted1 = [...products].sort(byRatingDescIdAsc).map((p) => p.id);
    const sorted2 = [...products].sort(byRatingDescIdAsc).map((p) => p.id);
    expect(sorted1).toEqual(sorted2);
    expect(sorted1).toEqual([1, 2, 3, 4]); // rating desc, then id asc
  });
});
