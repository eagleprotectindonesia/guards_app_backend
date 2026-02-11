import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis } from './redis';
import { authenticateSocket } from './socket-auth';
import { registerChatHandlers } from './socket/chat';
import { registerAdminHandlers } from './socket/admin';
import { registerEmployeeHandlers } from './socket/employee';
import { registerSystemHandlers } from './socket/system';
import { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  InterServerEvents, 
  SocketData 
} from '@repo/types';

export type UnifiedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type UnifiedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Initializes the Socket.io server with Redis adapter and unified handlers.
 */
export function initSocket(server: HttpServer | HttpsServer) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : '*';

  const io: UnifiedServer = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
    },
  });

  // 1. Redis Adapter Setup
  const pubClient = redis.duplicate({ enableOfflineQueue: true });
  const subClient = redis.duplicate({ enableOfflineQueue: true });
  io.adapter(createAdapter(pubClient, subClient));

  // 2. System-wide Redis Subscribers (Alerts, Dashboard)
  registerSystemHandlers(io);

  // 3. Auth Middleware
  io.use(async (socket, next) => {
    try {
      const auth = await authenticateSocket(socket.handshake);
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
    console.log(`Socket connected: ${auth.type} ${auth.id}`);

    // Register Handlers
    if (auth.type === 'admin') {
      registerAdminHandlers(io, socket);
    } else {
      registerEmployeeHandlers(io, socket);
    }

    registerChatHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${auth.type} ${auth.id}`);
    });
  });

  return io;
}
