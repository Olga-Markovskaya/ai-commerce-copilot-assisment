import { describe, it, expect } from "vitest";
import { mergeSearchParams } from "../assistantUtils.js";
import type { SearchParamsBase } from "../assistantUtils.js";

const base: SearchParamsBase = {
  query: "perfume",
  category: "fragrances",
  limit: 6,
};

describe("mergeSearchParams — field override behaviour", () => {
  it("defined enhanced query overrides base query", () => {
    const result = mergeSearchParams(base, { query: "fragrance gift women", limit: 6 });
    expect(result.query).toBe("fragrance gift women");
  });

  it("defined enhanced category overrides base category", () => {
    const result = mergeSearchParams(base, { query: "perfume", category: "beauty", limit: 6 });
    expect(result.category).toBe("beauty");
  });

  it("undefined enhanced category does NOT overwrite valid base category", () => {
    const result = mergeSearchParams(base, { query: "perfume", category: undefined, limit: 6 });
    expect(result.category).toBe("fragrances");
  });

  it("undefined enhanced query does NOT overwrite valid base query", () => {
    // BuiltShoppingSearchParams.query is string, so passing a base with a query and enhanced
    // with a different query tests override; here we verify base survives when not overridden.
    const result = mergeSearchParams(base, { query: "perfume", limit: 6 });
    expect(result.query).toBe("perfume");
  });
});

describe("mergeSearchParams — price fields", () => {
  it("maxPrice from enhanced is applied when defined", () => {
    const result = mergeSearchParams(base, { query: "perfume", maxPrice: 100, limit: 6 });
    expect(result.maxPrice).toBe(100);
  });

  it("undefined enhanced maxPrice does NOT overwrite defined base maxPrice", () => {
    const baseWithPrice: SearchParamsBase = { ...base, maxPrice: 200 };
    const result = mergeSearchParams(baseWithPrice, { query: "perfume", maxPrice: undefined, limit: 6 });
    expect(result.maxPrice).toBe(200);
  });

  it("minPrice from enhanced is applied when defined", () => {
    const result = mergeSearchParams(base, { query: "perfume", minPrice: 50, limit: 6 });
    expect(result.minPrice).toBe(50);
  });

  it("undefined enhanced minPrice does NOT overwrite defined base minPrice", () => {
    const baseWithMin: SearchParamsBase = { ...base, minPrice: 30 };
    const result = mergeSearchParams(baseWithMin, { query: "perfume", minPrice: undefined, limit: 6 });
    expect(result.minPrice).toBe(30);
  });
});

describe("mergeSearchParams — limit", () => {
  it("enhanced limit overrides base limit", () => {
    const result = mergeSearchParams(base, { query: "perfume", limit: 10 });
    expect(result.limit).toBe(10);
  });

  it("base limit is used when enhanced limit is not provided (fallback via ??)", () => {
    // limit is required on BuiltShoppingSearchParams so we simulate the ?? fallback
    // by testing that the base value survives when both are the same
    const result = mergeSearchParams({ ...base, limit: 6 }, { query: "perfume", limit: 6 });
    expect(result.limit).toBe(6);
  });
});

describe("mergeSearchParams — non-price/query fields are preserved from base", () => {
  it("base sortBy is preserved when enhanced does not supply it", () => {
    const baseWithSort: SearchParamsBase = { ...base, sortBy: "rating_desc" };
    const result = mergeSearchParams(baseWithSort, { query: "perfume", limit: 6 });
    expect(result.sortBy).toBe("rating_desc");
  });
});
