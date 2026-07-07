import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { CalendarItem } from '@repo/types';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../contexts/AuthContext';

export type TaggedUserResult = {
  id: string;
  type: 'employee' | 'admin';
  name: string;
  email?: string;
  employeeNumber?: string;
};

type CalendarResponse = {
  items: CalendarItem[];
};

type CalendarDetailResponse = {
  item: {
    kind: string;
    data: Record<string, unknown>;
  };
};

type CalendarEventItemResponse = {
  item: Record<string, unknown>;
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

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await client.post('/api/employee/my/calendar/events', data);
      return res.data as CalendarEventItemResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await client.put(`/api/employee/my/calendar/events/${id}`, data);
      return res.data as CalendarEventItemResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.delete(`/api/employee/my/calendar/events/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export function useDuplicateCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.post(`/api/employee/my/calendar/events/${id}/duplicate`);
      return res.data as CalendarEventItemResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

type UserSearchResponse = {
  users: TaggedUserResult[];
};

export function useUserSearch(query: string) {
  const { isAuthenticated } = useAuth();
  const enabled = isAuthenticated && query.length >= 2;

  return useQuery<UserSearchResponse>({
    queryKey: queryKeys.users.search(query),
    enabled,
    queryFn: async () => {
      const res = await client.get(`/api/employee/my/users/search?q=${encodeURIComponent(query)}`);
      return res.data as UserSearchResponse;
    },
    staleTime: 1000 * 30,
  });
}
