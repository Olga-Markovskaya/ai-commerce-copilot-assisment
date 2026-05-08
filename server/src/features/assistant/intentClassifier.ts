import type { AssistantIntent, IntentExtractionInput } from "./intent.types.js";

/**
 * Rule-based intent classifier for shopping assistant.
 * Determines user intent and extracts relevant parameters.
 */
export class IntentClassifier {
  
  // Product-related keywords that indicate shopping intent
  private static readonly PRODUCT_KEYWORDS = [
    "find", "search", "looking for", "need", "want", "buy", "purchase", "get", "show me",
    "product", "products", "item", "items", "shopping", "shop",
    "cheap", "affordable", "expensive", "budget", "under", "below", "less than", "max", "maximum"
  ];
  
  // Category mapping for specific product types (using actual DummyJSON categories)
  private static readonly CATEGORY_KEYWORDS: Record<string, string[]> = {
    "beauty": ["beauty", "skincare", "skin care", "makeup", "cosmetics", "lotion", "cream"],
    "skin-care": ["skin care", "skincare products", "moisturizer", "serum"],
    "fragrances": ["fragrance", "perfume", "cologne", "scent"],
    "furniture": ["furniture", "chair", "table", "bed", "sofa", "desk", "cabinet"],
    "groceries": ["groceries", "food", "snacks", "drinks", "beverages"],
    "laptops": ["laptop", "computer", "pc", "notebook", "macbook"],
    "smartphones": ["phone", "smartphone", "mobile", "iphone", "android"],
    "sports-accessories": ["sports", "fitness", "exercise", "gym", "athletic"],
    "home-decoration": ["home", "decoration", "decor", "decorative"],
    "kitchen-accessories": ["kitchen", "cooking", "utensil", "appliance"],
    "womens-dresses": ["dress", "dresses", "gown"],
    "mens-shirts": ["shirt", "shirts", "polo", "t-shirt"],
    "womens-shoes": ["shoes", "heels", "boots", "sandals", "sneakers"],
    "womens-bags": ["bag", "bags", "purse", "handbag", "backpack"],
    "mens-watches": ["watch", "watches", "timepiece"],
    "womens-watches": ["women watch", "ladies watch", "female watch"],
    "sunglasses": ["sunglasses", "shades", "eyewear"],
    "tablets": ["tablet", "ipad", "android tablet"]
  };
  
  classify(input: IntentExtractionInput): AssistantIntent {
    const message = input.userMessage.toLowerCase().trim();
    
    // Check if this is a product search request
    if (this.isProductSearchQuery(message)) {
      return this.extractProductSearchIntent(message);
    }
    
    // Check if the request is too vague and needs clarification
    if (this.needsClarification(message)) {
      return {
        type: "clarification_needed",
        question: this.generateClarificationQuestion(message)
      };
    }
    
    // Default to general chat
    return { type: "general_chat" };
  }
  
  private isProductSearchQuery(message: string): boolean {
    return IntentClassifier.PRODUCT_KEYWORDS.some(keyword => 
      message.includes(keyword.toLowerCase())
    );
  }
  
  private needsClarification(message: string): boolean {
    // Very vague requests that mention products but lack specifics
    const vaguePatterns = [
      /^(i need|i want|looking for|find me)\s+(something|anything)\b/i,
      /^(show me|get me)\s+(nice|good|cool|great)\s+stuff$/i,
      /^(help|assist|recommend)\s*$/i,
      /^what\s+(do you have|can you show|products)/i
    ];
    
    return vaguePatterns.some(pattern => pattern.test(message));
  }
  
  private generateClarificationQuestion(message: string): string {
    if (message.includes("something") || message.includes("anything")) {
      return "What kind of product are you looking for? For example, electronics, clothing, beauty products, or furniture?";
    }
    
    if (message.includes("help") || message.includes("assist")) {
      return "I can help you find products! What category interests you - beauty, electronics, home goods, or something else?";
    }
    
    if (message.includes("what") && (message.includes("have") || message.includes("show"))) {
      return "I can search for many types of products. What category would you like to explore?";
    }
    
    return "Could you be more specific about what you're looking for? For example, the product type or your budget range?";
  }
  
