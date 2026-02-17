import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getSocket } from '../api/socket';
import { client } from '../api/client';
import { useAudioPlayer } from 'expo-audio';
import { queryKeys } from '../api/queryKeys';
import { ChatMessage, ServerToClientEvents } from '@repo/types';
import { incrementTelemetryCounter } from '../utils/telemetry';

export function useChatUnread() {
  const queryClient = useQueryClient();
  const player = useAudioPlayer(require('../../assets/audios/chat.wav'));

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
        // Optimistically update the cache
        queryClient.setQueryData(queryKeys.chat.unread, (old: number = 0) => old + 1);
        incrementTelemetryCounter('chat.unread.incremented');

        // Play sound
        if (player) {
          player.seekTo(0);
          player.play();
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

  return {
    unreadCount,
    refresh: () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread }),
  };
}
