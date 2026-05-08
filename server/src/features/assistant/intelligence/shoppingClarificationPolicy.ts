import type { ShoppingIntentAnalysis } from "./shoppingIntent.types.js";

/**
 * Decides whether to ask a clarifying question and constructs
 * a short, shopping-specific question when needed.
 */
export class ShoppingClarificationPolicy {
  shouldClarify(analysis: ShoppingIntentAnalysis): boolean {
    return analysis.needsClarification;
  }

  buildClarificationQuestion(analysis: ShoppingIntentAnalysis): string {
    const { occasion, recipient, maxPrice } = analysis;

    // Gift with no recipient or budget
    if (
      (occasion === "gift" || occasion === "birthday" || occasion === "anniversary") &&
      recipient === "unknown" &&
      maxPrice === undefined
    ) {
      return "Who is this gift for, and what budget should I stay under?";
    }

    // Gift with recipient but no budget
    if (
      (occasion === "gift" || occasion === "birthday" || occasion === "anniversary") &&
      recipient !== "unknown" &&
      maxPrice === undefined
    ) {
      return `What budget should I stay under for the ${recipient}'s ${occasion}?`;
    }

    // Gift with budget but no recipient
    if (
      (occasion === "gift" || occasion === "birthday" || occasion === "anniversary") &&
      recipient === "unknown" &&
      maxPrice !== undefined
    ) {
      return "Who is this gift for? That will help me find the best options.";
    }

    // Completely vague
    return "What type of product are you looking for?";
  }
}
