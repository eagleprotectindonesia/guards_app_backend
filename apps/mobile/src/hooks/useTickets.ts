import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import { Ticket } from '@repo/types';
import { queryKeys } from '../api/queryKeys';

type TicketsResponse = {
  items: Ticket[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function useMyTickets() {
  return useQuery<TicketsResponse>({
    queryKey: queryKeys.tickets.list,
    queryFn: async () => {
      const res = await client.get('/api/employee/my/tickets');
      return res.data as TicketsResponse;
    },
  });
}
