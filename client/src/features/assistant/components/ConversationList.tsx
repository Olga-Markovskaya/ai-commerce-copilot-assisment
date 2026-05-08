import { useAssistantStore } from "../store/assistantStore";
import { useConversations } from "../hooks/useConversations";
import { ConversationListItem } from "./ConversationListItem";
import { getExpectedServerUrl } from "../utils/apiError";
import styles from "@shared/styles/assistant/conversation-list.module.css";

export function ConversationList() {
  const { conversations, isLoading, error, refetch } = useConversations();
  const createConversation = useAssistantStore((state) => state.createConversation);

  if (error) {
    const isNetworkError = error.type === "network";

    return (
      <aside className={styles.sidebar} aria-label="Conversations">
        <button
          type="button"
          className={styles.newChatButton}
          onClick={createConversation}
          disabled
        >
          New chat
        </button>
        <div className={styles.errorState}>
          <div className={styles.errorIcon}>⚠️</div>
          <h3 className={styles.errorTitle}>
            {isNetworkError ? "Assistant server unavailable" : "Error"}
          </h3>
          <p className={styles.errorMessage}>
            {isNetworkError
              ? "Check that the local backend is running."
              : error.userMessage}
          </p>
          {error.shouldShowRetry && (
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => refetch()}
            >
              Retry
            </button>
          )}
          {isNetworkError && (
            <p className={styles.serverInfo}>
              Expected server: {getExpectedServerUrl()}
            </p>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.sidebar} aria-label="Conversations">
      <button
        type="button"
        className={styles.newChatButton}
        onClick={createConversation}
        disabled={isLoading}
      >
        New chat
      </button>
      <div className={styles.conversationList}>
        {isLoading ? (
          <div className={styles.loadingMessage}>
            <p>Loading conversations...</p>
          </div>
        ) : (
          conversations.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              isLastConversation={conversations.length <= 1}
            />
          ))
        )}
      </div>
    </aside>
  );
}
