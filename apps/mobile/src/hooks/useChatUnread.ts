import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getSocket } from '../api/socket';
import { client } from '../api/client';
import { useAudioPlayer } from 'expo-audio';

export function useChatUnread() {
  const queryClient = useQueryClient();
  const player = useAudioPlayer(require('../../assets/audios/chat.wav'));

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['chat', 'unread'],
    queryFn: async () => {
      const response = await client.get('/api/shared/chat/unread');
      return response.data.count as number;
    },
  });

  useEffect(() => {
    let socketInstance: any = null;

    const setupSocket = async () => {
      const socket = await getSocket();
      if (socket) {
        socketInstance = socket;
        
        socket.on('new_message', (message: any) => {
          if (message.sender === 'admin') {
            // Optimistically update the cache
            queryClient.setQueryData(['chat', 'unread'], (old: number = 0) => old + 1);
            
            // Play sound
            if (player) {
              player.seekTo(0);
              player.play();
            }
          }
        });

        socket.on('messages_read', () => {
          // Optimistically reset count to 0 and invalidate cache
          queryClient.setQueryData(['chat', 'unread'], 0);
          queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
        });
      }
    };

    setupSocket();

    return () => {
      if (socketInstance) {
        socketInstance.off('new_message');
        socketInstance.off('messages_read');
      }
    };
  }, [queryClient, player]);

  return { 
    unreadCount, 
    refresh: () => queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] }) 
  };
}
