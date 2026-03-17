import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getSocket } from '../api/socket';
import { client } from '../api/client';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { queryKeys } from '../api/queryKeys';
import { ChatMessage, ServerToClientEvents } from '@repo/types';
import { incrementTelemetryCounter } from '../utils/telemetry';

export function useChatUnread() {
  const queryClient = useQueryClient();
  const player = useAudioPlayer(require('../../assets/audios/chat.wav'));

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
          console.error('[ChatUnread] Failed to configure audio mode', error);
        }
      }
    };

    configureAudio();

    return () => {
      isMounted = false;
    };
  }, []);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: queryKeys.chat.unread,
    queryFn: async () => {
      const response = await client.get('/api/shared/chat/unread');
      return response.data.count as number;
    },
  });

  useEffect(() => {
    let socketInstance: Awaited<ReturnType<typeof getSocket>> | null = null;
    const handleNewMessage: ServerToClientEvents['new_message'] = (message: ChatMessage) => {
      if (message.sender === 'admin') {
        // Invalidate from server — avoids count drift from optimistic increments.
        // Sound plays immediately; badge updates after the ~200ms round-trip.
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
        incrementTelemetryCounter('chat.unread.server_synced');

        // Play sound
        if (player) {
          try {
            player.seekTo(0);
            player.play();
          } catch (error) {
            console.error('[ChatUnread] Failed to play chat notification sound', error);
          }
        }
      }
    };
    const handleMessagesRead = () => {
      // Optimistically reset count to 0 and invalidate cache
      queryClient.setQueryData(queryKeys.chat.unread, 0);
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
      incrementTelemetryCounter('chat.unread.reset');
    };

    const setupSocket = async () => {
      const socket = await getSocket();
      if (socket) {
        socketInstance = socket;

        socket.on('new_message', handleNewMessage);
        socket.on('messages_read', handleMessagesRead);
      }
    };

    setupSocket();

    return () => {
      if (socketInstance) {
        socketInstance.off('new_message', handleNewMessage);
        socketInstance.off('messages_read', handleMessagesRead);
      }
    };
  }, [queryClient, player]);

  // Re-sync unread count whenever the app returns from background.
  // Socket events are missed during disconnection, so we must re-fetch here.
  // This hook is always mounted (tab-bar), making it the right owner of this logic.
  useEffect(() => {
    let previousAppState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (previousAppState === 'background' && nextAppState === 'active') {
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
      }
      previousAppState = nextAppState;
    });
    return () => subscription.remove();
  }, [queryClient]);

  return {
    unreadCount,
    refresh: () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread }),
  };
}
