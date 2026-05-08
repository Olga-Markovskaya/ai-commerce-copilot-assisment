import type {
  ShoppingIntentAnalysis,
  ShoppingRecipient,
  ShoppingOccasion,
  ShoppingConfidence,
} from "./shoppingIntent.types.js";

/**
 * DummyJSON catalog categories with their natural-language synonyms.
 * Used for mapping user language to searchable product categories.
 */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  "beauty": [
    "cosmetics", "makeup", "mascara", "eyeshadow", "lipstick",
    "nail polish", "manicure", "nails",
  ],
  "fragrances": [
    "eau de parfum", "eau de toilette", "perfume", "perfumes",
    "fragrance", "scent", "cologne",
  ],
  "furniture": [
    "bedside table", "office chair", "desk chair", "ergonomic",
    "furniture", "sofa", "chair", "desk", "bed",
  ],
  "groceries": [
    "pet food", "groceries", "food", "snacks", "meat",
    "fruits", "vegetables", "drinks", "beverages",
  ],
  "home-decoration": [
    "home decoration", "home decor", "decoration", "decor", "vase", "lamp",
  ],
  "kitchen-accessories": [
    "cutting board", "kitchen tools", "kitchen", "cookware",
    "utensils", "knife", "knives",
  ],
  "laptops": [
    "work laptop", "laptop", "laptops", "notebook", "computer", "macbook",
  ],
  "smartphones": [
    "mobile phone", "smartphone", "phone", "iphone", "android",
  ],
  "mobile-accessories": [
    "screen protector", "phone case", "power bank", "charger",
    "cable", "accessory",
  ],
  "skin-care": [
    "skin care", "skincare", "moisturizer", "cleanser", "serum", "cream",
  ],
  "sports-accessories": [
    "sports accessories", "sport", "sports", "fitness",
    "gym", "exercise", "ball", "equipment",
  ],
  "sunglasses": ["sun glasses", "sunglasses", "shades"],
  "tablets": ["tablet", "ipad"],
  "tops": ["t-shirt", "blouse", "top"],
  "vehicle": ["vehicle", "auto", "car"],
  "motorcycle": ["motorcycle", "bike"],
  "womens-bags": ["leather bag", "women bag", "handbag", "purse", "bag"],
  "womens-dresses": ["formal wear", "corset", "dress", "gown", "skirt"],
  "womens-jewellery": [
    "jewellery", "jewelry", "necklace", "earrings", "ring", "bracelet",
  ],
  "womens-shoes": ["women shoes", "heels", "sandals"],
  "womens-watches": ["watch for women", "women watch"],
  "mens-shirts": ["shirt for men", "mens clothing", "men shirt"],
  "mens-shoes": ["men shoes", "sneakers", "boots"],
  "mens-watches": ["watch for men", "men watch"],
};

/** Gift-boosted categories for women recipients */
const GIFT_WOMEN_CATEGORIES = [
  "fragrances", "beauty", "skin-care",
  "womens-bags", "womens-jewellery", "womens-watches",
];

/** Gift-boosted categories for men recipients */
const GIFT_MEN_CATEGORIES = [
  "fragrances", "mens-watches", "mens-shirts", "mens-shoes", "sunglasses",
];

/** Women-associated recipients for gender hint inference */
const WOMEN_RECIPIENTS: ShoppingRecipient[] = ["wife", "girlfriend", "mom"];

/** Men-associated recipients for gender hint inference */
const MEN_RECIPIENTS: ShoppingRecipient[] = ["husband", "boyfriend", "dad"];

/** Gift-like occasions that trigger recipient-based category boosting */
const GIFT_OCCASIONS: ShoppingOccasion[] = ["gift", "birthday", "anniversary"];

/**
 * Checks whether a synonym appears in the query.
 *
 * Multi-word synonyms ("nail polish", "office chair") use plain substring matching —
 * phrases are specific enough that false positives are not a concern.
 *
 * Single-word synonyms ("car", "top", "bike") use word-boundary matching to prevent
 * incidental substring hits (e.g. "car" inside "product cards", "top" inside "laptop").
 */
function matchesSynonym(query: string, syn: string): boolean {
  if (syn.includes(" ")) return query.includes(syn);
  // Escape any regex-special characters in the synonym before building the pattern
  const escaped = syn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(query);
}

/**
 * Remove shorter terms that are already covered by a longer term in the list.
 * E.g. ["office chair", "chair"] → ["office chair"]
 */
function deduplicateBySubstring(terms: string[]): string[] {
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const result: string[] = [];
  for (const term of sorted) {
    if (!result.some((kept) => kept.includes(term))) {
      result.push(term);
    }
  }
  return result;
}

