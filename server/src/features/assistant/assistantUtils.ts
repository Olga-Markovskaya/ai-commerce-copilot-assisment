import type { ProductCard } from "../products/product.types.js";
import type { BuiltShoppingSearchParams } from "./intelligence/shoppingQueryBuilder.js";

/** Base search params shape produced by IntentClassifier / safeStr+safeNum normalisation. */
export type SearchParamsBase = {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: "price_asc" | "price_desc" | "rating_desc";
  limit: number;
};

/**
 * Merges enhanced intelligence params into the classifier base params.
 * Only overrides fields that are explicitly defined in `enhanced` — prevents
 * `category: undefined` from erasing a valid value found by IntentClassifier.
 */
export function mergeSearchParams(
  base: SearchParamsBase,
  enhanced: BuiltShoppingSearchParams,
): SearchParamsBase {
  return {
    ...base,
    ...(enhanced.query !== undefined ? { query: enhanced.query } : {}),
    ...(enhanced.category !== undefined ? { category: enhanced.category } : {}),
    ...(enhanced.minPrice !== undefined ? { minPrice: enhanced.minPrice } : {}),
    ...(enhanced.maxPrice !== undefined ? { maxPrice: enhanced.maxPrice } : {}),
    limit: enhanced.limit ?? base.limit,
  };
}

/**
 * Recognises product-name-like patterns: a capitalised word (3+ chars) followed
 * by one or more capitalised words or numbers — e.g. "Nike Pegasus 40",
 * "Adidas Ultraboost", "Hoka Clifton 9", "Dyson Hair Dryer".
 * Sentence starters ("Here are…", "I found…") do NOT match because "are",
 * "found", etc. are lowercase.
 */
const PRODUCT_NAME_PATTERN = /\b([A-Z][a-z]{2,})(\s+(?:[A-Z][a-z]{2,}|\d+))+\b/g;

/**
 * Returns true when the LLM response is safe to surface to the user.
 *
 * Three cases:
 *  1. PASS  — response explicitly names at least one grounded product title.
 *  2. PASS  — response contains no product-name-like patterns (generic advice).
 *  3. BLOCK — response contains product-name-like patterns that are NOT in the
 *             grounded list → likely hallucination or stale reference.
 *
 * Empty text and empty products list are always blocked.
 */
export function mentionsGroundedProduct(
  text: string,
  products: ProductCard[],
): boolean {
  if (!text.trim() || products.length === 0) return false;

  const normalizedText = text.toLowerCase().replace(/\s+/g, " ");

  // Fast path: at least one grounded product title appears verbatim → safe
  if (
    products.some((p) =>
      normalizedText.includes(p.title.toLowerCase().replace(/\s+/g, " ")),
    )
  ) {
    return true;
  }

  // Check for product-name-like patterns (TitleCase multi-word sequences)
  const productNameMatches = [...text.matchAll(PRODUCT_NAME_PATTERN)];
  if (productNameMatches.length === 0) {
    // No product-name patterns detected — generic advisory text → safe
    return true;
  }

  // Product-name patterns found but none matched the grounded list → hallucination
  return false;
}
