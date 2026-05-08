import { useAssistantStore } from "../store/assistantStore";
import { useConversations } from "../hooks/useConversations";
import { ConversationListItem } from "./ConversationListItem";
import { getExpectedServerUrl } from "../utils/apiError";
import styles from "@shared/styles/assistant/conversation-drawer.module.css";

export function ConversationDrawer() {
  const { conversations, isLoading, error, refetch } = useConversations();
  const createConversation = useAssistantStore((state) => state.createConversation);
  const isOpen = useAssistantStore((state) => state.isConversationDrawerOpen);
  const closeDrawer = useAssistantStore((state) => state.closeConversationDrawer);

  if (!isOpen) {
    return null;
  }

  const isNetworkError = error?.type === "network";

  return (
    <>
      <div className={styles.overlay} onClick={closeDrawer} />
      <div className={styles.drawer} aria-label="Conversations">
        <div className={styles.header}>
          <h3 className={styles.title}>Conversations</h3>
          <button
            type="button"
            className={styles.closeButton}
            onClick={closeDrawer}
            aria-label="Close conversations"
          >
            Close
          </button>
        </div>
        <div className={styles.content}>
          <button
            type="button"
            className={styles.newChatButton}
            onClick={createConversation}
            disabled={isLoading || Boolean(error)}
          >
            New chat
          </button>
          <div className={styles.conversationList}>
            {error ? (
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
            ) : isLoading ? (
              <div className={styles.loadingMessage}>
                <p>Loading conversations...</p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <ConversationListItem key={conversation.id} conversation={conversation} />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
