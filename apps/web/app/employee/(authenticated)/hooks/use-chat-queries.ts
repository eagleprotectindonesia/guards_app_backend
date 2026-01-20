import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEmployeeApi } from './use-employee-api';

export interface ChatMessage {
  id: string;
  employeeId: string;
  adminId?: string | null;
  sender: 'admin' | 'guard' | 'employee';
  content: string;
  attachments: string[];
  createdAt: string;
  readAt?: string | null;
  admin?: {
    id: string;
    name: string;
  } | null;
}

export function useChatMessages(employeeId?: string) {
  const { fetchWithAuth } = useEmployeeApi();

  return useInfiniteQuery({
    queryKey: ['chat', 'messages', employeeId],
    queryFn: async ({ pageParam }) => {
      const url = new URL(`/api/chat/${employeeId}`, window.location.origin);
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
    enabled: !!employeeId,
  });
}

export function useUnreadCount() {
  const { fetchWithAuth } = useEmployeeApi();

  return useQuery({
    queryKey: ['chat', 'unread'],
    queryFn: async () => {
      const res = await fetchWithAuth('/api/chat/unread?role=employee');
      if (!res.ok) throw new Error('Failed to fetch unread count');
      return res.json() as Promise<{ count: number }>;
    },
  });
}
