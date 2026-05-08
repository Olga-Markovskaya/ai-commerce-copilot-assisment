import { useQuery } from "@tanstack/react-query";
import { ConversationApiService } from "../api/conversationApi";
import { getUserFriendlyApiError } from "../utils/apiError";
import { QUERY_KEYS } from "../../../lib/queryKeys";

export const conversationsQueryKey = [QUERY_KEYS.conversations] as const;

/**
 * React Query hook for the conversations list.
 *
 * This is the single source of truth for server-fetched conversations.
 * Components should read from here instead of Zustand.
 * Mutations (create, delete) should call queryClient.invalidateQueries
 * with `conversationsQueryKey` to keep the list fresh.
 */
export function useConversations() {
  const query = useQuery({
    queryKey: conversationsQueryKey,
    queryFn: ConversationApiService.fetchConversations,
    // No staleTime override — inherits the global 5-minute baseline from queryClient.ts.
    // Every mutation that changes the list (create, delete, sendMessage) calls
    // invalidateQueries(conversationsQueryKey) immediately, so the stale time only
    // matters for edge cases, not the normal flow.
  });

  return {
    conversations: query.data ?? [],
    isLoading: query.isLoading,
    // Convert raw Error to the app's UserFriendlyError shape so consumers
    // can use .type and .userMessage without importing the converter.
    error: query.error ? getUserFriendlyApiError(query.error) : null,
    refetch: query.refetch,
  };
}
