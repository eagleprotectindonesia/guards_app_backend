import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import { CalendarItem } from '@repo/types';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../contexts/AuthContext';

type CalendarResponse = {
  items: CalendarItem[];
};

type CalendarDetailResponse = {
  item: {
    kind: string;
    data: Record<string, unknown>;
  };
};

export function useCalendarEvents(from: string, to: string) {
  const { isAuthenticated } = useAuth();

  return useQuery<CalendarResponse>({
    queryKey: queryKeys.calendar.list(from, to),
    enabled: isAuthenticated && !!from && !!to,
    queryFn: async () => {
      const res = await client.get(`/api/employee/my/calendar?from=${from}&to=${to}`);
      return res.data as CalendarResponse;
    },
    staleTime: 1000 * 60,
  });
}

export function useCalendarItem(type: string, id: string) {
  const { isAuthenticated } = useAuth();

  return useQuery<CalendarDetailResponse>({
    queryKey: queryKeys.calendar.item(type, id),
    enabled: isAuthenticated && !!type && !!id,
    queryFn: async () => {
      const res = await client.get(`/api/employee/my/calendar/items/${type}/${id}`);
      return res.data as CalendarDetailResponse;
    },
  });
}
