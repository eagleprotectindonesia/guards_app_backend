import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, AppStateStatus, ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { client } from '../api/client';
import { useSocketEvent } from './useSocketEvent';
import { ClientToServerEvents, GroupChatMessage, ServerToClientEvents } from '@repo/types';
import { ChatListItemData } from '../components/chat/ChatListItem';
import { Socket } from 'socket.io-client';
import { queryKeys } from '../api/queryKeys';
import { incrementTelemetryCounter } from '../utils/telemetry';

type GroupChatMessagesQueryData = {
  pages: GroupChatMessage[][];
  pageParams: (string | undefined)[];
};

const emitGroupMarkRead = (
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null,
  groupId: string,
  messageIds: string[]
) => {
  if (!socket || messageIds.length === 0) return;
  socket.emit('group_mark_read', { groupId, messageIds });
};

export function useGroupChatMessages({
  groupId,
  isAuthenticated,
  socket,
  t,
}: {
  groupId?: string;
  isAuthenticated: boolean;
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  t: (key: string) => string;
}) {
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const lastForegroundSyncAtRef = useRef(0);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: queryKeys.chat.groupMessages(groupId),
    queryFn: async ({ pageParam }) => {
      if (!isAuthenticated || !groupId) throw new Error('Not authenticated');
      const response = await client.get(`/api/shared/group-chat/${groupId}/messages`, {
        params: { limit: 15, cursor: pageParam },
      });
      return response.data as GroupChatMessage[];
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => {
      if (lastPage.length < 15) return undefined;
      return lastPage[lastPage.length - 1].id;
    },
    enabled: !!groupId,
  });

  const messages = useMemo(() => data?.pages.flat() || [], [data]);

  const messagesWithDates = useMemo<ChatListItemData[]>(() => {
    if (messages.length === 0) return [];
    const result: ChatListItemData[] = [];
    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      const next = messages[i + 1];
      result.push(current as unknown as ChatListItemData);
      if (!next || !isSameDay(new Date(current.createdAt), new Date(next.createdAt))) {
        result.push({ type: 'date', date: current.createdAt, id: `date-${current.id}` });
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

  const reconcileSince = useCallback(async () => {
    if (!groupId) return;
    const cached = queryClient.getQueryData<GroupChatMessagesQueryData>(queryKeys.chat.groupMessages(groupId));
    const latestMessage = cached?.pages?.[0]?.[0];
    if (!latestMessage) {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.groupMessages(groupId) });
      return;
    }

    try {
      const response = await client.get(`/api/shared/group-chat/${groupId}/messages`, {
        params: { since: latestMessage.createdAt },
      });
      const newMessages: GroupChatMessage[] = response.data;
      if (newMessages.length === 0) return;

      queryClient.setQueryData<GroupChatMessagesQueryData>(queryKeys.chat.groupMessages(groupId), old => {
        if (!old) return old;
        const existingIds = new Set(old.pages.flat().map(m => m.id));
        const toAdd = newMessages.filter(m => !existingIds.has(m.id)).reverse();
        if (toAdd.length === 0) return old;
        return { ...old, pages: [[...toAdd, ...old.pages[0]], ...old.pages.slice(1)] };
      });
    } catch {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.groupMessages(groupId) });
    }
  }, [groupId, queryClient]);

  useEffect(() => {
    let previousAppState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const isRealForeground = previousAppState === 'background' && nextAppState === 'active';
      previousAppState = nextAppState;
      const now = Date.now();
      const withinDebounceWindow = now - lastForegroundSyncAtRef.current < 10000;
      if (isRealForeground && groupId && !withinDebounceWindow) {
        reconcileSince();
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.groupList });
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.inbox });
        lastForegroundSyncAtRef.current = now;
      }
    });

    return () => subscription.remove();
  }, [groupId, queryClient, reconcileSince]);

  useEffect(() => {
    if (messages.length > 0 && socket && groupId && isFocused) {
      const unreadIds = messages.filter(m => m.senderType !== 'employee').map(m => m.id);
      if (unreadIds.length > 0) {
        emitGroupMarkRead(socket, groupId, unreadIds);
      }
    }
  }, [messages, groupId, isFocused, socket]);

  useSocketEvent(socket, 'group_new_message', message => {
    if (!groupId || message.groupId !== groupId) return;
    queryClient.setQueryData<GroupChatMessagesQueryData>(queryKeys.chat.groupMessages(groupId), old => {
      if (!old) return old;
      const exists = old.pages.some(page => page.some(m => m.id === message.id));
      if (exists) return old;
      incrementTelemetryCounter('chat.group.message.received');
      return { ...old, pages: [[message, ...old.pages[0]], ...old.pages.slice(1)] };
    });

    if (isFocused) {
      emitGroupMarkRead(socket, groupId, [message.id]);
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.chat.groupList });
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.inbox });
  });

  useSocketEvent(socket, 'group_messages_read', data => {
    if (!groupId || data.groupId !== groupId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.groupList });
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.inbox });
  });

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const topItem = viewableItems[viewableItems.length - 1];
        const item = topItem?.item as { createdAt?: string; date?: string } | undefined;
        const date = item?.createdAt || item?.date;
        if (date) return getDateLabel(date);
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
