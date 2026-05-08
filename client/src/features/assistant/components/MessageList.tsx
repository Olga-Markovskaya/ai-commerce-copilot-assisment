import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useAssistantStore } from "../store/assistantStore";
import { useConversationMessages } from "../hooks/useConversationMessages";
import { MessageBubble } from "./MessageBubble";
import { getExpectedServerUrl } from "../utils/apiError";
import type { ChatMessage } from "../api/conversationApi";
import styles from "@shared/styles/assistant/message-list.module.css";

// Large enough that realistic prepends don't underflow.
const INITIAL_VIRTUAL_INDEX = 100_000;

// Used by atBottomStateChange + followOutput.
const AT_BOTTOM_THRESHOLD_PX = 150;

// Typing indicator is a synthetic Virtuoso data item (not Footer) so it has a real
// index and is included in Virtuoso's scroll-height model; `scrollToIndex("LAST")`
// reliably reaches it.

const TYPING_ITEM_ID = "__assistant_typing__" as const;

type TypingItem = {
  id: typeof TYPING_ITEM_ID;
  isTyping: true;
};

// Stable singleton to avoid needless memo churn.
const TYPING_ITEM: TypingItem = { id: TYPING_ITEM_ID, isTyping: true };

type DisplayItem = ChatMessage | TypingItem;

type VirtuosoContext = {
  isFetchingPreviousPage: boolean;
};

function ListHeader({ context }: { context?: VirtuosoContext }) {
  return (
    <div className={styles.listHeader}>
      {context?.isFetchingPreviousPage && (
        <p className={styles.loadingOlderMessages}>Loading older messages…</p>
      )}
    </div>
  );
}

// computeItemKey is required so React doesn't reuse DOM when the synthetic typing
// item is replaced by a real ChatMessage at the same array index.

function computeItemKey(_index: number, item: DisplayItem): React.Key {
  return item.id;
}

function renderItem(_index: number, item: DisplayItem) {
  if ("isTyping" in item) {
    return (
      <div className={styles.messageItem}>
        <div className={styles.typingIndicator}>
          <span className={styles.typingRole}>Assistant</span>
          <p className={styles.typingText}>Assistant is typing...</p>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.messageItem}>
      <MessageBubble message={item} />
    </div>
  );
}

