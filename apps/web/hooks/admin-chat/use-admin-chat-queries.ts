'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ChatMessage, Conversation } from '@/types/chat';

type ConversationView = 'inbox' | 'unread' | 'archived';
type ConversationPageResponse = { conversations: Conversation[]; nextCursor: string | null };

interface UseAdminChatQueriesParams {
  activeView: ConversationView;
  debouncedSearch: string;
  activeEmployeeId: string | null;
}

export function useAdminChatQueries({ activeView, debouncedSearch, activeEmployeeId }: UseAdminChatQueriesParams) {
  const conversationQueryKey = useMemo(
    () => ['admin', 'chat', 'conversations', activeView, debouncedSearch] as const,
    [activeView, debouncedSearch]
  );

  const {
    data: conversationData,
    fetchNextPage: fetchNextConversationPage,
    hasNextPage: hasNextConversationPage,
    isFetchingNextPage: isFetchingNextConversationPage,
    isLoading: isConversationsLoading,
  } = useInfiniteQuery({
    queryKey: conversationQueryKey,
    queryFn: async ({ pageParam }) => {
      const url = new URL('/api/shared/chat/conversations', window.location.origin);
      url.searchParams.set('view', activeView);
      url.searchParams.set('limit', '10');
      if (pageParam) url.searchParams.set('cursor', pageParam);
      if (debouncedSearch) url.searchParams.set('search', debouncedSearch);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch conversations');
      return res.json() as Promise<ConversationPageResponse>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 30,
  });

  const persistedConversations = useMemo<Conversation[]>(() => {
    return conversationData?.pages.flatMap(p => p.conversations) ?? [];
  }, [conversationData]);

  const {
    data: messageData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isMessagesLoading,
  } = useInfiniteQuery({
    queryKey: ['admin', 'chat', 'messages', activeEmployeeId],
    queryFn: async ({ pageParam }) => {
      if (!activeEmployeeId) return [];
      const url = new URL(`/api/shared/chat/${activeEmployeeId}`, window.location.origin);
      url.searchParams.set('limit', '20');
      if (pageParam) {
        url.searchParams.set('cursor', pageParam);
      }
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json() as Promise<ChatMessage[]>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => {
      if (lastPage.length < 20) return undefined;
      return lastPage[lastPage.length - 1].id;
    },
    enabled: !!activeEmployeeId,
    staleTime: 1000 * 60,
  });

  const messages = useMemo(() => {
    const allMessages = messageData?.pages.flat() || [];
    return [...allMessages].reverse();
  }, [messageData]);

  return {
    conversationQueryKey,
    persistedConversations,
    fetchNextConversationPage,
    hasNextConversationPage,
    isFetchingNextConversationPage,
    isConversationsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isMessagesLoading,
    messages,
  };
}
