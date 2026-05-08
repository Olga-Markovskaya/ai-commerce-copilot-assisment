import type { ProductSearchService } from "../products/productSearch.service.js";
import { ServiceContainer } from "../../services/serviceContainer.js";
import { MessagePrecheck } from "./messagePrecheck.js";
import { IntentClassifier } from "./intentClassifier.js";
import { AssistantResponseBuilder } from "./assistantResponseBuilder.js";
import type { AssistantReply, RecentMessage } from "./assistant.types.js";
import type { AssistantIntent } from "./intent.types.js";
import { OpenAiProvider } from "../../providers/llm/openAiProvider.js";
import {
  SHOPPING_ASSISTANT_SYSTEM_PROMPT,
  buildProductRecommendationPrompt,
  buildClarificationPrompt,
  buildGreetingPrompt,
} from "./prompts/shoppingAssistantPrompt.js";
import { ShoppingIntentEnhancer } from "./intelligence/shoppingIntentEnhancer.js";
import {
  mergeSearchParams,
  mentionsGroundedProduct,
} from "./assistantUtils.js";

/** Return type of ShoppingIntentEnhancer.enhance() */
type EnhancedIntent = ReturnType<ShoppingIntentEnhancer["enhance"]>;

/**
 * Main orchestration layer for processing user messages.
 *
 * Decision flow:
 *   1. MessagePrecheck    — instant exit for greetings / acks / empty input
 *   2. Intelligence layer — runs early (sync, no I/O) to understand shopping intent
 *   3. IntentClassifier   — rule-based keyword classification
 *   4. Routing decision   — intelligence can promote general_chat → product_search
 *   5. Response building  — LLM or rule-based
 */
export class AssistantOrchestrator {
  private productSearchService: ProductSearchService;
  private intentClassifier: IntentClassifier;
  private responseBuilder: AssistantResponseBuilder;
  private openAiProvider?: OpenAiProvider;
  private shoppingIntentEnhancer: ShoppingIntentEnhancer;

  /**
   * @param deps - Optional dependency overrides. When provided, automatic
   *   service-container and OpenAI initialization is skipped entirely, making
   *   the orchestrator safe to instantiate in unit tests without network/SQLite.
   *   Omit `openAiProvider` (or pass `undefined`) to run in rule-based-only mode.
   */
  constructor(deps?: {
    productSearchService?: ProductSearchService;
    openAiProvider?: OpenAiProvider;
  }) {
    this.productSearchService =
      deps?.productSearchService ?? ServiceContainer.getProductSearchService();
    this.intentClassifier = new IntentClassifier();
    this.responseBuilder = new AssistantResponseBuilder();
    this.shoppingIntentEnhancer = new ShoppingIntentEnhancer();

    if (deps !== undefined) {
      // Explicit deps provided (test / DI mode): use what was given.
      // `openAiProvider` defaults to undefined → rule-based fallback for all LLM ops.
      this.openAiProvider = deps.openAiProvider;
    } else {
      // Production mode: attempt automatic initialization from environment.
      try {
        this.openAiProvider = new OpenAiProvider();
        console.log("✅ OpenAI provider initialized");
      } catch (error) {
        console.log("ℹ️ OpenAI unavailable — fallback to rule-based mode");
        this.openAiProvider = undefined;
      }
    }
  }

