export type ShoppingRecipient =
  | "wife"
  | "husband"
  | "girlfriend"
  | "boyfriend"
  | "mom"
  | "dad"
  | "child"
  | "friend"
  | "self"
  | "unknown";

export type ShoppingOccasion =
  | "gift"
  | "birthday"
  | "anniversary"
  | "work"
  | "home"
  | "travel"
  | "daily_use"
  | "unknown";

export type ShoppingConfidence = "low" | "medium" | "high";

export interface ShoppingIntentAnalysis {
  originalQuery: string;
  normalizedQuery: string;

  detectedCategory?: string;
  candidateCategories: string[];

  productTerms: string[];
  expandedTerms: string[];

  minPrice?: number;
  maxPrice?: number;

  recipient: ShoppingRecipient;
  occasion: ShoppingOccasion;

  brandPreference?: string;
  genderHint?: "women" | "men" | "unisex" | "unknown";

  needsClarification: boolean;
  clarificationQuestion?: string;

  confidence: ShoppingConfidence;
}
