import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ConversationApiService, type ChatMessage } from "../api/conversationApi";
import { QUERY_KEYS } from "../../../lib/queryKeys";

const PAGE_SIZE = 10;

/**
 * Cursor-based infinite query for conversation messages.
 *
 * Pages are ordered oldest-first in `data.pages` because React Query prepends
 * pages fetched via `fetchPreviousPage`. Flatten in the same order to produce
 * a single chronological message array for rendering.
 *
 * Query key: ['messages', conversationId]
 * Invalidate this key after a sendMessage to refresh the latest page.
 */
export function useConversationMessages(conversationId: string | null) {
  const query = useInfiniteQuery({
    queryKey: [QUERY_KEYS.messages, conversationId],
    queryFn: ({ pageParam }) =>
      ConversationApiService.fetchMessages(
        conversationId!,
        PAGE_SIZE,
        pageParam as string | undefined,
      ),
    enabled: !!conversationId,
    // No cursor on the initial fetch — returns the latest PAGE_SIZE messages.
    initialPageParam: undefined as string | undefined,
    // `firstPage` is data.pages[0], the oldest page currently loaded.
    // Return its nextCursor so fetchPreviousPage knows what to ask for.
    getPreviousPageParam: (firstPage) =>
      firstPage.hasMore ? (firstPage.nextCursor ?? undefined) : undefined,
    // New messages arrive via cache invalidation after sendMessage, not by
    // scrolling forward. React Query still requires this to be defined.
    getNextPageParam: () => undefined,
  });

  // Flatten all pages into a single chronological array.
  // data.pages[0] is the oldest page (prepended by fetchPreviousPage);
  // data.pages[last] is the most recently fetched (newest) page.
  const messages: ChatMessage[] = useMemo(
    () => query.data?.pages.flatMap((page) => page.messages) ?? [],
    [query.data],
  );

  return {
    messages,
    isLoading: query.isLoading,
    isFetchingPreviousPage: query.isFetchingPreviousPage,
    hasPreviousPage: query.hasPreviousPage,
    fetchPreviousPage: query.fetchPreviousPage,
    error: query.error,
  };
}