  async processUserMessage(input: {
    conversationId: string;
    userMessage: string;
    recentMessages?: RecentMessage[];
  }): Promise<AssistantReply> {
    const { userMessage, recentMessages = [] } = input;

    // Extract plain content strings for components that only need text (no roles).
    const recentContents = recentMessages.map((m) => m.content);

    // ── Step 1: MessagePrecheck ───────────────────────────────────────────────
    // Instant classification for greetings, acknowledgments, empty input.
    // These bypass both the intelligence layer and product search entirely.
    const precheckResult = MessagePrecheck.check(userMessage);
    if (precheckResult) {
      console.log(`🔍 Pre-check classified: ${precheckResult.type}`);
      return this.responseBuilder.buildResponse(precheckResult);
    }

    // ── Step 2: Intelligence layer ────────────────────────────────────────────
    // Runs early — synchronous, no I/O, no OpenAI.
    // Detects shopping intent from natural language before keyword classification,
    // enabling queries like "something for manicure" or "nail polish" to reach search.
    let enhanced: EnhancedIntent | undefined;
    try {
      enhanced = this.shoppingIntentEnhancer.enhance({ userMessage, recentMessages: recentContents });
      console.log(
        `🧠 Intelligence: categories=[${enhanced.analysis.candidateCategories.join(",")}] confidence=${enhanced.analysis.confidence} clarify=${enhanced.needsClarification}`,
      );
    } catch (error) {
      console.log("🔁 Intelligence layer failed, proceeding with classifier only:", error);
    }

    // ── Step 3: Rule-based intent classification ──────────────────────────────
    const intent = this.intentClassifier.classify({
      userMessage,
      conversationContext: { recentMessages: recentContents },
    });
    console.log(`🎯 Intent classified: ${intent.type}`);

    // ── Step 4: Routing ───────────────────────────────────────────────────────

    // Greetings are always handled directly (precheck already catches most;
    // this handles edge cases like "Greetings!" that slip through).
    if (intent.type === "greeting") {
      return this.handleGreeting(intent);
    }

    // IntentClassifier's own clarification_needed (vague keyword patterns).
    if (intent.type === "clarification_needed") {
      return this.handleClarificationNeeded(intent, recentMessages);
    }

    // Classifier confirmed product search intent.
    if (intent.type === "product_search") {
      // Intelligence layer may still request clarification for queries that are
      // too vague to search usefully (e.g. "find a gift" with no recipient/budget).
      if (enhanced?.needsClarification) {
        console.log("🧠 Intelligence requests clarification");
        return this.handleClarificationNeeded(
          {
            type: "clarification_needed",
            question:
              enhanced.clarificationQuestion ??
              "Could you tell me more about what you're looking for?",
          },
          recentMessages,
        );
      }
      return this.handleProductSearch(intent, recentMessages, userMessage, enhanced);
    }

    // Classifier said general_chat. Intelligence layer can promote if it found
    // concrete product signals (category synonyms or product terms matched).
    if (enhanced && !enhanced.needsClarification) {
      const hasShoppingSignal =
        enhanced.analysis.candidateCategories.length > 0 ||
        enhanced.analysis.productTerms.length > 0;

      if (hasShoppingSignal) {
        console.log(
          `🧠 Intelligence promoted to product_search (categories=[${enhanced.analysis.candidateCategories.join(",")}])`,
        );
        // Build a synthetic intent from the enhanced params so the rule-based
        // response builder has category/price context if LLM is unavailable.
        const promotedIntent: AssistantIntent & { type: "product_search" } = {
          type: "product_search",
          query: enhanced.searchParams?.query,
          category: enhanced.searchParams?.category,
          minPrice: enhanced.searchParams?.minPrice,
          maxPrice: enhanced.searchParams?.maxPrice,
        };
        return this.handleProductSearch(promotedIntent, recentMessages, userMessage, enhanced);
      }
    }

    // LLM fallback: for messages that slip past both the classifier and intelligence
    // layer (e.g. phrased in a way no keyword or synonym catches).
    if (this.openAiProvider && this.looksLikeProductQuery(userMessage)) {
      console.log("🤖 LLM fallback for ambiguous intent");
      try {
        const llmIntent = await this.openAiProvider.extractIntent({
          userMessage,
          conversationContext: { recentMessages: recentContents },
        });
        console.log(`🎯 LLM intent: ${llmIntent.type}`);
        if (llmIntent.type === "product_search") {
          return this.handleProductSearch(llmIntent, recentMessages, userMessage, enhanced);
        }
        if (llmIntent.type === "clarification_needed") {
          return this.handleClarificationNeeded(llmIntent, recentMessages);
        }
        if (llmIntent.type === "greeting") {
          return this.handleGreeting(llmIntent);
        }
      } catch (error) {
        console.log("🔁 LLM intent extraction failed, using rule-based result");
      }
    }

    return this.handleGeneralChat({ type: "general_chat" });
  }

  private async handleGreeting(
    intent: AssistantIntent & { type: "greeting" },
  ): Promise<AssistantReply> {
    if (this.openAiProvider) {
      try {
        console.log("🤖 OpenAI used for greeting response");
        const response = await this.openAiProvider.generateAssistantReply({
          systemPrompt: SHOPPING_ASSISTANT_SYSTEM_PROMPT,
          userPrompt: buildGreetingPrompt(),
        });
        return { content: response };
      } catch (error) {
        console.log("🔁 Falling back to rule-based greeting");
      }
    }
    return this.responseBuilder.buildResponse(intent);
  }

