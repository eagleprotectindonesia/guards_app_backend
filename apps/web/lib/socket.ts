import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis } from './redis';
import { authenticateSocket } from './socket-auth';
import { saveMessage, markAsRead } from './data-access/chat';
import '../types/socket'; // Import to ensure module augmentation is applied

export function initSocket(server: HttpServer) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*', // Adjust in production
      methods: ['GET', 'POST'],
    },
  });

  // Setup Redis Adapter for horizontal scaling / blue-green deployment
  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  
  // Handle Redis errors for the adapter
  pubClient.on('error', (err) => console.error('Socket.io Redis PubClient Error:', err));
  subClient.on('error', (err) => console.error('Socket.io Redis SubClient Error:', err));

  io.adapter(createAdapter(pubClient, subClient));

  io.use(async (socket, next) => {
    const auth = await authenticateSocket(socket.handshake);
    if (auth) {
      socket.auth = auth;
      next();
    } else {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const auth = socket.auth!;
    console.log(`Socket connected: ${auth.type} ${auth.id} (${auth.name})`);

    if (auth.type === 'admin') {
      socket.join('admin');
    } else {
      socket.join(`guard:${auth.id}`);
    }

    socket.on('send_message', async (data: { content: string; guardId?: string }) => {
      try {
        if (auth.type === 'guard') {
          // Guard sending to admins
          const message = await saveMessage({
            guardId: auth.id,
            sender: 'guard',
            content: data.content,
          });
          
          io.to('admin').emit('new_message', message);
          // Also send back to guard (for multi-device sync if needed)
          socket.emit('new_message', message);
          
        } else if (auth.type === 'admin' && data.guardId) {
          // Admin sending to a specific guard
          const message = await saveMessage({
            guardId: data.guardId,
            adminId: auth.id,
            sender: 'admin',
            content: data.content,
          });

          io.to(`guard:${data.guardId}`).emit('new_message', message);
          io.to('admin').emit('new_message', message);
        }
      } catch (error) {
        console.error('Error handling send_message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('mark_read', async (data: { guardId?: string; messageIds: string[] }) => {
      try {
        const targetGuardId = auth.type === 'admin' ? data.guardId : auth.id;
        
        if (!targetGuardId) {
          console.error('mark_read: Missing guardId');
          return;
        }

        await markAsRead(data.messageIds);
        
        if (auth.type === 'admin') {
          // Notify the guard that admin read their messages
          io.to(`guard:${targetGuardId}`).emit('messages_read', {
            messageIds: data.messageIds,
            readBy: auth.id,
          });
          // Also notify admins (to update unread counts in UI)
          io.to('admin').emit('messages_read', {
            guardId: targetGuardId,
            messageIds: data.messageIds,
          });
        } else {
          // Notify admins that guard read their messages
          io.to('admin').emit('messages_read', {
            guardId: targetGuardId,
            messageIds: data.messageIds,
          });
          // Also notify the guard themselves (for other sessions/hooks)
          io.to(`guard:${targetGuardId}`).emit('messages_read', {
            messageIds: data.messageIds,
          });
        }
      } catch (error) {
        console.error('Error handling mark_read:', error);
      }
    });

    socket.on('typing', (data: { guardId?: string; isTyping: boolean }) => {
      if (auth.type === 'guard') {
        io.to('admin').emit('typing', { guardId: auth.id, isTyping: data.isTyping });
      } else if (auth.type === 'admin' && data.guardId) {
        io.to(`guard:${data.guardId}`).emit('typing', { isTyping: data.isTyping });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${auth.type} ${auth.id}`);
    });
  });

  return io;
}
