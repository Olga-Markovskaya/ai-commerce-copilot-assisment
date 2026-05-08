import type { AssistantIntent } from "./intent.types.js";

export class MessagePrecheck {
  static check(message: string): AssistantIntent | null {
    const cleanMessage = message.toLowerCase().trim();
    
    if (!cleanMessage || cleanMessage.length === 0) {
      return { type: "general_chat" };
    }
    
    if (this.isOnlyPunctuation(cleanMessage) || this.isMeaninglessShort(cleanMessage)) {
      return { type: "general_chat" };
    }
    
    if (this.isGreeting(cleanMessage)) {
      return { type: "greeting" };
    }
    
    if (this.isPoliteAcknowledgment(cleanMessage)) {
      return { type: "general_chat" };
    }

    // Prompt-injection attempts are routed to a safe clarification.
    if (this.isPromptInjection(cleanMessage)) {
      return {
        type: "clarification_needed",
        question:
          "I can only recommend products from the available catalog. What type of product are you looking for?",
      };
    }

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

}