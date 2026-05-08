import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useAssistantStore } from "../store/assistantStore";
import { useConversationMessages } from "../hooks/useConversationMessages";
import { MessageBubble } from "./MessageBubble";
import { getExpectedServerUrl } from "../utils/apiError";
import type { ChatMessage } from "../api/conversationApi";
import styles from "@shared/styles/assistant/message-list.module.css";

// Virtual index assigned to the first item in a fresh list. The number is large
// enough that any realistic conversation (< 100 000 messages) never decrements
// it below zero when older pages are prepended.
const INITIAL_VIRTUAL_INDEX = 100_000;

// Distance from the bottom (px) used by Virtuoso for both atBottomStateChange
// and the isAtBottom value passed to followOutput.
const AT_BOTTOM_THRESHOLD_PX = 150;

// ─── Synthetic typing item ─────────────────────────────────────────────────────
//
// WHY data array instead of Virtuoso Footer slot:
//
//   Virtuoso maintains its scroll-height model from DATA ITEMS only. The Footer
//   slot is a DOM sibling rendered outside that model — its height is tracked by
//   a separate ResizeObserver that can fire across multiple frames. Until that
//   observer fires, scrollTo(MAX_SAFE_INTEGER) and scrollToIndex("LAST") are both
//   clamped to the scroll container height BEFORE the footer — the typing
//   indicator stays clipped no matter how large the scroll target.
//
//   Adding the typing indicator as the last data item solves this completely:
//   - It has a real item index → scrollToIndex("LAST") reliably reaches it
//   - Virtuoso measures it as part of the list → total scroll height is correct
//   - followOutput fires when it is appended → near-bottom auto-scroll is free
//
//   The item is purely local render state; it never enters the React Query
//   cache, Zustand store, or any backend model.

const TYPING_ITEM_ID = "__assistant_typing__" as const;

type TypingItem = {
  id: typeof TYPING_ITEM_ID;
  isTyping: true;
};

// Stable singleton — the same object reference every render avoids
// invalidating the displayItems useMemo when neither messages nor isSending
// has changed.
const TYPING_ITEM: TypingItem = { id: TYPING_ITEM_ID, isTyping: true };

type DisplayItem = ChatMessage | TypingItem;

// ─── Header rendered inside the Virtuoso scroller ─────────────────────────────
// Defined outside MessageList so Virtuoso always receives a stable reference.

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

// ─── Stable item key ──────────────────────────────────────────────────────────
// Without computeItemKey, Virtuoso uses array index as the React reconciliation
// key. When the TYPING_ITEM transitions to a real ChatMessage at the same
// array position, React receives the same index key and tries to DIFF two
// structurally incompatible subtrees (typing indicator HTML vs MessageBubble
// HTML) instead of unmounting the old and mounting the new. This produces
// "visually mixed" output where DOM nodes from both subtrees bleed into each
// other's positions.
//
// Using item.id as the key forces React to:
//   - Unmount the TYPING_ITEM component (key "__assistant_typing__") when it
//     is removed from displayItems.
//   - Mount a fresh ChatMessage component (key = server UUID) in its place.
//   - Also correctly handle the optimistic → real user message swap
//     (key "optimistic-<ts>" → key "<uuid>") without DOM reuse.

function computeItemKey(_index: number, item: DisplayItem): React.Key {
  return item.id;
}

