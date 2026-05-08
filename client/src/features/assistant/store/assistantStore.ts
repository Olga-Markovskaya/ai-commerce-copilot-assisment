import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type InfiniteData } from "@tanstack/react-query";
import { ChatApiService } from "../api/chatApi";
import {
  ConversationApiService,
  type ChatMessage,
  type ConversationSummary,
  type MessagesPage,
} from "../api/conversationApi";
import { getUserFriendlyApiError, type UserFriendlyError } from "../utils/apiError";
import { queryClient } from "../../../lib/queryClient";
import { QUERY_KEYS } from "../../../lib/queryKeys";
import { conversationsQueryKey } from "../hooks/useConversations";

export type PanelPosition = {
  x: number;
  y: number;
};

export type PanelSize = {
  width: number;
};

/**
 * Typed record of which action failed, carrying the exact arguments needed
 * to replay it. Replaces the previous `string | null` encoding ("sendMessage:<content>")
 * which broke when the payload itself contained a colon — e.g. retrying
 * "I want: Nike shoes" would only replay "I want".
 */
export type LastFailedAction =
  | { type: "openAssistant" }
  | { type: "createConversation" }
  | { type: "deleteConversation"; conversationId: string }
  | { type: "sendMessage"; content: string }
  | null;

/**
 * Zustand owns UI state only.
 *
 * Server state (conversations list, messages) lives in React Query:
 *   - useConversations()          → ['conversations']
 *   - useConversationMessages()   → ['messages', conversationId]
 *
 * Mutations (create, delete, send) live here as actions because they require
 * cross-cutting orchestration (picking the next active conversation, managing
 * isSending across multiple components). After each mutation they invalidate
 * the relevant React Query keys rather than manually updating Zustand arrays.
 */
type AssistantState = {
  // ── Persisted UI state ────────────────────────────────────────────────────
  isOpen: boolean;
  activeConversationId: string | null;
  panelPosition: PanelPosition | null;
  panelSize: PanelSize | null;

  // ── Transient UI state ────────────────────────────────────────────────────
  isSending: boolean;
  isConversationDrawerOpen: boolean;
  error: UserFriendlyError | null;
  lastFailedAction: LastFailedAction;

  // ── Actions ───────────────────────────────────────────────────────────────
  openAssistant: () => Promise<void>;
  closeAssistant: () => void;
  toggleAssistant: () => void;
  createConversation: () => Promise<void>;
  /** Synchronous — just sets the active ID. React Query picks up the rest. */
  setActiveConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  setPanelPosition: (position: PanelPosition) => void;
  setPanelWidth: (width: number) => void;
  openConversationDrawer: () => void;
  closeConversationDrawer: () => void;
  toggleConversationDrawer: () => void;
  clearError: () => void;
  retryLastAction: () => Promise<void>;
};

const STORAGE_KEY = "ai-commerce-copilot-assistant";