export function MessageList() {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // firstItemIndex is used so prepending older pages preserves scroll position.
  const [firstItemIndex, setFirstItemIndex] = useState(INITIAL_VIRTUAL_INDEX);

  // Snapshot for prepend delta.
  const messageCountBeforeFetchRef = useRef<number | null>(null);

  // Mirror in a ref for sync reads in callbacks.
  const isNearBottomRef = useRef(true);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Reset state synchronously on conversation switch.
  const prevConversationIdRef = useRef<string | null | undefined>(undefined);

  const activeConversationId = useAssistantStore((s) => s.activeConversationId);
  const isSending = useAssistantStore((s) => s.isSending);
  const retryLastAction = useAssistantStore((s) => s.retryLastAction);
  const error = useAssistantStore((s) => s.error);

  const {
    messages,
    isLoading,
    isFetchingPreviousPage,
    hasPreviousPage,
    fetchPreviousPage,
  } = useConversationMessages(activeConversationId);

  const displayItems = useMemo<DisplayItem[]>(
    () => (isSending ? [...messages, TYPING_ITEM] : messages),
    [messages, isSending],
  );

  // Reset scroll state on conversation switch; Virtuoso is remounted via
  // key={activeConversationId}, so firstItemIndex must be reset before mount.
  if (prevConversationIdRef.current !== activeConversationId) {
    prevConversationIdRef.current = activeConversationId;
    // Refs can be mutated synchronously — no re-render needed.
    messageCountBeforeFetchRef.current = null;
    isNearBottomRef.current = true;
    // State resets trigger a synchronous re-render (React aborts the current
    // render pass and restarts with the new values before committing to DOM).
    if (firstItemIndex !== INITIAL_VIRTUAL_INDEX) {
      setFirstItemIndex(INITIAL_VIRTUAL_INDEX);
    }
    if (!isNearBottom) {
      setIsNearBottom(true);
    }
  }

  // Uses messages.length (real messages only), not displayItems.length, so the
  // synthetic typing item doesn't skew prepend offset calculations.
  const prevMessagesLengthRef = useRef<number | null>(null);
  useEffect(() => {
    const prevLen = prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (isFetchingPreviousPage) {
      if (messageCountBeforeFetchRef.current === null) {
        messageCountBeforeFetchRef.current = messages.length;
      }
    } else if (messageCountBeforeFetchRef.current !== null) {
      const added = messages.length - messageCountBeforeFetchRef.current;
      if (added > 0) {
        setFirstItemIndex((prev) => prev - added);
      }
      messageCountBeforeFetchRef.current = null;
    } else if (prevLen !== null && messages.length < prevLen) {
      // pages were trimmed (not a normal prepend shrink) — reset virtual origin
      setFirstItemIndex(INITIAL_VIRTUAL_INDEX);
    }
  }, [isFetchingPreviousPage, messages.length]);

  useEffect(() => {
    if (!isSending) return;
    const id = requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [isSending]);

  const handleStartReached = useCallback(() => {
    if (hasPreviousPage && !isFetchingPreviousPage) {
      fetchPreviousPage();
    }
  }, [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage]);

  const handleFollowOutput = useCallback(
    (isAtBottom: boolean): "smooth" | false => (isAtBottom ? "smooth" : false),
    [],
  );

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    if (atBottom !== isNearBottomRef.current) {
      isNearBottomRef.current = atBottom;
      setIsNearBottom(atBottom);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
  }, []);

  const virtuosoContext = useMemo<VirtuosoContext>(
    () => ({ isFetchingPreviousPage }),
    [isFetchingPreviousPage],
  );

  if (error) {
    const isNetworkError = error.type === "network";
    return (
      <div className={styles.errorState}>
        <div className={styles.errorIcon}>⚠️</div>
        <h3 className={styles.errorTitle}>
          {isNetworkError ? "Unable to connect" : "Something went wrong"}
        </h3>
        <p className={styles.errorMessage}>
          {isNetworkError
            ? "Please check that the local server is running, then try again."
            : error.userMessage}
        </p>
        {error.shouldShowRetry && (
          <button type="button" className={styles.retryButton} onClick={retryLastAction}>
            Retry
          </button>
        )}
        {isNetworkError && (
          <p className={styles.serverInfo}>Expected server: {getExpectedServerUrl()}</p>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.emptyState}>
        <h3>Loading conversation...</h3>
        <p>Please wait while we load your messages.</p>
      </div>
    );
  }

  if (messages.length === 0 && !isSending) {
    return (
      <div className={styles.emptyState}>
        <h3>Start a shopping conversation</h3>
        <p>
          Ask for product ideas, preferences, or comparisons. Product search will be connected in
          the next step.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.messageListOuter}>
      <Virtuoso
        // key remounts Virtuoso on conversation switch to avoid reusing scroll state.
        key={activeConversationId ?? "none"}
        ref={virtuosoRef}
        className={styles.virtuosoList}
        aria-live="polite"
        data={displayItems}
        initialTopMostItemIndex={displayItems.length - 1}
        firstItemIndex={firstItemIndex}
        startReached={handleStartReached}
        followOutput={handleFollowOutput}
        atBottomStateChange={handleAtBottomStateChange}
        atBottomThreshold={AT_BOTTOM_THRESHOLD_PX}
        overscan={200}
        context={virtuosoContext}
        components={{ Header: ListHeader }}
        computeItemKey={computeItemKey}
        itemContent={renderItem}
      />

      {!isNearBottom && (
        <button
          type="button"
          className={styles.scrollToBottomButton}
          onClick={scrollToBottom}
          aria-label="Scroll to latest message"
        >
          ↓ Latest
        </button>
      )}
    </div>
  );
}
