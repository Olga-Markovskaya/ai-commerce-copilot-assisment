import type { ProductCard } from "../product.types.js";

/**
 * Creates searchable text from a ProductCard for semantic matching.
 * Combines title, brand, category, description, and tags into normalized lowercase text.
 */
export function buildSearchableText(product: ProductCard): string {
  const parts: string[] = [];
  
  // Add title (most important)
  if (product.title) {
    parts.push(product.title);
  }
  
  // Add brand
  if (product.brand) {
    parts.push(product.brand);
  }
  
  // Add category
  if (product.category) {
    parts.push(product.category);
  }
  
  // Add description
  if (product.description) {
    parts.push(product.description);
  }
  
  // Note: ProductCard doesn't include tags, but we could access them
  // from the raw product data if needed in the future
  
  // Join, normalize, and clean up
  return parts
    .join(' ')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace special chars with spaces
    .replace(/\s+/g, ' ')     // Collapse multiple spaces
    .trim();
}