function getMostRecentlyUpdatedConversation(conversations: ConversationSummary[]) {
  return [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0];
}

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set, get) => ({
      // Persisted
      isOpen: false,
      activeConversationId: null,
      panelPosition: null,
      panelSize: null,

      // Transient
      isSending: false,
      isConversationDrawerOpen: false,
      error: null,
      lastFailedAction: null,

      openAssistant: async () => {
        set({ isOpen: true, error: null });

        try {
          // fetchQuery populates the React Query cache. ConversationList mounts
          // concurrently (isOpen is already true) and its useConversations() call
          // deduplicates against this in-flight request — no second network call.
          // Using the global staleTime (5 min): fresh cache is reused, stale or
          // invalidated cache triggers a real fetch.
          const conversations = await queryClient.fetchQuery({
            queryKey: conversationsQueryKey,
            queryFn: ConversationApiService.fetchConversations,
          });

          if (conversations.length === 0) {
            await get().createConversation();
            return;
          }

          const { activeConversationId } = get();
          const activeExists = conversations.some((c) => c.id === activeConversationId);

          if (activeExists && activeConversationId) {
            get().setActiveConversation(activeConversationId);
          } else {
            const mostRecent = getMostRecentlyUpdatedConversation(conversations);
            if (mostRecent) {
              get().setActiveConversation(mostRecent.id);
            } else {
              await get().createConversation();
            }
          }
        } catch (error) {
          const userFriendlyError = getUserFriendlyApiError(error);
          set({ error: userFriendlyError, lastFailedAction: { type: "openAssistant" } });
        }
      },

      closeAssistant: () => {
        set({ isOpen: false, isConversationDrawerOpen: false });
      },

      toggleAssistant: () => {
        if (get().isOpen) {
          get().closeAssistant();
        } else {
          get().openAssistant();
        }
      },

      createConversation: async () => {
        try {
          set({ error: null });
          const conversation = await ConversationApiService.createConversation();
          set({
            activeConversationId: conversation.id,
            isConversationDrawerOpen: false,
          });
          // Invalidate so ConversationList and ConversationDrawer show the new entry.
          await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
        } catch (error) {
          const userFriendlyError = getUserFriendlyApiError(error);
          set({ error: userFriendlyError, lastFailedAction: { type: "createConversation" } });
        }
      },

      // Synchronous: just change which conversation is active.
      // useConversationMessages in MessageList reacts to the new ID automatically.
      setActiveConversation: (conversationId) => {
        set({
          activeConversationId: conversationId,
          isConversationDrawerOpen: false,
          error: null,
        });
      },

      deleteConversation: async (conversationId) => {
        try {
          set({ error: null });
          await ConversationApiService.deleteConversation(conversationId);

          // We know exactly what the new list looks like: the current cache minus
          // the deleted item. Update the cache directly so the UI reflects the
          // change instantly without a round-trip. A background invalidation then
          // confirms the server state.
          const cached =
            queryClient.getQueryData<ConversationSummary[]>(conversationsQueryKey) ?? [];
          const remaining = cached.filter((c) => c.id !== conversationId);
          queryClient.setQueryData(conversationsQueryKey, remaining);
          queryClient.invalidateQueries({ queryKey: conversationsQueryKey });

          const { activeConversationId } = get();

          if (remaining.length === 0) {
            await get().createConversation();
          } else if (activeConversationId === conversationId) {
            const mostRecent = getMostRecentlyUpdatedConversation(remaining);
            if (mostRecent) {
              get().setActiveConversation(mostRecent.id);
            }
          }
        } catch (error) {
          const userFriendlyError = getUserFriendlyApiError(error);
          set({ error: userFriendlyError, lastFailedAction: { type: "deleteConversation", conversationId } });
        }
      },

      sendMessage: async (content) => {
        const trimmedContent = content.trim();
        if (!trimmedContent || get().isSending) return;

        let { activeConversationId } = get();

        if (!activeConversationId) {
          await get().createConversation();
          activeConversationId = get().activeConversationId;

          if (!activeConversationId) {
            set({
              error: getUserFriendlyApiError(new Error("Failed to create conversation")),
              lastFailedAction: { type: "createConversation" },
            });
            return;
          }
        }

        // Stable key used for both setQueryData calls below.
        const messagesKey = [QUERY_KEYS.messages, activeConversationId] as const;

        // Unique id for the synthetic message so we can remove it on error
        // without relying on position, which may shift as data is updated.
        const optimisticId = `optimistic-${Date.now()}`;
        const optimisticMessage: ChatMessage = {
          id: optimisticId,
          role: "user",
          content: trimmedContent,
          createdAt: new Date().toISOString(),
        };

        try {
          set({ isSending: true, error: null });

          // Show the user's own message immediately — before any round-trip.
          // Only text typed by the user is injected; the assistant reply is
          // never guessed. The message is appended to the last (newest) page
          // so firstItemIndex logic and getPreviousPageParam cursors are untouched.
          queryClient.setQueryData<InfiniteData<MessagesPage>>(messagesKey, (old) => {
            if (!old?.pages.length) return old;
            const lastIdx = old.pages.length - 1;
            const updatedPages = old.pages.map((page, i) =>
              i === lastIdx
                ? { ...page, messages: [...page.messages, optimisticMessage] }
                : page,
            );
            return { ...old, pages: updatedPages };
          });

          await ChatApiService.sendChatMessage(activeConversationId, trimmedContent);

          // Before invalidating, trim the infinite query to exactly 1 page.
          //
          // WHY: invalidateQueries on a multi-page infinite query refetches ALL
          // loaded pages starting from initialPageParam. Each subsequent page is
          // derived via getPreviousPageParam applied to the NEWLY fetched page —
          // not the original older pages. This shifts the rowid cursor, so
          // previously loaded older pages cover a DIFFERENT message range after
          // the refetch, causing messages to disappear or appear at wrong positions.
          //
          // Trimming to 1 page first turns the refetch into a clean single-page
          // operation: only the latest page is replaced with server truth. Older
          // history (if any was loaded) is cleared, but remains accessible via
          // normal upward scroll / fetchPreviousPage.
          queryClient.setQueryData<InfiniteData<MessagesPage>>(messagesKey, (old) => {
            if (!old?.pages.length) return old;
            const lastPage = old.pages[old.pages.length - 1];
            return { pages: [lastPage], pageParams: [undefined] };
          });

          // Replace optimistic data with the canonical server response, which
          // now includes both the real user message and the assistant reply.
          await queryClient.invalidateQueries({
            queryKey: [QUERY_KEYS.messages, activeConversationId],
          });

          // Refresh conversations list (title updates after the first message).
          await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
        } catch (error) {
          // Remove the ghost message so the user doesn't see a stuck bubble.
          queryClient.setQueryData<InfiniteData<MessagesPage>>(messagesKey, (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.filter((m) => m.id !== optimisticId),
              })),
            };
          });

          const userFriendlyError = getUserFriendlyApiError(error);
          set({ error: userFriendlyError, lastFailedAction: { type: "sendMessage", content: trimmedContent } });
        } finally {
          set({ isSending: false });
        }
      },

      setPanelPosition: (position) => set({ panelPosition: position }),
      setPanelWidth: (width) => set({ panelSize: { width } }),

      openConversationDrawer: () => set({ isConversationDrawerOpen: true }),
      closeConversationDrawer: () => set({ isConversationDrawerOpen: false }),
      toggleConversationDrawer: () =>
        set((state) => ({ isConversationDrawerOpen: !state.isConversationDrawerOpen })),

      clearError: () => set({ error: null, lastFailedAction: null }),

      retryLastAction: async () => {
        const { lastFailedAction } = get();
        if (!lastFailedAction) return;

        // Clear before retrying so a successful retry leaves no stale action.
        // If the retry itself fails, the action will set a fresh lastFailedAction.
        set({ error: null, lastFailedAction: null });

        switch (lastFailedAction.type) {
          case "openAssistant":
            await get().openAssistant();
            break;
          case "createConversation":
            await get().createConversation();
            break;
          case "deleteConversation":
            await get().deleteConversation(lastFailedAction.conversationId);
            break;
          case "sendMessage":
            await get().sendMessage(lastFailedAction.content);
            break;
        }
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        isOpen: state.isOpen,
        activeConversationId: state.activeConversationId,
        panelPosition: state.panelPosition,
        panelSize: state.panelSize,
      }),
    },
  ),
);
