import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton QueryClient shared between the React tree (via QueryClientProvider)
 * and the Zustand store (for cache invalidation after mutations).
 *
 * Keeping it as a module-level singleton avoids passing queryClient through
 * props or context to non-React code like the assistant store.
 *
 * ── Default option rationale ─────────────────────────────────────────────────
 *
 * staleTime: 5 min
 *   Data is considered fresh for 5 minutes after fetching. In this app all
 *   mutations explicitly invalidate the relevant keys, so background refetches
 *   are driven by intent, not by a clock. The 5-minute window is a safety net
 *   for edge cases (e.g. another session modified data).
 *
 * gcTime: 10 min
 *   Inactive cache entries live for 10 minutes before being garbage-collected.
 *   This keeps conversation message caches alive while the user switches between
 *   conversations and returns — no need to re-fetch history they already loaded.
 *   Default is 5 min, which is too short for a chat sidebar UX.
 *
 * refetchOnWindowFocus: false
 *   Prevents background refetches when the user alt-tabs and returns to the app.
 *   For the message list this would reset the infinite scroll position and cause
 *   visible layout jumps. For this local-dev assessment app the data is not
 *   updated by other sessions, so focus-refetch has no value.
 *
 * refetchOnReconnect: true  (React Query default — made explicit here)
 *   After a network interruption the user's data may be stale. Refetching on
 *   reconnect is the right behaviour and has no side effects for this UX.
 *
 * retry: 1  (queries only)
 *   React Query's default of 3 retries is too aggressive for a chat UI: a dead
 *   backend means 3+ seconds of invisible waiting before an error is shown.
 *   One retry handles transient network hiccups without masking real failures.
 *
 * mutations.retry: 0
 *   Never retry mutations automatically. A duplicate sendMessage call would
 *   insert two identical messages and is not recoverable. The user must retry
 *   manually from the error UI.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
