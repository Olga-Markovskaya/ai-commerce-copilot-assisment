import type { AssistantReply } from "./assistant.types.js";

/**
 * Builds clarification questions for vague or incomplete user requests.
 * Helps guide users to provide more specific product search criteria.
 */
export class ClarificationBuilder {
  
  static buildClarificationReply(question: string): AssistantReply {
    return {
      content: question
    };
  }
  
  /**
   * Generate contextual clarification questions based on what's missing.
   */
  static buildContextualClarification(userMessage: string): AssistantReply {
    const message = userMessage.toLowerCase();
    
    // If user mentions budget but no product type
    if (this.mentionsBudget(message) && !this.mentionsProductType(message)) {
      return {
        content: "I can help you find products within your budget! What type of product are you interested in? For example: electronics, clothing, beauty, or home goods?"
      };
    }
    
    // If user mentions product type but very vague
    if (this.mentionsProductType(message) && this.isVague(message)) {
      return {
        content: "I can help you find those products! To give you the best recommendations, could you tell me more about what you're looking for? For example, your budget range or specific features you need?"
      };
    }
    
    // General too-broad request
    if (this.isTooGeneral(message)) {
      return {
        content: "I'd be happy to help you find products! To get started, could you tell me:\n• What type of product you're looking for\n• Your budget range (optional)\n• Any specific features or preferences?"
      };
    }
    
    // Default clarification
    return {
      content: "Could you provide more details about what you're looking for? For example, the product category, your budget, or specific requirements you have in mind?"
    };
  }
  
  private static mentionsBudget(message: string): boolean {
    const budgetKeywords = ["budget", "price", "cost", "cheap", "expensive", "afford", "under", "below", "max", "$"];
    return budgetKeywords.some(keyword => message.includes(keyword));
  }
  
  private static mentionsProductType(message: string): boolean {
    const productKeywords = [
      "product", "item", "thing", "stuff", 
      "electronics", "clothing", "beauty", "furniture", "phone", "laptop"
    ];
    return productKeywords.some(keyword => message.includes(keyword));
  }
  
  private static isVague(message: string): boolean {
    const vagueIndicators = [
      "something", "anything", "stuff", "things", "nice", "good", "cool"
    ];
    return vagueIndicators.some(indicator => message.includes(indicator));
  }
  
  private static isTooGeneral(message: string): boolean {
    const generalPatterns = [
      /^(help|assist|recommend|suggest)\s*$/i,
      /^(what|show).*(have|got|available)\s*$/i,
      /^(i need|i want)\s+(help|assistance)\s*$/i
    ];
    return generalPatterns.some(pattern => pattern.test(message));
  }
}