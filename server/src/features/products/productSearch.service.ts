import { DummyJsonClient } from "./dummyJson.client.js";
import { ProductNormalizer } from "./productNormalizer.js";
import type { ProductSearchParams, ProductSearchResult, ProductCard } from "./product.types.js";
import type { ProductRetrievalStrategy } from "./retrieval/productRetrievalStrategy.js";
import { LightweightSemanticRetrievalStrategy } from "./retrieval/lightweightSemanticRetrievalStrategy.js";

export class ProductSearchService {
  private client: DummyJsonClient;
  private retrievalStrategy: ProductRetrievalStrategy;

  constructor() {
    this.client = new DummyJsonClient();
    this.retrievalStrategy = new LightweightSemanticRetrievalStrategy();
  }

  async getProductById(id: number): Promise<ProductCard> {
    try {
      const rawProduct = await this.client.fetchProductById(id);
      return ProductNormalizer.toProductCard(rawProduct);
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        throw new Error("Product not found");
      }
      throw new Error("Failed to fetch product details");
    }
  }

  async searchProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    try {
      const retrievalParams = {
        query: params.query,
        category: params.category,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        sortBy: params.sortBy,
        limit: params.limit || 6,
        skip: 0,
      };

      return await this.retrievalStrategy.search(retrievalParams);
    } catch (error) {
      console.error("Product search failed:", error);
      throw new Error("Failed to search products");
    }
  }


}