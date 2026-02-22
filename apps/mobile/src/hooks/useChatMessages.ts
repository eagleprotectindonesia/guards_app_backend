import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, AppStateStatus, ViewToken } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { client } from '../api/client';
import { useSocketEvent } from './useSocketEvent';
import { ChatMessage, ClientToServerEvents, ServerToClientEvents } from '@repo/types';
import { ChatListItemData } from '../components/chat/ChatListItem';
import { Socket } from 'socket.io-client';
import { queryKeys } from '../api/queryKeys';
import { incrementTelemetryCounter } from '../utils/telemetry';

type ChatMessagesQueryData = {
  pages: ChatMessage[][];
  pageParams: (string | undefined)[];
};

const isMessageReadPayload = (
  value: unknown
): value is Parameters<ServerToClientEvents['messages_read']>[0] => {
  if (!value || typeof value !== 'object') return false;
  const payload = value as { messageIds?: unknown };
  return Array.isArray(payload.messageIds);
};

const emitMarkRead = (
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null,
  employeeId: string,
  messageIds: string[]
) => {
  if (!socket || messageIds.length === 0) return;
  socket.emit('mark_read', { employeeId, messageIds });
};

export function useChatMessages({
  employeeId,
  isAuthenticated,
  socket,
  t,
}: {
  employeeId?: string;
  isAuthenticated: boolean;
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  t: (key: string) => string;
}) {
  const queryClient = useQueryClient();
  const isFocusedRef = useRef(false);
  const lastForegroundSyncAtRef = useRef(0);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: queryKeys.chat.messages(employeeId),
    queryFn: async ({ pageParam }) => {
      if (!isAuthenticated || !employeeId) throw new Error('Not authenticated');
      const response = await client.get(`/api/shared/chat/${employeeId}`, {
        params: {
          limit: 15,
          cursor: pageParam,
        },
      });
      return response.data as ChatMessage[];
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => {
      if (lastPage.length < 15) return undefined;
      return lastPage[lastPage.length - 1].id;
    },
    enabled: !!employeeId,
  });

  const messages = useMemo(() => data?.pages.flat() || [], [data]);

  const messagesWithDates = useMemo<ChatListItemData[]>(() => {
    if (messages.length === 0) return [];

    const result: ChatListItemData[] = [];
    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      const next = messages[i + 1];

      result.push(current);

      if (!next || !isSameDay(new Date(current.createdAt), new Date(next.createdAt))) {
        result.push({
          type: 'date',
          date: current.createdAt,
          id: `date-${current.id}`,
        });
      }
    }
    return result;
  }, [messages]);

  const getDateLabel = useCallback(
    (date: string) => {
      const dateObject = new Date(date);
      if (isToday(dateObject)) return t('chat.today');
      if (isYesterday(dateObject)) return t('chat.yesterday');
      return format(dateObject, 'MMM d, yyyy');
    },
    [t]
  );

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      return () => {
        isFocusedRef.current = false;
      };
    }, [])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const isActive = nextAppState === 'active';
      const now = Date.now();
      const withinDebounceWindow = now - lastForegroundSyncAtRef.current < 10000;

      if (isActive && employeeId && !withinDebounceWindow) {
        const messageState = queryClient.getQueryState(queryKeys.chat.messages(employeeId));
        const unreadState = queryClient.getQueryState(queryKeys.chat.unread);
        const isMessagesStale = !messageState?.dataUpdatedAt || now - messageState.dataUpdatedAt > 30000;
        const isUnreadStale = !unreadState?.dataUpdatedAt || now - unreadState.dataUpdatedAt > 30000;

        if (isMessagesStale) {
          queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(employeeId) });
        }
        if (isUnreadStale) {
          queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
        }
        lastForegroundSyncAtRef.current = now;
      }
    });

    return () => {
      subscription.remove();
    };
  }, [employeeId, queryClient]);

  useEffect(() => {
    if (messages.length > 0 && socket && employeeId && isFocusedRef.current) {
      const unreadIds = messages.filter(m => m.sender === 'admin' && !m.readAt).map(m => m.id);
      emitMarkRead(socket, employeeId, unreadIds);
    }
  }, [messages, employeeId, socket]);

  useSocketEvent(socket, 'new_message', message => {
    if (!employeeId) return;

    queryClient.setQueryData<ChatMessagesQueryData>(queryKeys.chat.messages(employeeId), old => {
      if (!old) return old;

      const exists = old.pages.some((page: ChatMessage[]) => page.some(m => m.id === message.id));
      if (exists) return old;

      incrementTelemetryCounter('chat.message.received');
      return {
        ...old,
        pages: [[message, ...old.pages[0]], ...old.pages.slice(1)],
      };
    });

    if (isFocusedRef.current && message.sender === 'admin') {
      emitMarkRead(socket, employeeId, [message.id]);
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
  });

  useSocketEvent(socket, 'messages_read', data => {
    if (!employeeId) return;
    if (!isMessageReadPayload(data)) return;

    queryClient.setQueryData<ChatMessagesQueryData>(queryKeys.chat.messages(employeeId), old => {
      if (!old) return old;

      incrementTelemetryCounter('chat.message.read.sync');
      return {
        ...old,
        pages: old.pages.map((page: ChatMessage[]) =>
          page.map(msg => (data.messageIds?.includes(msg.id) ? { ...msg, readAt: new Date().toISOString() } : msg))
        ),
      };
    });

    queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
  });

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const topItem = viewableItems[viewableItems.length - 1];
        const item = topItem?.item as { createdAt?: string; date?: string } | undefined;
        const date = item?.createdAt || item?.date;
        if (date) {
          return getDateLabel(date);
        }
      }
      return null;
    },
    [getDateLabel]
  );

  return {
    messages,
    messagesWithDates,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    getDateLabel,
    onViewableItemsChanged,
  };
}
