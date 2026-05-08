import { ShoppingIntentAnalyzer } from "./shoppingIntentAnalyzer.js";
import { ShoppingQueryBuilder, type BuiltShoppingSearchParams } from "./shoppingQueryBuilder.js";
import { ShoppingClarificationPolicy } from "./shoppingClarificationPolicy.js";
import type { ShoppingIntentAnalysis } from "./shoppingIntent.types.js";

export type { BuiltShoppingSearchParams };

/**
 * Facade for the assistant intelligence layer.
 * This is the only class AssistantOrchestrator needs to import.
 *
 * Takes a raw user message and returns:
 *  - a structured ShoppingIntentAnalysis
 *  - ready-to-use ProductSearchService params (when search should proceed)
 *  - a clarification flag + question (when the request is too vague)
 */
export class ShoppingIntentEnhancer {
  constructor(
    private readonly analyzer = new ShoppingIntentAnalyzer(),
    private readonly queryBuilder = new ShoppingQueryBuilder(),
    private readonly clarificationPolicy = new ShoppingClarificationPolicy(),
  ) {}

  enhance(input: { userMessage: string; recentMessages?: string[] }): {
    analysis: ShoppingIntentAnalysis;
    searchParams?: BuiltShoppingSearchParams;
    needsClarification: boolean;
    clarificationQuestion?: string;
  } {
    const analysis = this.analyzer.analyze(input);

    const needsClarification = this.clarificationPolicy.shouldClarify(analysis);

    if (needsClarification) {
      const clarificationQuestion = this.clarificationPolicy.buildClarificationQuestion(analysis);
      return {
        analysis: { ...analysis, needsClarification, clarificationQuestion },
        searchParams: undefined,
        needsClarification,
        clarificationQuestion,
      };
    }

    const searchParams = this.queryBuilder.buildSearchParams(analysis);

    return {
      analysis: { ...analysis, needsClarification: false },
      searchParams,
      needsClarification: false,
      clarificationQuestion: undefined,
    };
  }
}
