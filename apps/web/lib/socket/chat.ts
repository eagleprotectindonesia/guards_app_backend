import { redis } from '../redis';
import { saveMessage, markAsReadForEmployee, markAsReadForAdmin } from '../data-access/chat';
import { UnifiedServer, UnifiedSocket } from '../socket';
import { ChatMessage } from '@repo/types';

/**
 * Handlers for Chat functionality.
 */
export function registerChatHandlers(io: UnifiedServer, socket: UnifiedSocket) {
  const auth = socket.data.auth!;

  socket.on('send_message', async data => {
    try {
      const targetId = data.employeeId || data.guardId;
      if (data.attachments && data.attachments.length > 4) {
        return socket.emit('error', { message: 'Max 4 attachments' });
      }

      if (auth.type === 'employee') {
        const msg = (await saveMessage({
          employeeId: auth.id,
          sender: 'employee',
          content: data.content,
          attachments: data.attachments,
        })) as unknown as ChatMessage;
        io.to('admin').to(`employee:${auth.id}`).emit('new_message', msg);
      } else if (auth.type === 'admin' && targetId) {
        const lockKey = `chat_lock:${targetId}`;
        const lockedBy = await redis.get(lockKey);
        if (lockedBy && lockedBy !== auth.id) return socket.emit('error', { message: 'Locked by another admin' });

        await redis.set(lockKey, auth.id, 'EX', 120);
        io.to('admin').emit('conversation_locked', {
          employeeId: targetId,
          lockedBy: auth.id,
          expiresAt: Date.now() + 120000,
        });

        const msg = (await saveMessage({
          employeeId: targetId,
          adminId: auth.id,
          sender: 'admin',
          content: data.content,
          attachments: data.attachments,
        })) as unknown as ChatMessage;
        io.to(`employee:${targetId}`).to('admin').emit('new_message', msg);
      }
    } catch (err) {
      console.error('Send Message Error:', err);
      socket.emit('error', { message: 'Failed to send' });
    }
  });

  socket.on('mark_read', async data => {
    try {
      const targetId = auth.type === 'admin' ? data.employeeId || data.guardId : auth.id;
      if (!targetId) return;

      if (auth.type === 'admin') {
        await markAsReadForAdmin(targetId, data.messageIds);
      } else {
        await markAsReadForEmployee(auth.id, data.messageIds);
      }

      const payload = {
        messageIds: data.messageIds,
        employeeId: targetId,
        readBy: auth.type === 'admin' ? auth.id : undefined,
      };
      io.to('admin').to(`employee:${targetId}`).emit('messages_read', payload);
    } catch (err) {
      console.error('Mark Read Error:', err);
    }
  });

  socket.on('typing', async data => {
    try {
      const targetId = data.employeeId || data.guardId;
      const payload = {
        employeeId: auth.type === 'employee' ? auth.id : targetId!,
        isTyping: data.isTyping,
      };

      if (auth.type === 'employee') {
        io.to('admin').emit('typing', payload);
      } else if (targetId) {
        // Admin typing: Lock the conversation
        if (data.isTyping) {
          const lockKey = `chat_lock:${targetId}`;
          const lockedBy = await redis.get(lockKey);

          // Refresh or acquire lock if not held by another admin
          if (!lockedBy || lockedBy === auth.id) {
            await redis.set(lockKey, auth.id, 'EX', 120);
            io.to('admin').emit('conversation_locked', {
              employeeId: targetId,
              lockedBy: auth.id,
              expiresAt: Date.now() + 120000,
            });
          }
        }
        io.to(`employee:${targetId}`).emit('typing', payload);
      }
    } catch (err) {
      console.error('Typing Event Error:', err);
    }
  });
}
