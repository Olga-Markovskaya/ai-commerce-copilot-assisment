export type AssistantIntent =
  | {
      type: "greeting";
    }
  | {
      type: "product_search";
      query?: string;
      category?: string;
      minPrice?: number;
      maxPrice?: number;
      sortBy?: "price_asc" | "price_desc" | "rating_desc";
    }
  | {
      type: "clarification_needed";
      question: string;
    }
  | {
      type: "general_chat";
    };

export type IntentExtractionInput = {
  userMessage: string;
  conversationContext?: {
    recentMessages: string[];
  };
};