  /**
   * Executes the product search pipeline.
   *
   * @param intent   - The product_search intent (from classifier or promoted).
   * @param enhanced - Pre-computed intelligence result; avoids running the
   *                   enhancer twice and fixes the undefined-overwrite bug.
   */
  private async handleProductSearch(
    intent: AssistantIntent & { type: "product_search" },
    recentMessages: RecentMessage[],
    userMessage: string,
    enhanced?: EnhancedIntent,
  ): Promise<AssistantReply> {
    console.log(`🛍️ Executing product search for: ${intent.query ?? userMessage}`);

    try {
      // Normalize LLM-sourced fields before use — extractIntent only validates
      // intent.type; other fields may be wrong types from a malformed response.
      const safeStr = (v: unknown): string | undefined =>
        typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
      const safeNum = (v: unknown): number | undefined =>
        typeof v === "number" && isFinite(v) && v >= 0 ? v : undefined;

      const baseParams = {
        query: safeStr(intent.query),
        category: safeStr(intent.category),
        minPrice: safeNum(intent.minPrice),
        maxPrice: safeNum(intent.maxPrice),
        sortBy: intent.sortBy,
        limit: 6,
      };

      // Safe merge: only override base fields that are explicitly defined in
      // enhanced.searchParams — prevents undefined erasing a valid base value.
      const finalSearchParams =
        enhanced?.searchParams
          ? mergeSearchParams(baseParams, enhanced.searchParams)
          : baseParams;

      if (enhanced?.searchParams) {
        console.log(
          `🧠 Intelligence enhanced: query="${finalSearchParams.query}" category=${finalSearchParams.category ?? "none"} maxPrice=${finalSearchParams.maxPrice ?? "none"}`,
        );
      }

      const searchResult = await this.productSearchService.searchProducts(finalSearchParams);
      const products = searchResult.products;
      console.log(`📦 Found ${products.length} products`);

      if (products.length === 0) {
        return {
          content:
            "I couldn't find matching products. Try broadening the category, budget, or brand.",
          products: [],
        };
      }

      const enhancedAnalysis = enhanced?.analysis;

      if (this.openAiProvider) {
        try {
          console.log("🤖 OpenAI used for recommendation response");
          const productPrompt = buildProductRecommendationPrompt({
            userMessage,
            conversationHistory: recentMessages,
            products,
            searchCriteria: {
              category: finalSearchParams.category,
              minPrice: finalSearchParams.minPrice,
              maxPrice: finalSearchParams.maxPrice,
              query: finalSearchParams.query,
              recipient:
                enhancedAnalysis?.recipient !== "unknown"
                  ? enhancedAnalysis?.recipient
                  : undefined,
              occasion:
                enhancedAnalysis?.occasion !== "unknown"
                  ? enhancedAnalysis?.occasion
                  : undefined,
              genderHint:
                enhancedAnalysis?.genderHint !== "unknown"
                  ? enhancedAnalysis?.genderHint
                  : undefined,
            },
          });
          const response = await this.openAiProvider.generateAssistantReply({
            systemPrompt: SHOPPING_ASSISTANT_SYSTEM_PROMPT,
            userPrompt: productPrompt,
          });
          if (!mentionsGroundedProduct(response, products)) {
            console.log("⚠️ LLM response mentions no grounded product — falling back to rule-based response");
            return this.responseBuilder.buildResponse(intent, products);
          }
          return { content: response, products };
        } catch (error) {
          console.log("🔁 Falling back to rule-based response");
        }
      }

      return this.responseBuilder.buildResponse(intent, products);
    } catch (error) {
      console.error("❌ Product search failed:", error);
      return this.responseBuilder.buildResponse(intent, []);
    }
  }

  private async handleClarificationNeeded(
    intent: AssistantIntent & { type: "clarification_needed" },
    recentMessages: RecentMessage[],
  ): Promise<AssistantReply> {
    if (this.openAiProvider) {
      try {
        console.log("🤖 OpenAI used for clarification response");
        const response = await this.openAiProvider.generateAssistantReply({
          systemPrompt: SHOPPING_ASSISTANT_SYSTEM_PROMPT,
          userPrompt: buildClarificationPrompt(
            intent.question || "The request needs more details",
            recentMessages,
          ),
        });
        return { content: response };
      } catch (error) {
        console.log("🔁 Falling back to rule-based clarification");
      }
    }
    return this.responseBuilder.buildResponse(intent);
  }

  private async handleGeneralChat(
    intent: AssistantIntent & { type: "general_chat" },
  ): Promise<AssistantReply> {
    return this.responseBuilder.buildResponse(intent);
  }

  /** Heuristic guard for the LLM fallback — avoids paying for OpenAI on obvious non-product messages. */
  private looksLikeProductQuery(message: string): boolean {
    const productHints = [
      "need something", "want something", "recommend me", "suggest something",
      "looking for", "shopping for", "buy", "purchase", "gift", "present",
      "budget", "price", "cheap", "expensive", "quality", "best",
      "wife", "husband", "girlfriend", "boyfriend", "mom", "dad",
      "birthday", "anniversary", "christmas", "holiday",
    ];
    const lower = message.toLowerCase();
    return productHints.some((hint) => lower.includes(hint));
  }
}
