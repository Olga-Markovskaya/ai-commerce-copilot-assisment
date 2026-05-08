import { DummyJsonClient } from "../dummyJson.client.js";
import { ProductNormalizer } from "../productNormalizer.js";
import type { ProductCard } from "../product.types.js";
import type { ProductRetrievalParams, ProductRetrievalResult, ProductRetrievalStrategy } from "./productRetrievalStrategy.js";
import { byRatingDescIdAsc, byPriceAscIdAsc, byPriceDescIdAsc } from "./sortComparators.js";

/**
 * DummyJSON-based retrieval strategy.
 *
 * Fetches a candidate pool from the DummyJSON API (larger than the final
 * limit), then applies local price and availability filters before sorting
 * and paginating. The pool is necessary because DummyJSON does not expose
 * price-range or availability query parameters — filtering must happen locally
 * against the returned set.
 */
export class DummyJsonRetrievalStrategy implements ProductRetrievalStrategy {
  private client: DummyJsonClient;

  constructor(client?: DummyJsonClient) {
    this.client = client ?? new DummyJsonClient();
  }

  async search(params: ProductRetrievalParams): Promise<ProductRetrievalResult> {
    try {
      let products: ProductCard[] = [];
      let searchStrategy = "";

      // Determine search strategy
      if (params.category) {
        try {
          // Search by category
          searchStrategy = `category: ${params.category}`;
          const response = await this.client.fetchProductsByCategory(params.category, {
            limit: 20, // Pool larger than final limit; local filters shrink it further
          });
          products = ProductNormalizer.toProductCards(response.products);
        } catch (categoryError) {
          console.log(`⚠️ Category '${params.category}' not found, falling back to text search`);
          // If category fails, fall back to text search with cleaned query
          if (params.query) {
            searchStrategy = `text query (category fallback): "${params.query}"`;
            const response = await this.client.searchProducts({
              q: params.query,
              limit: 20,
            });
            products = ProductNormalizer.toProductCards(response.products);
          } else {
            // Search for the category name as text
            searchStrategy = `text search for category name: "${params.category}"`;
            const response = await this.client.searchProducts({
              q: params.category,
              limit: 20,
            });
            products = ProductNormalizer.toProductCards(response.products);
          }
        }
      } else if (params.query) {
        // Text search
        searchStrategy = `text query: "${params.query}"`;
        const response = await this.client.searchProducts({
          q: params.query,
          limit: 20,
        });
        products = ProductNormalizer.toProductCards(response.products);
      } else {
        // Fallback to general products
        searchStrategy = "general products (no category/query)";
        const response = await this.client.fetchProducts({ limit: 20 });
        products = ProductNormalizer.toProductCards(response.products);
      }

      // Apply local filters
      const beforeFilterCount = products.length;
      products = this.applyFilters(products, params);
      
      const priceFilter = params.maxPrice ? ` ≤$${params.maxPrice}` : '';
      console.log(`🛍️ ${searchStrategy} → ${products.length}/${beforeFilterCount} products${priceFilter}`);

      // When a category was requested and products existed in that category but none
      // passed the local filters (price / availability), return empty rather than
      // falling back to a broad unconstrained fetchProducts() call.  A broad
      // fallback drops the category constraint entirely and returns unrelated items
      // (e.g. cheap nail polish or groceries for "gaming laptop under $10").
      // If the category itself was not found (beforeFilterCount === 0) the
      // query-fallback inside the try/catch above already ran a text search.

      // Apply sorting
      products = this.applySorting(products, params.sortBy);

      // Apply pagination
      const limit = params.limit || 6;
      const skip = params.skip || 0;
      const paginatedProducts = products.slice(skip, skip + limit);

      return {
        products: paginatedProducts,
        total: products.length, // Total available after filtering
      };
    } catch (error) {
      console.error("DummyJSON product search failed:", error);
      throw new Error("Failed to search products");
    }
  }

  // Price range and availability are not supported as DummyJSON query params
  // (not in the OpenAPI spec), so they are enforced here against the fetched pool.
  private applyFilters(products: ProductCard[], params: ProductRetrievalParams): ProductCard[] {
    let filtered = products;

    // Price range filter
    if (params.minPrice !== undefined) {
      filtered = filtered.filter(product => product.price >= params.minPrice!);
    }

    if (params.maxPrice !== undefined) {
      filtered = filtered.filter(product => product.price <= params.maxPrice!);
    }

    // Availability filter (only include in-stock items)
    filtered = filtered.filter(product => 
      product.stock > 0 && 
      product.availabilityStatus === "In Stock"
    );

    return filtered;
  }

  private applySorting(products: ProductCard[], sortBy?: string): ProductCard[] {
    const sorted = [...products];

    switch (sortBy) {
      case "price_asc":
        return sorted.sort(byPriceAscIdAsc);
      case "price_desc":
        return sorted.sort(byPriceDescIdAsc);
      case "rating_desc":
        return sorted.sort(byRatingDescIdAsc);
      default:
        // Default: sort by rating descending, id asc as stable tie-breaker
        return sorted.sort(byRatingDescIdAsc);
    }
  }
}