import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis } from '@repo/database/redis';
import { authenticateSocket } from './socket-auth';
import { registerChatHandlers } from './handlers/chat';
import { registerAdminHandlers } from './handlers/admin';
import { registerEmployeeHandlers } from './handlers/employee';
import { registerSystemHandlers } from './handlers/system';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from '@repo/types';

export type UnifiedServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export type UnifiedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Initializes the Socket.io server with Redis adapter and unified handlers.
 */
export function initRealtimeSocket(
  server: HttpServer | HttpsServer,
  options?: {
    enableSystemSubscribers?: boolean;
    registerCleanup?: (cleanup: () => void | Promise<void>) => void;
  }
) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : '*';

  const io: UnifiedServer = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  // 1. Redis Adapter Setup
  const pubClient = redis.duplicate({ enableOfflineQueue: true });
  const subClient = redis.duplicate({ enableOfflineQueue: true });
  io.adapter(createAdapter(pubClient, subClient));
  options?.registerCleanup?.(async () => {
    await Promise.allSettled([pubClient.quit(), subClient.quit()]);
  });

  // 2. System-wide Redis Subscribers (Alerts, Dashboard)
  if (options?.enableSystemSubscribers !== false) {
    const cleanupSystemHandlers = registerSystemHandlers(io);
    options?.registerCleanup?.(cleanupSystemHandlers);
  }

  // 3. Auth Middleware
  io.use(async (socket, next) => {
    try {
      const auth = await authenticateSocket(socket.handshake as unknown as Parameters<typeof authenticateSocket>[0]);
      if (auth) {
        socket.data.auth = auth;
        next();
      } else {
        next(new Error('Unauthorized'));
      }
    } catch (error) {
      console.error('Socket Auth Error:', error);
      next(new Error('Internal Server Error'));
    }
  });

  // 4. Connection Handler
  io.on('connection', (socket: UnifiedSocket) => {
    const auth = socket.data.auth!;
    // console.log('[SocketServer] Connected', {
    //   type: auth.type,
    //   id: auth.id,
    //   clientType: auth.clientType ?? null,
    //   sessionId: auth.sessionId ?? null,
    //   socketId: socket.id,
    // });

    // Register Handlers
    if (auth.type === 'admin') {
      registerAdminHandlers(io, socket);
      if (auth.permissions?.includes('chat:view')) {
        registerChatHandlers(io, socket);
      }
    } else {
      registerEmployeeHandlers(io, socket);
      registerChatHandlers(io, socket);
    }

    socket.on('subscribe_ticket', (ticketId: string) => {
      socket.join(`ticket:${ticketId}`);
    });

    socket.on('unsubscribe_ticket', (ticketId: string) => {
      socket.leave(`ticket:${ticketId}`);
    });

    // socket.on('disconnect', () => {
    //   console.log('[SocketServer] Disconnected', {
    //     type: auth.type,
    //     id: auth.id,
    //     clientType: auth.clientType ?? null,
    //     sessionId: auth.sessionId ?? null,
    //     socketId: socket.id,
    //   });
    // });
  });

  return io;
}

export const initSocket = initRealtimeSocket;
