import { io, Socket } from 'socket.io-client';
import type { Admin, Employee } from '@repo/database';
import { generateAdminToken, generateEmployeeToken } from '../fixtures/auth';

const SOCKET_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Create a Socket.io client for testing
 */
export function createSocketClient(token: string): Socket {
  return io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
}

/**
 * Create an authenticated Socket.io client for an employee
 */
export function createEmployeeSocket(employee: Employee): Socket {
  const token = generateEmployeeToken(employee);
  return createSocketClient(token);
}

/**
 * Create an authenticated Socket.io client for an admin
 */
export function createAdminSocket(admin: Admin): Socket {
  const token = generateAdminToken(admin);
  return createSocketClient(token);
}

/**
 * Wait for a specific Socket.io event with timeout
 */
export function waitForSocketEvent<T = any>(
  socket: Socket,
  eventName: string,
  timeoutMs: number = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeoutMs);

    const handler = (data: T) => {
      clearTimeout(timeout);
      socket.off(eventName, handler);
      resolve(data);
    };

    socket.on(eventName, handler);
  });
}

/**
 * Connect socket and wait for connection
 */
export async function connectSocket(socket: Socket, timeoutMs: number = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Socket connection timeout'));
    }, timeoutMs);

    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve();
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.connect();
  });
}

/**
 * Disconnect socket and cleanup
 */
export function disconnectSocket(socket: Socket): void {
  socket.removeAllListeners();
  socket.disconnect();
}