  private extractProductSearchIntent(message: string): AssistantIntent {
    type ProductSearchIntent = Extract<AssistantIntent, { type: "product_search" }>;

    const intent: ProductSearchIntent = { type: "product_search" };

    // Extract category
    for (const [category, keywords] of Object.entries(IntentClassifier.CATEGORY_KEYWORDS)) {
      if (keywords.some((keyword: string) => message.includes(keyword))) {
        intent.category = category;
        break;
      }
    }

    // Extract price constraints
    const priceConstraints = this.extractPriceConstraints(message);
    if (priceConstraints.maxPrice !== undefined) {
      intent.maxPrice = priceConstraints.maxPrice;
    }
    if (priceConstraints.minPrice !== undefined) {
      intent.minPrice = priceConstraints.minPrice;
    }

    // Extract sorting preference
    if (message.includes("cheap") || message.includes("affordable") || message.includes("lowest price")) {
      intent.sortBy = "price_asc";
    } else if (message.includes("expensive") || message.includes("premium") || message.includes("high-end")) {
      intent.sortBy = "price_desc";
    } else if (message.includes("best rated") || message.includes("top rated") || message.includes("highest rating")) {
      intent.sortBy = "rating_desc";
    }

    // Clean query text by removing price constraint phrases
    const cleanedQuery = this.cleanQueryText(message);
    if (cleanedQuery && !intent.category) {
      // Only set query if we don't have a category, to prefer category search
      intent.query = cleanedQuery;
    }

    console.log(`🔍 Intent: "${message}" → category: ${intent.category ?? 'none'}, maxPrice: $${intent.maxPrice ?? 'none'}, sortBy: ${intent.sortBy ?? 'default'}`);

    return intent;
  }
  
  private extractPriceConstraints(message: string): { minPrice?: number; maxPrice?: number } {
    const result: { minPrice?: number; maxPrice?: number } = {};
    
    // Patterns for maximum price
    const maxPricePatterns = [
      /(?:under|below|less than|max|maximum|up to)\s*\$?(\d+)/i,
      /\$?(\d+)\s*(?:or less|max|maximum)/i,
    ];
    
    // Patterns for minimum price
    const minPricePatterns = [
      /(?:over|above|more than|min|minimum|at least)\s*\$?(\d+)/i,
      /\$?(\d+)\s*(?:or more|min|minimum)/i,
    ];
    
    // Extract maximum price
    for (const pattern of maxPricePatterns) {
      const match = message.match(pattern);
      if (match) {
        result.maxPrice = parseInt(match[1], 10);
        break;
      }
    }
    
    // Extract minimum price
    for (const pattern of minPricePatterns) {
      const match = message.match(pattern);
      if (match) {
        result.minPrice = parseInt(match[1], 10);
        break;
      }
    }
    
    return result;
  }
  
  private cleanQueryText(message: string): string {
    let cleaned = message.toLowerCase();
    
    // Remove price constraint phrases
    const pricePatterns = [
      /\b(?:under|below|less than|max|maximum|up to)\s*\$?\d+\b/gi,
      /\$?\d+\s*(?:or less|max|maximum|or under|or below)\b/gi,
      /\b(?:over|above|more than|min|minimum|at least)\s*\$?\d+\b/gi,
      /\$?\d+\s*(?:or more|min|minimum|or over|or above)\b/gi,
    ];
    
    for (const pattern of pricePatterns) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    // Remove price-related words and symbols
    const priceWords = [
      'dollar', 'dollars', '$', 'price', 'cost', 'budget',
      'cheap', 'affordable', 'expensive', 'premium'
    ];
    
    const priceWordsPattern = new RegExp('\\b(?:' + priceWords.join('|') + ')\\b', 'gi');
    cleaned = cleaned.replace(priceWordsPattern, '');
    
    // Remove common search phrases to focus on product terms
    const commonPhrases = [
      'show me', 'find me', 'looking for', 'i need', 'i want', 
      'get me', 'search for', 'find', 'search', 'buy', 'purchase'
    ];
    
    for (const phrase of commonPhrases) {
      const regex = new RegExp('\\b' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      cleaned = cleaned.replace(regex, '');
    }
    
    // Clean up extra spaces and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Return empty string if nothing meaningful remains
    if (cleaned.length < 2) {
      return '';
    }
    
    return cleaned;
  }
}