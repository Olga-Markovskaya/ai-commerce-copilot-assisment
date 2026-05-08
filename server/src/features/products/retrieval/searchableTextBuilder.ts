import type { ProductCard } from "../product.types.js";

export function buildSearchableText(product: ProductCard): string {
  const parts: string[] = [];

  if (product.title) parts.push(product.title);
  if (product.brand) parts.push(product.brand);
  if (product.category) parts.push(product.category);
  if (product.description) parts.push(product.description);

  return parts
    .join(' ')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}