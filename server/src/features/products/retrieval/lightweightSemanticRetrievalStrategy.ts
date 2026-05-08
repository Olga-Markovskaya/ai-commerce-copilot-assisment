import type { ProductCard } from "../product.types.js";
import type { ProductRetrievalParams, ProductRetrievalResult, ProductRetrievalStrategy } from "./productRetrievalStrategy.js";
import { DummyJsonRetrievalStrategy } from "./dummyJsonRetrievalStrategy.js";
import { extractSemanticHints, scoreProductForQuery } from "./semanticMatcher.js";
import {
  byScoredProductDescIdAsc,
  byPriceAscIdAsc,
  byPriceDescIdAsc,
  byRatingDescIdAsc,
} from "./sortComparators.js";

/**
 * Lightweight semantic retrieval strategy.
 * Uses DummyJSON as the data source but adds semantic matching and reranking.
 */
export class LightweightSemanticRetrievalStrategy implements ProductRetrievalStrategy {
  private dummyJsonStrategy: DummyJsonRetrievalStrategy;

  constructor() {
    this.dummyJsonStrategy = new DummyJsonRetrievalStrategy();
  }

  async search(params: ProductRetrievalParams): Promise<ProductRetrievalResult> {
    try {
      // If no query, just use the DummyJSON strategy directly
      if (!params.query?.trim()) {
        return await this.dummyJsonStrategy.search(params);
      }

      const query = params.query.trim();
      console.log(`🧠 Semantic search for: "${query}"`);

      // Extract semantic hints from the query
      const semanticHints = extractSemanticHints(query);
      const { expandedTerms, maxPrice } = semanticHints;

      // Override maxPrice if extracted from query (e.g., "under 100")
      const effectiveParams = {
        ...params,
        maxPrice: maxPrice || params.maxPrice
      };

      // Collect products from multiple search strategies
      const allProducts = new Map<number, ProductCard>();

      // 1. Direct query search
      try {
        const directResults = await this.dummyJsonStrategy.search({
          ...effectiveParams,
          limit: 30 // Fetch more for better reranking
        });
        
        for (const product of directResults.products) {
          allProducts.set(product.id, product);
        }
        console.log(`🔍 Direct search: ${directResults.products.length} products`);
      } catch (error) {
        console.log("⚠️ Direct search failed:", error);
      }

      // 2 + 3. Run expanded-term and category searches concurrently.
      //   All calls are independent — they share no state and results are merged
      //   into the same Map which is safe here because we await all of them before
      //   reading the Map in step 4.
      const candidateTerms = this.selectBestCandidateTerms(expandedTerms, query);
      const detectedCategory = this.detectCategory(expandedTerms);

      const secondarySearches: Promise<void>[] = [
        // Expanded term searches (up to 5 terms)
        ...candidateTerms
          .filter(term => term !== query.toLowerCase())
          .map(term =>
            this.dummyJsonStrategy
              .search({ ...effectiveParams, query: term, limit: 20 })
              .then(results => {
                for (const product of results.products) allProducts.set(product.id, product);
                console.log(`🔍 Expanded search "${term}": ${results.products.length} products`);
              })
              .catch((err: unknown) => console.log(`⚠️ Expanded search for "${term}" failed:`, err)),
          ),

        // Category-based fallback (1 additional call, only if a category was detected)
        ...(detectedCategory && !params.category
          ? [
              this.dummyJsonStrategy
                .search({ ...effectiveParams, category: detectedCategory, limit: 20 })
                .then(results => {
                  for (const product of results.products) allProducts.set(product.id, product);
                  console.log(`🏷️ Category search "${detectedCategory}": ${results.products.length} products`);
                })
                .catch((err: unknown) => console.log(`⚠️ Category search for "${detectedCategory}" failed:`, err)),
            ]
          : []),
      ];

      await Promise.allSettled(secondarySearches);

      // Convert map to array and score all products
      const candidateProducts = Array.from(allProducts.values());
      const scoredProducts = candidateProducts.map(product => ({
        product,
        score: scoreProductForQuery(product, query)
      }));

      console.log(`🧠 Semantic analysis: ${candidateProducts.length} unique products to score`);

      // Sort by semantic relevance score (descending), with id asc as stable tie-breaker
      scoredProducts.sort(byScoredProductDescIdAsc);

      // Apply original sorting if semantic scores are tied or if sortBy is specified
      let sortedProducts = scoredProducts.map(item => item.product);
      if (params.sortBy && params.sortBy !== 'relevance') {
        sortedProducts = this.applySorting(sortedProducts, params.sortBy);
      }

      // Apply pagination
      const limit = params.limit || 6;
      const skip = params.skip || 0;
      const paginatedProducts = sortedProducts.slice(skip, skip + limit);

      console.log(`🎯 Final results: ${paginatedProducts.length}/${sortedProducts.length} products`);

      return {
        products: paginatedProducts,
        total: sortedProducts.length
      };

    } catch (error) {
      console.error("Semantic product search failed:", error);
      // Fallback to basic DummyJSON strategy
      console.log("🔁 Falling back to basic search...");
      return await this.dummyJsonStrategy.search(params);
    }
  }

  /**
   * Select the most relevant candidate terms for expansion to avoid too many API calls.
   */
  private selectBestCandidateTerms(expandedTerms: string[], originalQuery: string): string[] {
    const candidates = expandedTerms
      .filter(term => term !== originalQuery.toLowerCase())
      .filter(term => term.length > 2) // Skip very short terms
      .slice(0, 5); // Limit to 5 additional searches

    return candidates;
  }

  /**
   * Detect likely category based on semantic hints.
   */
  private detectCategory(expandedTerms: string[]): string | null {
    const categoryMappings = {
      beauty: ['nail polish', 'perfume', 'fragrance', 'cosmetics', 'makeup', 'beauty'],
      furniture: ['chair', 'office chair', 'furniture', 'desk'],
      'womens-jewellery': ['jewelry', 'jewellery', 'necklace', 'bracelet', 'ring'],
      'mens-watches': ['watch', 'watches', 'timepiece'],
      'womens-watches': ['women watch', 'ladies watch'],
    };

    for (const [category, keywords] of Object.entries(categoryMappings)) {
      const hasMatch = keywords.some(keyword => 
        expandedTerms.some(term => term.toLowerCase().includes(keyword.toLowerCase()))
      );
      
      if (hasMatch) {
        return category;
      }
    }

    return null;
  }

  /**
   * Apply explicit sorting. Uses the same stable comparators as DummyJsonRetrievalStrategy
   * so all sort paths carry an id-asc tie-breaker.
   */
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
        // Keep current semantic-relevance order (already sorted by byScoredProductDescIdAsc)
        return sorted;
    }
  }
}