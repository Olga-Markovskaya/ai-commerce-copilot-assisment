import { DummyJsonClient } from "../dummyJson.client.js";
import { ProductNormalizer } from "../productNormalizer.js";
import type { ProductCard } from "../product.types.js";
import type { ProductRetrievalParams, ProductRetrievalResult, ProductRetrievalStrategy } from "./productRetrievalStrategy.js";
import { byRatingDescIdAsc, byPriceAscIdAsc, byPriceDescIdAsc } from "./sortComparators.js";

/** Uses DummyJSON as a candidate pool; price/availability filters are local. */
export class DummyJsonRetrievalStrategy implements ProductRetrievalStrategy {
  private client: DummyJsonClient;

  constructor(client?: DummyJsonClient) {
    this.client = client ?? new DummyJsonClient();
  }

  async search(params: ProductRetrievalParams): Promise<ProductRetrievalResult> {
    try {
      let products: ProductCard[] = [];
      let searchStrategy = "";

      if (params.category) {
        try {
          searchStrategy = `category: ${params.category}`;
          const response = await this.client.fetchProductsByCategory(params.category, {
            limit: 20,
          });
          products = ProductNormalizer.toProductCards(response.products);
        } catch (categoryError) {
          console.log(`⚠️ Category '${params.category}' not found, falling back to text search`);
          if (params.query) {
            searchStrategy = `text query (category fallback): "${params.query}"`;
            const response = await this.client.searchProducts({
              q: params.query,
              limit: 20,
            });
            products = ProductNormalizer.toProductCards(response.products);
          } else {
            searchStrategy = `text search for category name: "${params.category}"`;
            const response = await this.client.searchProducts({
              q: params.category,
              limit: 20,
            });
            products = ProductNormalizer.toProductCards(response.products);
          }
        }
      } else if (params.query) {
        searchStrategy = `text query: "${params.query}"`;
        const response = await this.client.searchProducts({
          q: params.query,
          limit: 20,
        });
        products = ProductNormalizer.toProductCards(response.products);
      } else {
        searchStrategy = "general products (no category/query)";
        const response = await this.client.fetchProducts({ limit: 20 });
        products = ProductNormalizer.toProductCards(response.products);
      }

      const beforeFilterCount = products.length;
      products = this.applyFilters(products, params);
      
      const priceFilter = params.maxPrice ? ` ≤$${params.maxPrice}` : '';
      console.log(`🛍️ ${searchStrategy} → ${products.length}/${beforeFilterCount} products${priceFilter}`);

      products = this.applySorting(products, params.sortBy);

      const limit = params.limit || 6;
      const skip = params.skip || 0;
      const paginatedProducts = products.slice(skip, skip + limit);

      return {
        products: paginatedProducts,
        total: products.length,
      };
    } catch (error) {
      console.error("DummyJSON product search failed:", error);
      throw new Error("Failed to search products");
    }
  }

  private applyFilters(products: ProductCard[], params: ProductRetrievalParams): ProductCard[] {
    let filtered = products;

    if (params.minPrice !== undefined) {
      filtered = filtered.filter(product => product.price >= params.minPrice!);
    }

    if (params.maxPrice !== undefined) {
      filtered = filtered.filter(product => product.price <= params.maxPrice!);
    }

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
        return sorted.sort(byRatingDescIdAsc);
    }
  }
}