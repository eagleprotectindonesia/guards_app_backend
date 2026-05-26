import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppState, AppStateStatus } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { ChatMessage, GroupChatConversation } from '@repo/types';
import { queryKeys } from '../api/queryKeys';
import { client } from '../api/client';
import { useSocketEvent } from './useSocketEvent';
import { useEffect } from 'react';
import { useSocket } from './useSocket';
import { parseGroupChatListPayload } from '../lib/chat-inbox';
import { incrementTelemetryCounter } from '../utils/telemetry';

export function useChatTabUnread() {
  const queryClient = useQueryClient();
  const player = useAudioPlayer(require('../../assets/audios/chat.wav'));
  const { socket } = useSocket();

  useEffect(() => {
    let isMounted = true;

    const configureAudio = async () => {
      try {
        await setAudioModeAsync({
          allowsRecording: false,
          interruptionMode: 'mixWithOthers',
          playsInSilentMode: false,
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
        });
      } catch (error) {
        if (isMounted) {
          console.error('[ChatTabUnread] Failed to configure audio mode', error);
        }
      }
    };

    configureAudio();
    return () => {
      isMounted = false;
    };
  }, []);

  const { data: directUnreadCount = 0 } = useQuery({
    queryKey: queryKeys.chat.unread,
    queryFn: async () => {
      const response = await client.get('/api/shared/chat/unread');
      return response.data.count as number;
    },
  });

  const { data: groupConversations = [] } = useQuery({
    queryKey: queryKeys.chat.groupList,
    queryFn: async () => {
      const response = await client.get('/api/shared/group-chat', { params: { view: 'inbox' } });
      return parseGroupChatListPayload(response.data) as GroupChatConversation[];
    },
  });

  const groupUnreadCount = useMemo(
    () => groupConversations.reduce((sum, group) => sum + (group.unreadCount ?? 0), 0),
    [groupConversations]
  );

  const unreadCount = directUnreadCount + groupUnreadCount;

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.groupList });
  }, [queryClient]);

  useSocketEvent(socket, 'new_message', (message: ChatMessage) => {
    if (message.sender !== 'admin') return;
    refreshAll();
    incrementTelemetryCounter('chat.unread.server_synced');

    if (player) {
      try {
        player.seekTo(0);
        player.play();
      } catch (error) {
        console.error('[ChatTabUnread] Failed to play chat notification sound', error);
      }
    }
  });

  useSocketEvent(socket, 'messages_read', () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
    incrementTelemetryCounter('chat.unread.reset');
  });

  useSocketEvent(socket, 'group_new_message', () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.groupList });
  });

  useSocketEvent(socket, 'group_messages_read', () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.groupList });
  });

  useEffect(() => {
    let previousAppState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (previousAppState === 'background' && nextAppState === 'active') {
        refreshAll();
      }
      previousAppState = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [refreshAll]);

  return {
    unreadCount,
    directUnreadCount,
    groupUnreadCount,
    refresh: refreshAll,
  };
}
