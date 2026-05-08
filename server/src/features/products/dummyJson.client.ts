import { config } from "../../config/env.js";
import type { RawDummyJsonProduct, RawDummyJsonProductsResponse } from "./product.types.js";

export type DummyJsonFetchParams = {
  limit?: number;
  skip?: number;
  select?: string;
  /** Only forwarded by fetchProducts (GET /products). The spec does not list
   *  sortBy/order on /products/search or /products/category/{slug}. */
  sortBy?: string;
  order?: "asc" | "desc";
};

/**
 * Fields required to populate a ProductCard and support all backend logic:
 *   - id              → deduplication map key, routing
 *   - title           → display, semantic matching (highest weight)
 *   - description     → display, semantic matching, LLM prompt
 *   - category        → display, semantic matching, local availability filter
 *   - price           → display, local price filter, LLM prompt
 *   - discountPercentage → display, price calculation, LLM prompt
 *   - rating          → display, sort comparator, LLM prompt
 *   - stock           → display, local availability filter, LLM prompt
 *   - availabilityStatus → display, local availability filter, LLM prompt
 *   - brand           → display (optional), semantic matching, LLM prompt
 *   - thumbnail       → product card image
 *
 * Applied to list endpoints only. fetchProductById is intentionally unrestricted
 * so the detail page remains free to use any raw field without a code change here.
 */
const PRODUCT_CARD_FIELDS =
  "id,title,description,category,price,discountPercentage,rating,stock,availabilityStatus,brand,thumbnail";

export type DummyJsonSearchParams = DummyJsonFetchParams & {
  q: string;
};

export class DummyJsonClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.dummyJson.baseUrl;
  }

  async fetchProducts(params: DummyJsonFetchParams = {}): Promise<RawDummyJsonProductsResponse> {
    // Handle base URL that may or may not already include /products path
    const baseUrl = this.baseUrl.endsWith('/products') ? this.baseUrl : `${this.baseUrl}/products`;
    const url = new URL(baseUrl);
    
    if (params.limit) url.searchParams.set("limit", params.limit.toString());
    if (params.skip) url.searchParams.set("skip", params.skip.toString());
    url.searchParams.set("select", params.select ?? PRODUCT_CARD_FIELDS);
    if (params.sortBy) url.searchParams.set("sortBy", params.sortBy);
    if (params.order) url.searchParams.set("order", params.order);

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    
    if (!response.ok) {
      throw new Error(`DummyJSON API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<RawDummyJsonProductsResponse>;
  }

  async searchProducts(params: DummyJsonSearchParams): Promise<RawDummyJsonProductsResponse> {
    // Handle base URL that may or may not already include /products path
    const baseUrl = this.baseUrl.endsWith('/products') ? this.baseUrl : `${this.baseUrl}/products`;
    const url = new URL(`${baseUrl}/search`);
    
    url.searchParams.set("q", params.q);
    if (params.limit) url.searchParams.set("limit", params.limit.toString());
    if (params.skip) url.searchParams.set("skip", params.skip.toString());
    url.searchParams.set("select", params.select ?? PRODUCT_CARD_FIELDS);

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    
    if (!response.ok) {
      throw new Error(`DummyJSON API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<RawDummyJsonProductsResponse>;
  }

  async fetchProductsByCategory(category: string, params: DummyJsonFetchParams = {}): Promise<RawDummyJsonProductsResponse> {
    // Handle base URL that may or may not already include /products path
    const baseUrl = this.baseUrl.endsWith('/products') ? this.baseUrl : `${this.baseUrl}/products`;
    const url = new URL(`${baseUrl}/category/${encodeURIComponent(category)}`);
    
    if (params.limit) url.searchParams.set("limit", params.limit.toString());
    if (params.skip) url.searchParams.set("skip", params.skip.toString());
    url.searchParams.set("select", params.select ?? PRODUCT_CARD_FIELDS);

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    
    if (!response.ok) {
      throw new Error(`DummyJSON API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<RawDummyJsonProductsResponse>;
  }

  async fetchProductById(id: number): Promise<RawDummyJsonProduct> {
    // Handle base URL that may or may not already include /products path
    const baseUrl = this.baseUrl.endsWith('/products') ? this.baseUrl : `${this.baseUrl}/products`;
    const url = `${baseUrl}/${id}`;
    
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    
    if (!response.ok) {
      throw new Error(`DummyJSON API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<RawDummyJsonProduct>;
  }
}