/**
 * Rule-based, deterministic analyzer that converts a natural-language
 * shopping message into a structured ShoppingIntentAnalysis.
 * Never calls external services or OpenAI.
 */
export class ShoppingIntentAnalyzer {
  analyze(input: {
    userMessage: string;
    recentMessages?: string[];
  }): ShoppingIntentAnalysis {
    const { userMessage, recentMessages } = input;

    // If the current message looks like a partial clarification reply (e.g. "for my wife"
    // after "gift"), merge the previous shopping context into the analysis text.
    // originalQuery stays as the raw userMessage — only internal extraction is enriched.
    const analysisText = this.buildAnalysisText(userMessage, recentMessages);
    const normalizedQuery = this.normalize(analysisText);

    const budget = this.extractBudget(normalizedQuery);
    const recipient = this.extractRecipient(normalizedQuery);
    const occasion = this.extractOccasion(normalizedQuery);
    const genderHint = this.inferGenderHint(recipient, normalizedQuery);
    const brandPreference = this.extractBrand(normalizedQuery);

    const { detectedCategory, candidateCategories, productTerms, expandedTerms } =
      this.extractCategoryInfo(normalizedQuery, recipient, occasion);

    const needsClarification = this.computeNeedsClarification(
      candidateCategories,
      productTerms,
      recipient,
      budget,
      occasion,
    );

    const confidence = this.computeConfidence(
      detectedCategory,
      candidateCategories,
      productTerms,
      budget,
      recipient,
      occasion,
    );

    return {
      originalQuery: userMessage,
      normalizedQuery,
      detectedCategory,
      candidateCategories,
      productTerms,
      expandedTerms,
      minPrice: budget.minPrice,
      maxPrice: budget.maxPrice,
      recipient,
      occasion,
      genderHint,
      brandPreference,
      needsClarification,
      clarificationQuestion: undefined,
      confidence,
    };
  }

  /**
   * Combines current message with a previous shopping context message when the
   * current message looks like a partial clarification reply.
   *
   * Examples:
   *   prev="gift"             + current="for my wife"  → "gift for my wife"
   *   prev="gift for wife"    + current="under $100"   → "gift for wife under $100"
   *   prev="birthday gift"    + current="for husband"  → "birthday gift for husband"
   *
   * Safe guards:
   *   - Only fires when current message is a recognisable partial answer pattern.
   *   - Only uses previous messages that are short (≤12 words) and contain shopping
   *     signals — excludes long recommendation texts and assistant clarification
   *     questions (which end with "?").
   *   - Returns original userMessage unchanged when no suitable context is found.
   */
  private buildAnalysisText(userMessage: string, recentMessages?: string[]): string {
    const normalized = this.normalize(userMessage);

    if (!this.isPartialAnswer(normalized)) return userMessage;

    const prevContext = recentMessages
      ?.slice()
      .reverse()
      .find(
        (m) =>
          !m.trim().endsWith("?") &&
          m.trim().split(/\s+/).length <= 12 &&
          this.hasShoppingSignals(m),
      );

    if (!prevContext) return userMessage;

    return `${prevContext.trim()} ${userMessage.trim()}`;
  }

  /**
   * Returns true when the message is a short fragment that provides one piece
   * of shopping context (budget, recipient, or occasion) without being a
   * complete standalone query.
   */
  private isPartialAnswer(normalized: string): boolean {
    if (normalized.split(" ").length > 8) return false;

    // Budget-only: "under $100", "$50", "up to 200", "around 80"
    if (/^(under|below|up to|around|less than)\s*\$?\d/i.test(normalized)) return true;
    if (/^\$\d/.test(normalized)) return true;

    // Recipient-only: "for my wife", "for husband", "for dad", etc.
    if (
      /^for\s+(my\s+)?(wife|husband|girlfriend|boyfriend|mom|mother|dad|father|child|kid|friend|sister|brother)\b/i.test(
        normalized,
      )
    )
      return true;

    // Bare occasion word at the start: "birthday", "anniversary", etc.
    if (
      /^(birthday|anniversary|christmas|graduation|valentine|wedding)\b/i.test(normalized)
    )
      return true;

    return false;
  }

