import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { client } from '../api/client';
import { Ticket } from '@repo/types';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../contexts/AuthContext';
import { getSocket } from '../api/socket';
import { incrementTelemetryCounter } from '../utils/telemetry';
import type { ServerToClientEvents } from '@repo/types';

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
  employee?: { id: string; fullName: string; employeeNumber?: string | null } | null;
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
    mutationFn: async ({ body, attachments }: { body: string; attachments?: any[] }) => {
      const res = await client.post(`/api/employee/my/tickets/${id}/messages`, { body, attachments });
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

export function useUpdateTicketStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (status: Ticket['status']) => {
      const res = await client.patch(`/api/employee/my/tickets/${id}`, { status });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.tickets.list, id] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.list });
    },
  });
}



export function useUnassignedTicketsCount() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const unassignedQueryKey = [...queryKeys.tickets.list, 'unassigned-count'];

  useEffect(() => {
    let socketInstance: Awaited<ReturnType<typeof getSocket>> | null = null;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.tickets.list, 'unassigned-count'] });
      incrementTelemetryCounter('tickets.unassigned.server_synced');
    };

    const setupSocket = async () => {
      const socket = await getSocket();
      if (socket) {
        socketInstance = socket;
        socket.on('ticket_created', invalidate);
        socket.on('ticket_status_updated', invalidate);
      }
    };
    setupSocket();

    return () => {
      if (socketInstance) {
        socketInstance.off('ticket_created', invalidate);
        socketInstance.off('ticket_status_updated', invalidate);
      }
    };
  }, [queryClient]);

  return useQuery<{ count: number }>({
    queryKey: unassignedQueryKey,
    queryFn: async () => {
      const res = await client.get('/api/employee/my/tickets/unassigned-count');
      return res.data as { count: number };
    },
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
}
