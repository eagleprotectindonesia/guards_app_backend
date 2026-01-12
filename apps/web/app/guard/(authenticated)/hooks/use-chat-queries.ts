import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useGuardApi } from './use-guard-api';

export interface ChatMessage {
  id: string;
  guardId: string;
  adminId?: string | null;
  sender: 'admin' | 'guard';
  content: string;
  createdAt: string;
  readAt?: string | null;
  admin?: {
    id: string;
    name: string;
  } | null;
}

export function useChatMessages(guardId?: string) {
  const { fetchWithAuth } = useGuardApi();

  return useInfiniteQuery({
    queryKey: ['chat', 'messages', guardId],
    queryFn: async ({ pageParam }) => {
      const url = new URL(`/api/chat/${guardId}`, window.location.origin);
      url.searchParams.set('limit', '20');
      if (pageParam) {
        url.searchParams.set('cursor', pageParam);
      }
      
      const res = await fetchWithAuth(url.toString());
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json() as Promise<ChatMessage[]>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 20) return undefined;
      return lastPage[lastPage.length - 1].id;
    },
    enabled: !!guardId,
  });
}

export function useUnreadCount() {
  const { fetchWithAuth } = useGuardApi();

  return useQuery({
    queryKey: ['chat', 'unread'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/chat/unread?role=guard');
      if (!res.ok) throw new Error('Failed to fetch unread count');
      return res.json() as Promise<{ count: number }>;
    },
  });
}
