import type { AssistantIntent } from "./intent.types.js";

/**
 * Ultra-fast pre-check layer for deterministic message patterns.
 * Returns early classification for simple cases to avoid unnecessary processing.
 */
export class MessagePrecheck {
  
  /**
   * Check if message can be classified immediately without further processing.
   * Returns null if message needs deeper classification.
   */
  static check(message: string): AssistantIntent | null {
    const cleanMessage = message.toLowerCase().trim();
    
    // Handle empty or meaningless input
    if (!cleanMessage || cleanMessage.length === 0) {
      return { type: "general_chat" };
    }
    
    // Only punctuation or very short non-meaningful input
    if (this.isOnlyPunctuation(cleanMessage) || this.isMeaninglessShort(cleanMessage)) {
      return { type: "general_chat" };
    }
    
    // Greeting patterns
    if (this.isGreeting(cleanMessage)) {
      return { type: "greeting" };
    }
    
    // Polite acknowledgments and thanks
    if (this.isPoliteAcknowledgment(cleanMessage)) {
      return { type: "general_chat" };
    }

    // Prompt injection — control-flow manipulation targeting the assistant's rules.
    // Return a safe clarification rather than routing into product search.
    if (this.isPromptInjection(cleanMessage)) {
      return {
        type: "clarification_needed",
        question:
          "I can only recommend products from the available catalog. What type of product are you looking for?",
      };
    }

    // Meta-instruction / context-only messages that reference "shown products" or
    // "product cards" without specifying what to search for.  These must not trigger
    // a fresh product search — they are follow-up instructions, not new queries.
    if (this.isMetaInstruction(cleanMessage)) {
      return {
        type: "clarification_needed",
        question: "What product are you looking for? I can search the catalog for you.",
      };
    }

    // Need deeper classification
    return null;
  }
  
  private static isOnlyPunctuation(message: string): boolean {
    return /^[^\w\s]*$/.test(message);
  }
  
  private static isMeaninglessShort(message: string): boolean {
    const meaningless = ['?', '??', '???', '.', '..', '...', 'k', 'ok'];
    return meaningless.includes(message);
  }
  
  private static isGreeting(message: string): boolean {
    const greetings = [
      'hi', 'hello', 'hey', 'hiya', 'howdy',
      'good morning', 'good afternoon', 'good evening',
      'morning', 'afternoon', 'evening',
      'what\'s up', 'whats up', 'sup',
      'how are you', 'how\'s it going', 'hows it going'
    ];
    
    // Exact matches for short greetings
    if (greetings.includes(message)) {
      return true;
    }
    
    // Check if message starts with greeting (allows "hi there", "hello!")
    return greetings.some(greeting => 
      message.startsWith(greeting) && message.length <= greeting.length + 10
    );
  }
  
  private static isPoliteAcknowledgment(message: string): boolean {
    const acknowledgments = [
      'thanks', 'thank you', 'thx', 'ty',
      'cool', 'nice', 'great', 'awesome', 'perfect',
      'ok', 'okay', 'alright', 'got it', 'sounds good',
      'bye', 'goodbye', 'see you', 'later', 'catch you later',
      'no problem', 'no worries', 'all good'
    ];
    
    return acknowledgments.some(ack => 
      message === ack || message.startsWith(ack + ' ') || message.startsWith(ack + '!')
    );
  }

  /**
   * Detects prompt-injection attempts: messages that try to override or
   * bypass the assistant's operating instructions rather than ask for a product.
   *
   * Patterns are deliberately narrow to avoid false positives on normal shopping
   * messages.  New patterns should be added only when backed by concrete examples.
   */
  private static isPromptInjection(message: string): boolean {
    const patterns = [
      // "ignore all/previous/prior instructions/rules/prompts"
      /\bignore\b.{0,30}\b(all|previous|prior)\b.{0,30}\b(instruction|rule|prompt)/i,
      // "forget your/all/previous instructions/rules"
      /\bforget\b.{0,30}\b(your|all|previous)\b.{0,30}\b(instruction|rule|prompt)/i,
      // "disregard your/all/previous instructions"
      /\bdisregard\b.{0,30}\b(instruction|rule|prompt|previous)/i,
      // "pretend you are / pretend to be"
      /\bpretend\b.{0,20}\b(you are|you're|to be)\b/i,
      // "act as if / act as a / act as though"
      /\bact as\b.{0,20}\b(if|though|a |an )/i,
      // "you are now [something else]"
      /\byou are now\b/i,
    ];
    return patterns.some((p) => p.test(message));
  }

  /**
   * Detects context-only / meta-instruction messages: the user is referring to
   * previously shown products rather than asking for a new search.
   *
   * Examples that should match:
   *   "Recommend only products that are shown in the product cards"
   *   "Show only products from the above list"
   *   "From those results, which is cheapest?"
   *
   * The patterns require both an instruction verb AND an explicit reference to
   * context ("shown", "above", "these", "product cards") to avoid blocking
   * legitimate queries like "Recommend only red laptops".
   */
  private static isMetaInstruction(message: string): boolean {
    const patterns = [
      // "recommend/show only … shown/above/these/product cards"
      /\b(recommend|show|suggest|list)\s+only\b.{0,60}\b(shown|above|these|product\s+cards?)\b/i,
      // "only … from (the above / those / these / shown) …"
      /\bonly\b.{0,40}\bfrom\b.{0,30}\b(above|shown|these|those|previous|results?|list)\b/i,
      // "from those/these results/products/cards …"
      /\bfrom\s+(those|these)\s+(products?|results?|options?|cards?)\b/i,
      // "from the above / from the shown / from the previous"
      /\bfrom\s+the\s+(above|shown|previous)\b/i,
    ];
    return patterns.some((p) => p.test(message));
  }
}