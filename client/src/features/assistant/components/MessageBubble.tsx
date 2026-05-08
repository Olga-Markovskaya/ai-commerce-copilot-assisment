import { memo } from "react";
import type { ChatMessage } from "../api/conversationApi";
import { ProductRecommendationBlock } from "./ProductRecommendationBlock";
import styles from "@shared/styles/assistant/message-list.module.css";

type MessageBubbleProps = {
  message: ChatMessage;
};

/**
 * Splits the assistant message into a title (first non-empty line) and an
 * optional summary (remaining lines joined). Returns summary as undefined when
 * there is no real second-line content — ProductRecommendationBlock already
 * skips RecommendationSummary when summary is absent, so no placeholder text
 * is shown.
 */
function parseAssistantMessage(content: string): { title: string; summary?: string } {
  const lines = content.trim().split('\n').filter(line => line.trim());
  const title = lines[0] ?? content.trim();
  const rest = lines.slice(1).join(' ').trim();
  return { title, summary: rest || undefined };
}

// Wrapped in memo: message objects are stable references in the React Query
// cache, so unchanged messages won't re-render when isSending or other
// Zustand state changes cause the parent MessageList to re-render.
export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const hasProducts = message.products && message.products.length > 0;

  // User messages - simple bubble
  if (message.role === "user") {
    return (
      <article className={styles.userMessage}>
        <span className={styles.userLabel}>You</span>
        <p className={styles.userContent}>{message.content}</p>
      </article>
    );
  }

  // Assistant messages with products - recommendation block
  if (hasProducts) {
    const { title, summary } = parseAssistantMessage(message.content);
    
    return (
      <ProductRecommendationBlock
        title={title}
        products={message.products!}
        summary={summary}
      />
    );
  }

  // Assistant messages without products - simple bubble
  return (
    <article className={styles.messageBubble} data-role="assistant">
      <span className={styles.messageRole}>Assistant</span>
      <p>{message.content}</p>
    </article>
  );
});