// ─── Item renderer ─────────────────────────────────────────────────────────────
// Defined at module level so Virtuoso always receives a stable function reference.
// Handles both real ChatMessages and the synthetic TypingItem.

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

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageList() {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Virtual index of the first item in the `data` array.
  //
  // How prepend scroll-preservation works without useLayoutEffect:
  //   - Initial list: firstItemIndex = INITIAL_VIRTUAL_INDEX, 10 items
  //     → virtual indices 100 000 – 100 009
  //   - fetchPreviousPage prepends 10 older messages
  //   - We decrement firstItemIndex by 10 → 99 990
  //     → virtual indices 99 990 – 100 009
  //   - Virtuoso detects the shift and internally compensates scrollTop so the
  //     previously visible item stays at the same pixel position.
  const [firstItemIndex, setFirstItemIndex] = useState(INITIAL_VIRTUAL_INDEX);

  // Snapshot of messages.length captured at the start of fetchPreviousPage.
  // Lets us compute how many items were prepended once the fetch completes.
  const messageCountBeforeFetchRef = useRef<number | null>(null);

  // Mirrors isNearBottom state in a ref so it can be read synchronously in
  // callbacks without stale closures.
  const isNearBottomRef = useRef(true);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Tracks the previous conversation ID to detect a real switch and reset
  // scroll state synchronously during render (before Virtuoso mounts).
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

  // ── Build display array ───────────────────────────────────────────────────
  // The typing item is appended as the last element while a send is in flight.
  // It is render-only: not persisted, not cached, not sent to the backend.
  const displayItems = useMemo<DisplayItem[]>(
    () => (isSending ? [...messages, TYPING_ITEM] : messages),
    [messages, isSending],
  );

  // ── Synchronous reset on conversation switch (derived-state pattern) ───────
  //
  // WHY synchronous instead of useEffect:
  //   <Virtuoso key={activeConversationId} ... /> forces a full remount whenever
  //   the conversation changes. `initialTopMostItemIndex` then starts the new
  //   conversation at the bottom. For this to work correctly, `firstItemIndex`
  //   MUST already be INITIAL_VIRTUAL_INDEX on the render where Virtuoso mounts —
  //   a stale value from the previous conversation would be interpreted by Virtuoso
  //   as "N items were prepended" and shift the viewport.
  //
  //   useEffect fires after paint, so the new Virtuoso would mount with the stale
  //   value and glitch. React's derived-state pattern (setState during render)
  //   causes an immediate re-render before commit, ensuring the value is correct
  //   on the render that actually reaches the DOM.
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

  // ── Adjust firstItemIndex after older messages are prepended ──────────────
  // Tracks the isFetchingPreviousPage true → false transition.
  // When the fetch completes and messages.length grew, decrement firstItemIndex
  // by the number of new messages so Virtuoso keeps the viewport pinned.
  //
  // Uses messages.length (real messages only), NOT displayItems.length, so
  // the synthetic typing item never skews the prepend offset calculation.
  //
  // Also detects "page trim" (messages.length shrinks outside a
  // fetchPreviousPage cycle). This happens in sendMessage, which trims the
  // infinite query to 1 page before invalidating, to avoid multi-page cursor
  // misalignment. When it occurs, firstItemIndex must reset to
  // INITIAL_VIRTUAL_INDEX so Virtuoso doesn't map the new (smaller) array to
  // the stale, lower virtual indices left over from the previous prepend.
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

  // ── Scroll to typing indicator when send starts ───────────────────────────
  // When isSending becomes true, TYPING_ITEM is appended to displayItems.
  // followOutput handles the scroll automatically when the user is already near
  // the bottom. This effect covers the case where the user scrolled far up to
  // read history — sending is an explicit intent, so we always scroll down.
  //
  // Because TYPING_ITEM is now a data item (not a Footer slot), scrollToIndex
  // ("LAST") reliably targets it. One rAF defers until Virtuoso has processed
  // the updated data array in the same browser frame as the React render.
  useEffect(() => {
    if (!isSending) return;
    const id = requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [isSending]);

  // ── Virtuoso callbacks ────────────────────────────────────────────────────

  const handleStartReached = useCallback(() => {
    if (hasPreviousPage && !isFetchingPreviousPage) {
      fetchPreviousPage();
    }
  }, [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage]);

  // followOutput: called when data grows at the bottom (new items arrive).
  // Returns "smooth" to follow if already near the bottom; false otherwise.
  // Fires when TYPING_ITEM is appended (isSending → true) AND when real
  // messages arrive after the refetch. Prepend via firstItemIndex does NOT
  // trigger followOutput, so upward pagination never yanks the user down.
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

  // ── Early returns ─────────────────────────────────────────────────────────

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
        // key forces a full Virtuoso remount on every conversation switch.
        // Without it, Virtuoso reuses its internal scroll state across
        // conversations (old scrollTop leaks into the new conversation).
        // With it, initialTopMostItemIndex fires fresh each time, reliably
        // landing the new conversation at the bottom.
        key={activeConversationId ?? "none"}
        ref={virtuosoRef}
        className={styles.virtuosoList}
        aria-live="polite"
        data={displayItems}
        // Start at the last item (bottom) on mount. Only applies once per
        // Virtuoso instance; followOutput takes over for subsequent items.
        initialTopMostItemIndex={displayItems.length - 1}
        firstItemIndex={firstItemIndex}
        startReached={handleStartReached}
        followOutput={handleFollowOutput}
        atBottomStateChange={handleAtBottomStateChange}
        atBottomThreshold={AT_BOTTOM_THRESHOLD_PX}
        // Render 200 px of items beyond the visible area above and below.
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
