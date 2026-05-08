import { useAssistantStore } from "../store/assistantStore";
import type { ConversationSummary } from "../api/conversationApi";
import styles from "@shared/styles/assistant/conversation-list.module.css";

type ConversationListItemProps = {
  conversation: ConversationSummary;
};

export function ConversationListItem({
  conversation,
}: ConversationListItemProps) {
  const activeConversationId = useAssistantStore(
    (state) => state.activeConversationId,
  );
  const setActiveConversation = useAssistantStore(
    (state) => state.setActiveConversation,
  );
  const deleteConversation = useAssistantStore(
    (state) => state.deleteConversation,
  );
  const isActive = conversation.id === activeConversationId;

  return (
    <div className={styles.conversationItem} data-active={isActive}>
      <button
        type="button"
        className={styles.conversationButton}
        onClick={() => setActiveConversation(conversation.id)}
      >
        <span className={styles.conversationTitle}>{conversation.title}</span>
      </button>
      <button
        type="button"
        className={styles.deleteButton}
        onClick={() => deleteConversation(conversation.id)}
        aria-label={`Delete ${conversation.title}`}
      >
        Delete
      </button>
    </div>
  );
}
