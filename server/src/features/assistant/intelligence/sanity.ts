/**
 * Development sanity script for the intelligence layer + orchestrator routing.
 *
 * Tests two things:
 *   1. ShoppingIntentEnhancer output (analysis, searchParams, needsClarification)
 *   2. The routing decision the orchestrator WOULD make based on that output
 *      (simulates the promotion logic without spinning up Express / DB / OpenAI)
 *
 * Run from the server/ directory:
 *   npx tsx src/features/assistant/intelligence/sanity.ts
 */

import { ShoppingIntentEnhancer } from "./shoppingIntentEnhancer.js";
import { MessagePrecheck } from "../messagePrecheck.js";
import { IntentClassifier } from "../intentClassifier.js";

const enhancer = new ShoppingIntentEnhancer();
const classifier = new IntentClassifier();

// ── Routing simulation ────────────────────────────────────────────────────────

type SimulatedRoute =
  | "precheck:greeting"
  | "precheck:general_chat"
  | "clarification"
  | "product_search:classifier"
  | "product_search:promoted"
  | "general_chat";

function simulateRoute(userMessage: string): {
  route: SimulatedRoute;
  searchParams?: ReturnType<ShoppingIntentEnhancer["enhance"]>["searchParams"];
  clarificationQuestion?: string;
} {
  // Step 1: MessagePrecheck
  const precheck = MessagePrecheck.check(userMessage);
  if (precheck) {
    return {
      route: precheck.type === "greeting" ? "precheck:greeting" : "precheck:general_chat",
    };
  }

  // Step 2: Intelligence layer
  let enhanced: ReturnType<ShoppingIntentEnhancer["enhance"]> | undefined;
  try {
    enhanced = enhancer.enhance({ userMessage });
  } catch {
    // fall through to classifier-only behavior
  }

  // Step 3: Classifier
  const intent = classifier.classify({ userMessage, conversationContext: { recentMessages: [] } });

  // Step 4: Routing (mirrors AssistantOrchestrator.processUserMessage logic)
  if (intent.type === "greeting") return { route: "precheck:greeting" };
  if (intent.type === "clarification_needed") return { route: "clarification", clarificationQuestion: intent.question };

  if (intent.type === "product_search") {
    if (enhanced?.needsClarification) {
      return { route: "clarification", clarificationQuestion: enhanced.clarificationQuestion };
    }
    return { route: "product_search:classifier", searchParams: enhanced?.searchParams };
  }

  // general_chat: intelligence promotion
  if (enhanced && !enhanced.needsClarification) {
    const hasShoppingSignal =
      enhanced.analysis.candidateCategories.length > 0 ||
      enhanced.analysis.productTerms.length > 0;
    if (hasShoppingSignal) {
      return { route: "product_search:promoted", searchParams: enhanced.searchParams };
    }
  }

  return { route: "general_chat" };
}

// ── Test cases ────────────────────────────────────────────────────────────────

interface SanityCase {
  query: string;
  expectedRoute: SimulatedRoute;
  expect?: {
    needsClarification?: boolean;
    maxPrice?: number;
    recipient?: string;
    occasion?: string;
    categoryIncludes?: string;
    productTermIncludes?: string;
    searchParamCategoryIs?: string;
  };
}

