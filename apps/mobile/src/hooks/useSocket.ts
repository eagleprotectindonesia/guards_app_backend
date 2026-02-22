import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket } from '../api/socket';
import { incrementTelemetryCounter } from '../utils/telemetry';

/**
 * Hook to access the authenticated socket instance.
 */
export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let active = true;
    let cleanupSocketListeners: (() => void) | undefined;

    async function init() {
      const s = await getSocket();
      if (!active) return;

      if (s) {
        setSocket(s);
        setIsConnected(s.connected);

        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);

        s.on('connect', onConnect);
        s.on('disconnect', onDisconnect);
        incrementTelemetryCounter('socket.connection.listener.registered');

        cleanupSocketListeners = () => {
          s.off('connect', onConnect);
          s.off('disconnect', onDisconnect);
          incrementTelemetryCounter('socket.connection.listener.removed');
        };
      }
    }

    init();

    return () => {
      active = false;
      cleanupSocketListeners?.();
    };
  }, []);

  return { socket, isConnected };
}
