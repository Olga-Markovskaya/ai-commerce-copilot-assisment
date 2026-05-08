/**
 * Central registry of React Query key names.
 *
 * Only the static string segments live here. Dynamic parts (e.g. conversationId)
 * are still composed at the call site so the key shapes remain unchanged:
 *
 *   [QUERY_KEYS.conversations]               → ['conversations']
 *   [QUERY_KEYS.messages, conversationId]    → ['messages', '<id>']
 */
export const QUERY_KEYS = {
  conversations: "conversations",
  messages: "messages",
  product: "product",
} as const;
