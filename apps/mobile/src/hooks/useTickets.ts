import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { Ticket } from '@repo/types';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../contexts/AuthContext';

type TicketsResponse = {
  items: Ticket[];
  nextCursor: string | null;
  hasMore: boolean;
};

export interface TicketMessage {
  id: string;
  body: string;
  createdAt: string;
  admin?: { id: string; name: string } | null;
  employee?: { id: string; fullName: string } | null;
  attachments?: {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    publicUrl?: string | null;
  }[];
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
  attachments: {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    publicUrl?: string | null;
  }[];
}

export function useMyTickets() {
  return useQuery<TicketsResponse>({
    queryKey: queryKeys.tickets.list,
    queryFn: async () => {
      const res = await client.get('/api/employee/my/tickets');
      return res.data as TicketsResponse;
    },
  });
}

export function useTicketDetail(id: string) {
  return useQuery<{ ticket: TicketDetail }>({
    queryKey: [...queryKeys.tickets.list, id],
    queryFn: async () => {
      const res = await client.get(`/api/employee/my/tickets/${id}`);
      return res.data as { ticket: TicketDetail };
    },
    enabled: !!id,
  });
}

export function useSendTicketMessage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await client.post(`/api/employee/my/tickets/${id}/messages`, { body });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.tickets.list, id] });
    },
  });
}

export function useClaimTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await client.post(`/api/employee/my/tickets/${id}/claim`);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.tickets.list, id] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.list });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.tickets.list, 'unassigned-count'] });
    },
  });
}



export function useUnassignedTicketsCount() {
  const { isAuthenticated } = useAuth();
  return useQuery<{ count: number }>({
    queryKey: [...queryKeys.tickets.list, 'unassigned-count'],
    queryFn: async () => {
      const res = await client.get('/api/employee/my/tickets/unassigned-count');
      return res.data as { count: number };
    },
    enabled: isAuthenticated,
  });
}
