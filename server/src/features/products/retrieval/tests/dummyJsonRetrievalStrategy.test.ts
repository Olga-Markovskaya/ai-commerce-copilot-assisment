/**
 * Unit tests for DummyJsonRetrievalStrategy.
 *
 * Uses an injected mock DummyJsonClient — no network calls, no DummyJSON API.
 *
 * Key invariants tested:
 *   1. When category + price filter yields zero results, the broad fetchProducts
 *      fallback must NOT fire (it would return unrelated cheap products).
 *   2. Local price and availability filters are always applied.
 *   3. Text-query path delegates to searchProducts with the correct q param.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DummyJsonRetrievalStrategy } from "../dummyJsonRetrievalStrategy.js";
import type { DummyJsonClient } from "../../dummyJson.client.js";
import type { RawDummyJsonProduct, RawDummyJsonProductsResponse } from "../../product.types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<RawDummyJsonProduct> = {}): RawDummyJsonProduct {
  return {
    id: 1,
    title: "Test Product",
    description: "A test product",
    category: "laptops",
    price: 999,
    discountPercentage: 0,
    rating: 4.0,
    stock: 10,
    tags: [],
    brand: "TestBrand",
    sku: "TEST-001",
    weight: 2,
    dimensions: { width: 30, height: 20, depth: 2 },
    warrantyInformation: "1 year",
    shippingInformation: "Standard",
    availabilityStatus: "In Stock",
    reviews: [],
    returnPolicy: "30 days",
    minimumOrderQuantity: 1,
    meta: { createdAt: "", updatedAt: "", barcode: "", qrCode: "" },
    images: [],
    thumbnail: "https://example.com/img.jpg",
    ...overrides,
  };
}

function makeResponse(products: RawDummyJsonProduct[]): RawDummyJsonProductsResponse {
  return { products, total: products.length, skip: 0, limit: products.length };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let mockClient: DummyJsonClient;
let strategy: DummyJsonRetrievalStrategy;

beforeEach(() => {
  mockClient = {
    fetchProducts: vi.fn(),
    searchProducts: vi.fn(),
    fetchProductsByCategory: vi.fn(),
    fetchProductById: vi.fn(),
  } as unknown as DummyJsonClient;

  strategy = new DummyJsonRetrievalStrategy(mockClient);
});

// ─── 1. Category + price filter — no broad fallback ───────────────────────────

describe("category + price constraint yields no results — broad fallback must NOT fire", () => {
  it("returns empty when category products exist but none satisfy maxPrice", async () => {
    (mockClient.fetchProductsByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse([
        makeRaw({ id: 1, price: 999, title: "Dell XPS 15" }),
        makeRaw({ id: 2, price: 1299, title: "MacBook Pro" }),
      ]),
    );

    const result = await strategy.search({ category: "laptops", maxPrice: 10, limit: 6 });

    expect(result.products).toHaveLength(0);
    // The broad fetchProducts call must not happen — it would return cheap nail polish, food, etc.
    expect(mockClient.fetchProducts).not.toHaveBeenCalled();
  });

  it("returns empty when category products exist but none pass availability filter", async () => {
    (mockClient.fetchProductsByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse([
        makeRaw({ id: 1, price: 5, stock: 0, availabilityStatus: "Out of Stock" }),
      ]),
    );

    const result = await strategy.search({ category: "laptops", maxPrice: 10, limit: 6 });

    expect(result.products).toHaveLength(0);
    expect(mockClient.fetchProducts).not.toHaveBeenCalled();
  });

  it("does not return products from unrelated categories when specific category + price yields nothing", async () => {
    // Laptops exist but at $999 — category endpoint returns them, price filter removes them
    (mockClient.fetchProductsByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse([makeRaw({ id: 1, price: 999, category: "laptops" })]),
    );

    const result = await strategy.search({ category: "laptops", maxPrice: 10, limit: 6 });

    // Must return empty — not beauty, groceries, or any other category
    expect(result.products).toHaveLength(0);
    expect(mockClient.fetchProducts).not.toHaveBeenCalled();
  });
});

// ─── 2. Category-only search (no price filter) ───────────────────────────────

describe("category-only search — local availability filter applied", () => {
  it("returns only in-stock products", async () => {
    (mockClient.fetchProductsByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse([
        makeRaw({ id: 1, stock: 10, availabilityStatus: "In Stock", price: 50 }),
        makeRaw({ id: 2, stock: 0, availabilityStatus: "Out of Stock", price: 30 }),
      ]),
    );

    const result = await strategy.search({ category: "laptops", limit: 6 });

    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe(1);
  });

  it("fetchProducts is NOT called when category search succeeds", async () => {
    (mockClient.fetchProductsByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse([makeRaw({ id: 1, price: 50 })]),
    );

    await strategy.search({ category: "laptops", limit: 6 });

    expect(mockClient.fetchProducts).not.toHaveBeenCalled();
  });
});

// ─── 3. Text query path ───────────────────────────────────────────────────────

describe("text query search — searchProducts is called with q", () => {
  it("passes query string as q param", async () => {
    (mockClient.searchProducts as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse([makeRaw({ id: 1, price: 50, title: "Gaming Laptop" })]),
    );

    await strategy.search({ query: "gaming laptop", limit: 6 });

    expect(mockClient.searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ q: "gaming laptop" }),
    );
  });

  it("applies price filter locally after fetching text search results", async () => {
    (mockClient.searchProducts as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse([
        makeRaw({ id: 1, price: 9, title: "Budget Item" }),
        makeRaw({ id: 2, price: 50, title: "Mid Item" }),
      ]),
    );

    const result = await strategy.search({ query: "laptop", maxPrice: 10, limit: 6 });

    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe(1);
  });
});

// ─── 4. General fallback (no query, no category) ─────────────────────────────

describe("general fallback when neither query nor category is provided", () => {
  it("calls fetchProducts and returns in-stock results", async () => {
    (mockClient.fetchProducts as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse([makeRaw({ id: 1, price: 50 })]),
    );

    const result = await strategy.search({ limit: 6 });

    expect(mockClient.fetchProducts).toHaveBeenCalledOnce();
    expect(result.products).toHaveLength(1);
  });
});
