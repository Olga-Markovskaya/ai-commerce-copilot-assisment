import type { AssistantIntent } from "./intent.types.js";
import type { AssistantReply } from "./assistant.types.js";
import type { ProductCard } from "../products/product.types.js";

export class AssistantResponseBuilder {
  buildResponse(intent: AssistantIntent, products?: ProductCard[]): AssistantReply {
    switch (intent.type) {
      case "greeting":
        return this.buildGreetingResponse();
      case "product_search":
        return this.buildProductSearchResponse(intent, products);
      case "clarification_needed":
        return this.buildClarificationNeededResponse(intent);
      case "general_chat":
        return this.buildGeneralChatResponse();
      default:
        return this.buildGeneralChatResponse();
    }
  }

  private buildProductSearchResponse(
    intent: AssistantIntent & { type: "product_search" },
    products?: ProductCard[]
  ): AssistantReply {
    if (!products || products.length === 0) {
      return {
        content: this.buildEmptyResultsMessage(intent),
      };
    }

    const count = products.length;
    const hasFilters = intent.category || intent.minPrice || intent.maxPrice;

    let content = `I found ${count} ${count === 1 ? 'option' : 'options'}`;

    if (intent.category) {
      content += ` in ${intent.category}`;
    }

    if (hasFilters) {
      const filters: string[] = [];
      if (intent.minPrice) filters.push(`over $${intent.minPrice}`);
      if (intent.maxPrice) filters.push(`under $${intent.maxPrice}`);
      if (filters.length > 0) {
        content += ` ${filters.join(' and ')}`;
      }
    }

    content += '. Here are the best matches:';

    return {
      content,
      products,
    };
  }

  private buildEmptyResultsMessage(intent: AssistantIntent & { type: "product_search" }): string {
    let message = "I couldn't find any products matching your request";

    if (intent.category) {
      message += ` in the ${intent.category} category`;
    }

    if (intent.minPrice || intent.maxPrice) {
      const priceRange: string[] = [];
      if (intent.minPrice) priceRange.push(`over $${intent.minPrice}`);
      if (intent.maxPrice) priceRange.push(`under $${intent.maxPrice}`);
      if (priceRange.length > 0) {
        message += ` ${priceRange.join(' and ')}`;
      }
    }

    message += '. Try adjusting your search criteria or explore different categories.';

    return message;
  }

  private buildGreetingResponse(): AssistantReply {
    const greetings = [
      "Hi! I'm your AI shopping assistant. I can help you find products, compare prices, and discover great deals. What are you looking for today?",
      "Hello! I'm here to help you find the perfect products. Tell me what you need and I'll search through our catalog for you.",
      "Hey there! I can help you discover products based on category, budget, or specific preferences. What can I help you find?"
    ];

    return {
      content: greetings[Math.floor(Math.random() * greetings.length)],
    };
  }

  private buildClarificationNeededResponse(intent: AssistantIntent & { type: "clarification_needed" }): AssistantReply {
    return {
      content: intent.question,
    };
  }

  private buildGeneralChatResponse(): AssistantReply {
    const responses = [
      "I'm your AI shopping assistant! I can help you find products, compare options, and discover great deals. What are you looking for today?",
      "Hello! I'm here to help you find the perfect products. Tell me what you need and I'll search through our catalog for you.",
      "Hi there! I can help you discover products, check prices, and find exactly what you're looking for. What can I help you find?",
    ];

    return {
      content: responses[Math.floor(Math.random() * responses.length)],
    };
  }
}