const cases: SanityCase[] = [
  // ── Precheck cases (no intelligence or search) ──────────────────────────────
  {
    query: "hi",
    expectedRoute: "precheck:greeting",
  },
  {
    query: "thanks",
    expectedRoute: "precheck:general_chat",
  },

  // ── Natural shopping queries (no IntentClassifier PRODUCT_KEYWORDS) ─────────
  // These are the cases that previously broke — now fixed via intelligence promotion.
  {
    query: "nail polish",
    expectedRoute: "product_search:promoted",
    expect: { categoryIncludes: "beauty", productTermIncludes: "nail polish" },
  },
  {
    query: "something for manicure",
    expectedRoute: "product_search:promoted",
    expect: { categoryIncludes: "beauty", productTermIncludes: "manicure" },
  },
  {
    query: "office chair",
    expectedRoute: "product_search:promoted",
    expect: { categoryIncludes: "furniture", searchParamCategoryIs: "furniture" },
  },
  {
    query: "perfume for my wife",
    expectedRoute: "product_search:promoted",
    expect: {
      categoryIncludes: "fragrances",
      productTermIncludes: "perfume",
      recipient: "wife",
    },
  },

  // ── Keyword-triggered search (IntentClassifier detects + intelligence enhances) ─
  {
    query: "best perfume gift for my wife under 100",
    expectedRoute: "product_search:classifier",
    expect: {
      maxPrice: 100,
      recipient: "wife",
      occasion: "gift",
      categoryIncludes: "fragrances",
      productTermIncludes: "perfume",
      searchParamCategoryIs: "fragrances",
    },
  },
  {
    query: "office chair under 500",
    expectedRoute: "product_search:classifier",
    expect: {
      maxPrice: 500,
      categoryIncludes: "furniture",
      searchParamCategoryIs: "furniture",
    },
  },
  {
    query: "I need a laptop for work",
    expectedRoute: "product_search:classifier",
    expect: {
      occasion: "work",
      categoryIncludes: "laptops",
      productTermIncludes: "laptop",
      searchParamCategoryIs: "laptops",
    },
  },

  // ── Clarification cases ─────────────────────────────────────────────────────
  {
    query: "find a gift",
    expectedRoute: "clarification",
    expect: { needsClarification: true },
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

for (const { query, expectedRoute, expect: ex } of cases) {
  const sim = simulateRoute(query);
  const enhanced =
    sim.route !== "precheck:greeting" && sim.route !== "precheck:general_chat"
      ? (() => {
          try {
            return enhancer.enhance({ userMessage: query });
          } catch {
            return undefined;
          }
        })()
      : undefined;

  const errors: string[] = [];

  if (sim.route !== expectedRoute) {
    errors.push(`route: got "${sim.route}", want "${expectedRoute}"`);
  }

  if (ex && enhanced) {
    const { analysis, needsClarification } = enhanced;

    if (ex.needsClarification !== undefined && needsClarification !== ex.needsClarification) {
      errors.push(`needsClarification: got ${needsClarification}, want ${ex.needsClarification}`);
    }
    if (ex.maxPrice !== undefined && analysis.maxPrice !== ex.maxPrice) {
      errors.push(`maxPrice: got ${analysis.maxPrice}, want ${ex.maxPrice}`);
    }
    if (ex.recipient !== undefined && analysis.recipient !== ex.recipient) {
      errors.push(`recipient: got "${analysis.recipient}", want "${ex.recipient}"`);
    }
    if (ex.occasion !== undefined && analysis.occasion !== ex.occasion) {
      errors.push(`occasion: got "${analysis.occasion}", want "${ex.occasion}"`);
    }
    if (ex.categoryIncludes !== undefined && !analysis.candidateCategories.includes(ex.categoryIncludes)) {
      errors.push(
        `candidateCategories: "${ex.categoryIncludes}" not in [${analysis.candidateCategories.join(", ")}]`,
      );
    }
    if (ex.productTermIncludes !== undefined && !analysis.productTerms.includes(ex.productTermIncludes)) {
      errors.push(
        `productTerms: "${ex.productTermIncludes}" not in [${analysis.productTerms.join(", ")}]`,
      );
    }
    if (
      ex.searchParamCategoryIs !== undefined &&
      sim.searchParams?.category !== ex.searchParamCategoryIs
    ) {
      errors.push(
        `searchParams.category: got "${sim.searchParams?.category}", want "${ex.searchParamCategoryIs}"`,
      );
    }
  }

  const status = errors.length === 0 ? "✅ PASS" : "❌ FAIL";
  console.log(`\n${status}: "${query}"`);
  console.log(`  route: ${sim.route}`);

  if (sim.searchParams) {
    console.log("  searchParams:", sim.searchParams);
  }
  if (sim.clarificationQuestion) {
    console.log("  clarification:", sim.clarificationQuestion);
  }
  if (errors.length > 0) {
    console.log("  failures:", errors);
    failed++;
  } else {
    passed++;
  }
}

console.log(`\n─────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${cases.length} cases`);
if (failed > 0) process.exit(1);
