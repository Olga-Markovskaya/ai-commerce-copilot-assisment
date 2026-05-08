import { ConversationRepository } from "../features/conversations/conversation.repository.js";
import { ConversationService } from "../features/conversations/conversation.service.js";
import { ProductSearchService } from "../features/products/productSearch.service.js";
import { AssistantOrchestrator } from "../features/assistant/assistant.orchestrator.js";

/**
 * Simple service container to ensure all controllers share the same service instances.
 * Uses SQLite-backed ConversationRepository for persistence across server restarts.
 * AssistantOrchestrator (and its OpenAiProvider) are singletons to avoid recreating
 * the OpenAI client on every chat request.
 */
class ServiceContainer {
  private static _conversationRepository: ConversationRepository | null = null;
  private static _conversationService: ConversationService | null = null;
  private static _productSearchService: ProductSearchService | null = null;
  private static _assistantOrchestrator: AssistantOrchestrator | null = null;

  static getConversationRepository(): ConversationRepository {
    if (!this._conversationRepository) {
      this._conversationRepository = new ConversationRepository();
    }
    return this._conversationRepository;
  }

  static getConversationService(): ConversationService {
    if (!this._conversationService) {
      this._conversationService = new ConversationService(this.getConversationRepository());
    }
    return this._conversationService;
  }

  static getProductSearchService(): ProductSearchService {
    if (!this._productSearchService) {
      this._productSearchService = new ProductSearchService();
    }
    return this._productSearchService;
  }

  static getAssistantOrchestrator(): AssistantOrchestrator {
    if (!this._assistantOrchestrator) {
      this._assistantOrchestrator = new AssistantOrchestrator();
    }
    return this._assistantOrchestrator;
  }
}

export { ServiceContainer };