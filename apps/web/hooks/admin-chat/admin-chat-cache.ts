import { InfiniteData, QueryClient } from '@tanstack/react-query';
import { Conversation } from '@/types/chat';

type ConversationPageResponse = { conversations: Conversation[]; nextCursor: string | null };
type ConversationView = 'inbox' | 'unread' | 'archived';

export function invalidateConversationQueries(
  queryClient: QueryClient,
  conversationQueryKey: readonly ['admin', 'chat', 'conversations', ConversationView, string],
  view?: ConversationView
) {
  void queryClient.invalidateQueries({
    queryKey: view ? ['admin', 'chat', 'conversations', view] : conversationQueryKey.slice(0, 3),
  });
}

export function updateConversationInCache(
  queryClient: QueryClient,
  conversationQueryKey: readonly ['admin', 'chat', 'conversations', ConversationView, string],
  employeeId: string,
  updater: (conv: Conversation) => Conversation
) {
  queryClient.setQueryData<InfiniteData<ConversationPageResponse>>(conversationQueryKey, old => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map(page => ({
        ...page,
        conversations: page.conversations.map(conv => (conv.employeeId === employeeId ? updater(conv) : conv)),
      })),
    };
  });
}

export function reorderConversationInCache(
  queryClient: QueryClient,
  conversationQueryKey: readonly ['admin', 'chat', 'conversations', ConversationView, string],
  employeeId: string
) {
  queryClient.setQueryData<InfiniteData<ConversationPageResponse>>(conversationQueryKey, old => {
    if (!old) return old;
    const allConvs = old.pages.flatMap(p => p.conversations);
    const idx = allConvs.findIndex(c => c.employeeId === employeeId);
    if (idx <= 0) return old;
    const [moved] = allConvs.splice(idx, 1);
    allConvs.unshift(moved);
    const pageSizes = old.pages.map(p => p.conversations.length);
    let offset = 0;
    const newPages = old.pages.map((page, i) => ({
      ...page,
      conversations: allConvs.slice(offset, (offset += pageSizes[i])),
    }));
    return { ...old, pages: newPages };
  });
}