  /**
   * Returns true when a message contains recognisable shopping-intent signals.
   * Used to identify previous user turns worth merging as context.
   */
  private hasShoppingSignals(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      /\b(gift|present|birthday|anniversary|christmas|valentine)\b/.test(lower) ||
      /\b(wife|husband|girlfriend|boyfriend|mom|mother|dad|father|friend|sister|brother)\b/.test(
        lower,
      ) ||
      /\b(perfume|fragrance|laptop|phone|shoes|watch|jewelry|jewellery|bag|beauty|skincare|dress|shirt)\b/.test(
        lower,
      ) ||
      /\$\d+|\bunder\b|\bbudget\b|\bprice\b/.test(lower)
    );
  }

  private normalize(message: string): string {
    return message.toLowerCase().trim().replace(/\s+/g, " ");
  }

  private extractBudget(query: string): { minPrice?: number; maxPrice?: number } {
    const result: { minPrice?: number; maxPrice?: number } = {};

    // "around N" → maxPrice = N * 1.2
    const aroundMatch = query.match(/\baround\s*\$?(\d+(?:\.\d+)?)\b/i);
    if (aroundMatch) {
      result.maxPrice = Math.round(parseFloat(aroundMatch[1]) * 1.2);
    }

    if (!result.maxPrice) {
      const maxPatterns = [
        /\b(?:under|below|less than|up to|max|maximum)\s*\$?(\d+(?:\.\d+)?)\b/i,
        /\$?(\d+(?:\.\d+)?)\s*(?:or less|max|maximum|or under|or below)\b/i,
      ];
      for (const pattern of maxPatterns) {
        const match = query.match(pattern);
        if (match) {
          result.maxPrice = parseFloat(match[1]);
          break;
        }
      }
    }

    // Bare "$N" as fallback — only if no max found yet
    if (!result.maxPrice) {
      const bareMatch = query.match(/\$(\d+(?:\.\d+)?)\b/);
      if (bareMatch) {
        result.maxPrice = parseFloat(bareMatch[1]);
      }
    }

    const minPatterns = [
      /\b(?:over|above|more than|min|minimum|at least)\s*\$?(\d+(?:\.\d+)?)\b/i,
      /\$?(\d+(?:\.\d+)?)\s*(?:or more|min|minimum|or over|or above)\b/i,
    ];
    for (const pattern of minPatterns) {
      const match = query.match(pattern);
      if (match) {
        result.minPrice = parseFloat(match[1]);
        break;
      }
    }

    return result;
  }

  private extractRecipient(query: string): ShoppingRecipient {
    // Longer/more specific patterns first
    if (/\b(my\s+wife|for\s+(?:my\s+)?wife)\b/i.test(query)) return "wife";
    if (/\b(my\s+husband|for\s+(?:my\s+)?husband)\b/i.test(query)) return "husband";
    if (/\b(my\s+girlfriend|for\s+(?:my\s+)?girlfriend)\b/i.test(query)) return "girlfriend";
    if (/\b(my\s+boyfriend|for\s+(?:my\s+)?boyfriend)\b/i.test(query)) return "boyfriend";
    if (/\b(my\s+(?:mom|mother)|for\s+(?:my\s+)?(?:mom|mother))\b/i.test(query)) return "mom";
    if (/\b(my\s+(?:dad|father)|for\s+(?:my\s+)?(?:dad|father))\b/i.test(query)) return "dad";
    if (/\b(my\s+(?:child|kid|son|daughter)|for\s+(?:my\s+)?(?:child|kid|son|daughter))\b/i.test(query)) return "child";
    if (/\b(my\s+friend|for\s+(?:a\s+)?friend)\b/i.test(query)) return "friend";
    if (/\b(for\s+me|myself|for\s+myself)\b/i.test(query)) return "self";
    // Bare forms as fallback
    if (/\bwife\b/i.test(query)) return "wife";
    if (/\bhusband\b/i.test(query)) return "husband";
    if (/\bgirlfriend\b/i.test(query)) return "girlfriend";
    if (/\bboyfriend\b/i.test(query)) return "boyfriend";
    if (/\b(mom|mother)\b/i.test(query)) return "mom";
    if (/\b(dad|father)\b/i.test(query)) return "dad";
    return "unknown";
  }

  private extractOccasion(query: string): ShoppingOccasion {
    // Check specific occasions before the generic "gift" — "birthday gift" should
    // resolve to "birthday", not "gift".
    if (/\bbirthday\b/i.test(query)) return "birthday";
    if (/\banniversary\b/i.test(query)) return "anniversary";
    if (/\b(office|work|workplace|business)\b/i.test(query)) return "work";
    if (/\b(home|living room|bedroom|kitchen|house|household)\b/i.test(query)) return "home";
    if (/\b(travel|trip|traveling)\b/i.test(query)) return "travel";
    if (/\b(everyday|daily use|daily|every day)\b/i.test(query)) return "daily_use";
    if (/\b(gift|present|gifting)\b/i.test(query)) return "gift";
    return "unknown";
  }

  private inferGenderHint(
    recipient: ShoppingRecipient,
    query: string,
  ): "women" | "men" | "unisex" | "unknown" {
    if (WOMEN_RECIPIENTS.includes(recipient)) return "women";
    if (MEN_RECIPIENTS.includes(recipient)) return "men";
    if (/\b(women|woman|female|girl)\b/i.test(query)) return "women";
    if (/\b(men|man|male|guy)\b/i.test(query)) return "men";
    return "unknown";
  }

  private extractBrand(query: string): string | undefined {
    const knownBrands = [
      "apple", "samsung", "sony", "nike", "adidas",
      "gucci", "chanel", "loreal", "l'oreal",
    ];
    for (const brand of knownBrands) {
      if (query.includes(brand)) return brand;
    }
    return undefined;
  }

  private extractCategoryInfo(
    query: string,
    recipient: ShoppingRecipient,
    occasion: ShoppingOccasion,
  ): {
    detectedCategory?: string;
    candidateCategories: string[];
    productTerms: string[];
    expandedTerms: string[];
  } {
    // Match synonyms (sorted longest-first to prefer specific phrases)
    const matchedCategories = new Map<string, string[]>();

    for (const [category, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
      const sorted = [...synonyms].sort((a, b) => b.length - a.length);
      const matched: string[] = [];
      for (const syn of sorted) {
        if (matchesSynonym(query, syn)) {
          matched.push(syn);
        }
      }
      if (matched.length > 0) {
        matchedCategories.set(category, matched);
      }
    }

    // Gift-based category boosts when recipient is known
    const isGiftOccasion = GIFT_OCCASIONS.includes(occasion);
    if (isGiftOccasion) {
      const boostList = WOMEN_RECIPIENTS.includes(recipient)
        ? GIFT_WOMEN_CATEGORIES
        : MEN_RECIPIENTS.includes(recipient)
          ? GIFT_MEN_CATEGORIES
          : [];

      for (const cat of boostList) {
        if (!matchedCategories.has(cat)) {
          matchedCategories.set(cat, ["(gift boost)"]);
        }
      }
    }

    const candidateCategories = [...matchedCategories.keys()];

    // productTerms = synonyms directly matched in the query (not gift boosts)
    const rawProductTerms: string[] = [];
    for (const synonyms of matchedCategories.values()) {
      for (const syn of synonyms) {
        if (syn !== "(gift boost)" && !rawProductTerms.includes(syn)) {
          rawProductTerms.push(syn);
        }
      }
    }
    const productTerms = deduplicateBySubstring(rawProductTerms);

    // expandedTerms = synonyms from matched categories not already in productTerms
    const expandedTerms: string[] = [];
    for (const cat of candidateCategories) {
      for (const syn of CATEGORY_SYNONYMS[cat] ?? []) {
        if (!productTerms.includes(syn) && !expandedTerms.includes(syn)) {
          expandedTerms.push(syn);
        }
      }
    }

    // detectedCategory = category with most direct (non-boost) synonym matches
    let detectedCategory: string | undefined;
    let maxDirectMatches = 0;
    for (const [cat, synonyms] of matchedCategories.entries()) {
      const directCount = synonyms.filter((s) => s !== "(gift boost)").length;
      if (directCount > maxDirectMatches) {
        maxDirectMatches = directCount;
        detectedCategory = cat;
      }
    }

    return { detectedCategory, candidateCategories, productTerms, expandedTerms };
  }

  private computeNeedsClarification(
    candidateCategories: string[],
    productTerms: string[],
    recipient: ShoppingRecipient,
    budget: { minPrice?: number; maxPrice?: number },
    occasion: ShoppingOccasion,
  ): boolean {
    // Anything to search on → no clarification needed
    if (productTerms.length > 0) return false;
    if (candidateCategories.length > 0) return false;

    // Recipient or budget gives enough context to attempt a search
    if (recipient !== "unknown") return false;
    if (budget.minPrice !== undefined || budget.maxPrice !== undefined) return false;

    // Only ask for clarification when there is a recognisable shopping occasion
    // but it lacks the detail needed to search usefully (e.g. bare "find a gift").
    // Messages with no shopping signals at all (e.g. "thanks", "ok") should not
    // trigger clarification — they are simply not shopping queries.
    return occasion !== "unknown";
  }

  private computeConfidence(
    detectedCategory: string | undefined,
    candidateCategories: string[],
    productTerms: string[],
    budget: { minPrice?: number; maxPrice?: number },
    recipient: ShoppingRecipient,
    occasion: ShoppingOccasion,
  ): ShoppingConfidence {
    if (detectedCategory && productTerms.length > 0) return "high";
    if (detectedCategory && (budget.maxPrice !== undefined || budget.minPrice !== undefined)) return "high";
    if (candidateCategories.length > 0) return "medium";
    if (recipient !== "unknown" || occasion !== "unknown") return "medium";
    return "low";
  }
}
