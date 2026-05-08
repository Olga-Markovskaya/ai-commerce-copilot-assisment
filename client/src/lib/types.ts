/**
 * Shared domain types used across more than one feature.
 *
 * Feature-internal types stay co-located with their feature.
 * Only types that would otherwise create cross-feature import coupling live here.
 *
 * ProductCard is shared because:
 *   - the `assistant` feature embeds it in ChatMessage.products
 *   - the `products` feature uses it for the product detail page
 * A shared location breaks the otherwise-required products → assistant
 * (or assistant → products) import dependency.
 */
export type ProductCard = {
  id: number;
  title: string;
  description: string;
  price: number;
  discountPercentage: number;
  rating: number;
  stock: number;
  availabilityStatus: string;
  category: string;
  brand?: string;
  thumbnail: string;
};
