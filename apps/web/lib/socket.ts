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
  pubClient.on('error', err => console.error('Socket.io Redis PubClient Error:', err));
  subClient.on('error', err => console.error('Socket.io Redis SubClient Error:', err));

  io.adapter(createAdapter(pubClient, subClient));

  io.use(async (socket, next) => {
    try {
      const auth = await authenticateSocket(socket.handshake);
      if (auth) {
        socket.auth = auth;
        console.log(`Socket ${socket.id} authenticated as ${auth.type} ${auth.id}`);
        next();
      } else {
        console.warn(`Socket ${socket.id} authentication failed`);
        next(new Error('Unauthorized'));
      }
    } catch (error) {
      console.error(`Socket ${socket.id} authentication error:`, error);
      next(new Error('Internal Server Error'));
    }
  });

  io.on('connection', socket => {
    const auth = socket.auth!;
    console.log(`Socket connected: ${auth.type} ${auth.id} (${auth.name})`);

    if (auth.type === 'admin') {
      socket.join('admin');
    } else {
      socket.join(`employee:${auth.id}`);
    }

    socket.on('send_message', async (data: { content: string; employeeId?: string; guardId?: string }) => {
      try {
        const targetEmployeeId = data.employeeId || data.guardId;

        if (auth.type === 'employee') {
          // Employee sending to admins
          const message = await saveMessage({
            employeeId: auth.id,
            sender: 'employee',
            content: data.content,
          });

          io.to('admin').emit('new_message', message);
          // Also send back to employee room (for multi-device sync)
          io.to(`employee:${auth.id}`).emit('new_message', message);
        } else if (auth.type === 'admin' && targetEmployeeId) {
          // Check for conversation lock
          const lockKey = `chat_lock:${targetEmployeeId}`;
          const lockedBy = await redis.get(lockKey);

          if (lockedBy && lockedBy !== auth.id) {
            socket.emit('error', { message: 'This conversation is currently locked by another admin.' });
            return;
          }

          // Lock the conversation for 2 minutes
          const LOCK_DURATION = 120;
          await redis.set(lockKey, auth.id, 'EX', LOCK_DURATION);

          // Broadcast lock status to all admins
          io.to('admin').emit('conversation_locked', {
            employeeId: targetEmployeeId,
            lockedBy: auth.id,
            expiresAt: Date.now() + LOCK_DURATION * 1000,
          });

          // Admin sending to a specific employee
          const message = await saveMessage({
            employeeId: targetEmployeeId,
            adminId: auth.id,
            sender: 'admin',
            content: data.content,
          });

          io.to(`employee:${targetEmployeeId}`).emit('new_message', message);
          io.to('admin').emit('new_message', message);
        }
      } catch (error) {
        console.error('Error handling send_message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('mark_read', async (data: { employeeId?: string; guardId?: string; messageIds: string[] }) => {
      try {
        const targetEmployeeId = auth.type === 'admin' ? (data.employeeId || data.guardId) : auth.id;

        if (!targetEmployeeId) {
          console.error('mark_read: Missing employeeId');
          return;
        }

        await markAsRead(data.messageIds);

        if (auth.type === 'admin') {
          // Notify the employee that admin read their messages
          io.to(`employee:${targetEmployeeId}`).emit('messages_read', {
            messageIds: data.messageIds,
            readBy: auth.id,
          });
          // Also notify admins (to update unread counts in UI)
          io.to('admin').emit('messages_read', {
            employeeId: targetEmployeeId,
            messageIds: data.messageIds,
          });
        } else {
          // Notify admins that employee read their messages
          io.to('admin').emit('messages_read', {
            employeeId: targetEmployeeId,
            messageIds: data.messageIds,
          });
          // Also notify the employee themselves (for other sessions/hooks)
          io.to(`employee:${targetEmployeeId}`).emit('messages_read', {
            messageIds: data.messageIds,
          });
        }
      } catch (error) {
        console.error('Error handling mark_read:', error);
      }
    });

    socket.on('typing', (data: { employeeId?: string; guardId?: string; isTyping: boolean }) => {
      const targetEmployeeId = data.employeeId || data.guardId;
      if (auth.type === 'employee') {
        io.to('admin').emit('typing', { employeeId: auth.id, isTyping: data.isTyping });
      } else if (auth.type === 'admin' && targetEmployeeId) {
        io.to(`employee:${targetEmployeeId}`).emit('typing', { isTyping: data.isTyping });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${auth.type} ${auth.id}`);
    });
  });

  return io;
}