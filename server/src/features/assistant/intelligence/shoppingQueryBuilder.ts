import type { ShoppingIntentAnalysis } from "./shoppingIntent.types.js";

export interface BuiltShoppingSearchParams {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: "price_asc" | "price_desc" | "rating_desc";
  limit: number;
}

const GIFT_OCCASIONS = new Set(["gift", "birthday", "anniversary"]);

/**
 * Converts a ShoppingIntentAnalysis into ProductSearchService-compatible params.
 * Produces a semantically enriched query without inventing fields outside
 * the existing ProductSearchParams contract.
 */
export class ShoppingQueryBuilder {
  buildSearchParams(analysis: ShoppingIntentAnalysis): BuiltShoppingSearchParams {
    const queryParts: string[] = [...analysis.productTerms];

    const isGiftLike = GIFT_OCCASIONS.has(analysis.occasion);

    if (isGiftLike) {
      if (queryParts.length === 0) {
        if (analysis.genderHint === "women") {
          queryParts.push("women", "gift");
        } else if (analysis.genderHint === "men") {
          queryParts.push("men", "gift");
        } else {
          queryParts.push("gift");
        }
        const topCats = analysis.candidateCategories
          .slice(0, 2)
          .map((c) => c.replace(/-/g, " "));
        queryParts.push(...topCats);
      } else {
        queryParts.push("gift");
        if (analysis.genderHint === "women") queryParts.push("women");
        else if (analysis.genderHint === "men") queryParts.push("men");
      }
    }

    if (
      analysis.occasion === "work" &&
      !queryParts.some((t) => t.includes("work") || t.includes("office"))
    ) {
      queryParts.push("work");
    }

    if (queryParts.length < 2 && analysis.expandedTerms.length > 0) {
      queryParts.push(...analysis.expandedTerms.slice(0, 2));
    }

    const query =
      queryParts.length > 0
        ? dedupe(queryParts).join(" ")
        : analysis.normalizedQuery;

    // Use a single category only when the match is confident and direct.
    const category =
      analysis.confidence === "high" && analysis.detectedCategory
        ? analysis.detectedCategory
        : undefined;

    return {
      query,
      category,
      minPrice: analysis.minPrice,
      maxPrice: analysis.maxPrice,
      limit: 6,
    };
  }
}

function dedupe(terms: string[]): string[] {
  const seen = new Set<string>();
  return terms.filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}
