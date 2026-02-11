'use client';

import { useEffect, useRef } from 'react';
import { useSocket } from '@/components/socket-provider';
import { ServerToClientEvents } from '@repo/types';

/**
 * Declarative hook for listening to Socket.io events with automatic cleanup.
 *
 * @param event The event name to listen for
 * @param handler The callback to execute when the event is received
 */
export function useSocketEvent<T extends keyof ServerToClientEvents>(event: T, handler: ServerToClientEvents[T]) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);

  // Update ref so we always use the latest handler without re-subscribing
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket) return;

    // We use a wrapper to ensure we always call the LATEST handler from ref
    const listener = (args: Parameters<ServerToClientEvents[T]>) => {
      handlerRef.current(...[args]);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on(event as any, listener);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.off(event as any, listener);
    };
  }, [socket, event]);
}
