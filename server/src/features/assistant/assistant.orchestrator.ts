import type { ProductSearchService } from "../products/productSearch.service.js";
import { ServiceContainer } from "../../services/serviceContainer.js";
import { MessagePrecheck } from "./messagePrecheck.js";
import { IntentClassifier } from "./intentClassifier.js";
import { AssistantResponseBuilder } from "./assistantResponseBuilder.js";
import type { AssistantReply, RecentMessage } from "./assistant.types.js";
import type { ProductCard } from "../products/product.types.js";
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

type EnhancedIntent = ReturnType<ShoppingIntentEnhancer["enhance"]>;

export class AssistantOrchestrator {
  private productSearchService: ProductSearchService;
  private intentClassifier: IntentClassifier;
  private responseBuilder: AssistantResponseBuilder;
  private openAiProvider?: OpenAiProvider;
  private shoppingIntentEnhancer: ShoppingIntentEnhancer;

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
      this.openAiProvider = deps.openAiProvider;
    } else {
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

    const recentContents = recentMessages.map((m) => m.content);

    const followUpReply = this.tryHandleProductContextFollowUp(userMessage, recentMessages);
    if (followUpReply) {
      return followUpReply;
    }

    const precheckResult = MessagePrecheck.check(userMessage);
    if (precheckResult) {
      console.log(`🔍 Pre-check classified: ${precheckResult.type}`);
      return this.responseBuilder.buildResponse(precheckResult);
    }

    let enhanced: EnhancedIntent | undefined;
    try {
      enhanced = this.shoppingIntentEnhancer.enhance({ userMessage, recentMessages: recentContents });
      console.log(
        `🧠 Intelligence: categories=[${enhanced.analysis.candidateCategories.join(",")}] confidence=${enhanced.analysis.confidence} clarify=${enhanced.needsClarification}`,
      );
    } catch (error) {
      console.log("🔁 Intelligence layer failed, proceeding with classifier only:", error);
    }

    const intent = this.intentClassifier.classify({
      userMessage,
      conversationContext: { recentMessages: recentContents },
    });
    console.log(`🎯 Intent classified: ${intent.type}`);

    if (intent.type === "greeting") {
      return this.handleGreeting(intent);
    }

    if (intent.type === "clarification_needed") {
      return this.handleClarificationNeeded(intent, recentMessages);
    }

    if (intent.type === "product_search") {
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

    if (enhanced && !enhanced.needsClarification) {
      const hasShoppingSignal =
        enhanced.analysis.candidateCategories.length > 0 ||
        enhanced.analysis.productTerms.length > 0;

      if (hasShoppingSignal) {
        console.log(
          `🧠 Intelligence promoted to product_search (categories=[${enhanced.analysis.candidateCategories.join(",")}])`,
        );
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

  private tryHandleProductContextFollowUp(
    userMessage: string,
    recentMessages: RecentMessage[],
  ): AssistantReply | null {
    const message = userMessage.toLowerCase().trim();

    const isFollowUp = this.isProductContextFollowUp(message);
    if (!isFollowUp) return null;

    const contexts = this.collectAssistantProductContexts(recentMessages);
    if (contexts.length === 0) {
      return this.responseBuilder.buildResponse({
        type: "clarification_needed",
        question:
          "I can compare or filter the previously shown products, but I don’t see any product cards in this conversation yet. Which product are you shopping for?",
      });
    }

    const getPreferredBaseProducts = (minSize: number): ProductCard[] => {
      // Prefer the most recent *primary* (broad) result set for ranking/comparison ops.
      // Fall back to a broader earlier set if the selected set is too small.
      const primary = contexts.find((c) => c.kind === "primary");
      const selected = primary?.products ?? contexts[0]!.products;
      if (selected.length >= minSize) return selected;

      const broader = contexts.find((c) => c.products.length >= minSize);
      return broader?.products ?? selected;
    };

    const latestSet = contexts[0]!.products;

    if (/\b(best rating|highest rated|top rated)\b/i.test(message) || /\bwhich one\b/i.test(message)) {
      const base = getPreferredBaseProducts(1);
      const best = [...base]
        .sort((a, b) => b.rating - a.rating || a.id - b.id)
        .slice(0, 1);
      return {
        content: `From the products shown above, the highest-rated option is "${best[0]!.title}".`,
        products: best,
      };
    }

    if (/\b(cheapest|lowest price|lowest-priced)\b/i.test(message)) {
      const n = this.extractTopN(message) ?? Math.min(3, getPreferredBaseProducts(1).length);
      const base = getPreferredBaseProducts(n);
      const cheapest = [...base]
        .sort((a, b) => a.price - b.price || a.id - b.id)
        .slice(0, n);
      return {
        content: `Here are the cheapest options from the products shown above.`,
        products: cheapest,
      };
    }

    if (/\b(compare|top\s*\d+|top two|top 2)\b/i.test(message)) {
      const n = this.extractTopN(message) ?? 2;
      const base = getPreferredBaseProducts(n);
      const top = base.slice(0, Math.min(n, base.length));
      if (top.length < 2) {
        return {
          content: `I only have one product card in the current set, so there isn’t much to compare.`,
          products: top,
        };
      }
      const [a, b] = top;
      return {
        content:
          `Quick comparison (from the shown products): "${a.title}" vs "${b.title}". ` +
          `One is cheaper at $${Math.min(a.price, b.price)} and the stronger reviews are ${a.rating >= b.rating ? `with "${a.title}"` : `with "${b.title}"`}.`,
        products: top,
      };
    }

    if (/\b(shown products?|product cards?|these products?|from above|from these)\b/i.test(message)) {
      return {
        content:
          "Got it — I’ll only use the products shown in the cards above. What would you like to do: compare, pick the best-rated, or filter by cheapest?",
        products: latestSet,
      };
    }

    return this.responseBuilder.buildResponse({
      type: "clarification_needed",
      question:
        "Do you want me to compare them, pick the best-rated, or show the cheapest options from the products above?",
    });
  }

  private isProductContextFollowUp(message: string): boolean {
    const patterns = [
      /\bwhich one\b/i,
      /\b(best rating|highest rated|top rated)\b/i,
      /\bcheapest|lowest price|lowest-priced\b/i,
      /\bcompare\b/i,
      /\btop\s*\d+\b/i,
      /\bshown products?\b/i,
      /\bproduct cards?\b/i,
      /\bthese products?\b/i,
      /\bfrom above\b/i,
      /\bfrom these\b/i,
      /\boptions\b/i,
    ];
    return patterns.some((p) => p.test(message));
  }

  private collectAssistantProductContexts(
    recentMessages: RecentMessage[],
  ): Array<{ products: ProductCard[]; kind: "primary" | "followup" }> {
    const contexts: Array<{ products: ProductCard[]; kind: "primary" | "followup" }> = [];

    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i]!;
      if (msg.role !== "assistant") continue;
      if (!Array.isArray(msg.products) || msg.products.length === 0) continue;

      contexts.push({
        products: msg.products,
        kind: this.isLikelyFollowUpSubset(msg.content) ? "followup" : "primary",
      });
    }

    return contexts;
  }

  private isLikelyFollowUpSubset(content: string): boolean {
    const c = content.toLowerCase();
    return (
      c.includes("from the products shown above") ||
      c.includes("cheapest options from the products shown above") ||
      c.includes("quick comparison (from the shown products)") ||
      c.includes("i’ll only use the products shown") ||
      c.includes("i only have one product card in the current set")
    );
  }

  private extractTopN(message: string): number | undefined {
    const m = message.match(/\btop\s*(\d+)\b/i);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }
    if (/\btop two\b/i.test(message)) return 2;
    return undefined;
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
