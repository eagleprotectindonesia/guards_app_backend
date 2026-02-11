import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket } from '../api/socket';

/**
 * Hook to access the authenticated socket instance.
 */
export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let active = true;

    async function init() {
      const s = await getSocket();
      if (!active) return;
      
      if (s) {
        setSocket(s as any);
        setIsConnected(s.connected);

        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);

        s.on('connect', onConnect);
        s.on('disconnect', onDisconnect);

        return () => {
          s.off('connect', onConnect);
          s.off('disconnect', onDisconnect);
        };
      }
    }

    init();

    return () => {
      active = false;
    };
  }, []);

  return { socket, isConnected };
}
