import { useEffect, useRef } from 'react';
import { ServerToClientEvents } from '@repo/types';
import { Socket } from 'socket.io-client';
import { incrementTelemetryCounter } from '../utils/telemetry';

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

    const listener = (...args: unknown[]) => {
      incrementTelemetryCounter('socket.event.received', { event: String(event) });
      (handlerRef.current as (...listenerArgs: unknown[]) => void)(...args);
    };

    incrementTelemetryCounter('socket.listener.registered', { event: String(event) });
    socket.on(String(event), listener);

    return () => {
      socket.off(String(event), listener);
      incrementTelemetryCounter('socket.listener.removed', { event: String(event) });
    };
  }, [socket, event]);
}
