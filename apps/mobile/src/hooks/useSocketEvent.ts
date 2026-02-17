import { useEffect, useRef } from 'react';
import { ServerToClientEvents } from '@repo/types';
import { Socket } from 'socket.io-client';

/**
 * Declarative hook for listening to Socket.io events with automatic cleanup.
 */
export function useSocketEvent<T extends keyof ServerToClientEvents>(
  socket: Socket | null,
  event: T,
  handler: ServerToClientEvents[T]
) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket) return;

    const listener = (...args: any[]) => {
      // @ts-ignore
      handlerRef.current(...args);
    };

    socket.on(event as any, listener);

    return () => {
      socket.off(event as any, listener);
    };
  }, [socket, event]);
}
