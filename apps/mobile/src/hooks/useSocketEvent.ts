import { useEffect, useRef } from 'react';
import { ServerToClientEvents } from '@repo/types';
import { useSocket } from './useSocket';

/**
 * Declarative hook for listening to Socket.io events with automatic cleanup.
 */
export function useSocketEvent<T extends keyof ServerToClientEvents>(
  event: T,
  handler: ServerToClientEvents[T]
) {
  const { socket } = useSocket();
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
