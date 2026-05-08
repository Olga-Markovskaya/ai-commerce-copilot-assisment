import type { ProductCard } from "../product.types.js";

/**
 * Pure sort comparators for ProductCard arrays.
 * Each comparator uses `id` ascending as a stable tie-breaker so that equal
 * primary-key values always resolve to the same deterministic order.
 */

export function byRatingDescIdAsc(a: ProductCard, b: ProductCard): number {
  return b.rating - a.rating || a.id - b.id;
}

export function byPriceAscIdAsc(a: ProductCard, b: ProductCard): number {
  return a.price - b.price || a.id - b.id;
}

export function byPriceDescIdAsc(a: ProductCard, b: ProductCard): number {
  return b.price - a.price || a.id - b.id;
}

/** Comparator for scored-product tuples produced by LightweightSemanticRetrievalStrategy. */
export function byScoredProductDescIdAsc(
  a: { product: ProductCard; score: number },
  b: { product: ProductCard; score: number },
): number {
  return b.score - a.score || a.product.id - b.product.id;
}
