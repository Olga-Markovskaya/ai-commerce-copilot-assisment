import type { ProductCard } from "../product.types.js";

export interface ProductRetrievalParams {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  limit?: number;
  skip?: number;
}

export interface ProductRetrievalResult {
  products: ProductCard[];
  total: number;
}

export interface ProductRetrievalStrategy {
  search(params: ProductRetrievalParams): Promise<ProductRetrievalResult>;
}