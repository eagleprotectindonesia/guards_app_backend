import { redis } from '@repo/database/redis';
import { finalizeMessageDraft, saveMessage, markAsReadForEmployee, markAsReadForAdmin } from '../data-access/chat';
import { UnifiedServer, UnifiedSocket } from '../socket';
import { ChatMessage } from '@repo/types';
import { sendChatPushNotification } from '../fcm';
import {
  finalizeGroupMessageDraft,
  getActiveGroupParticipant,
  listActiveGroupIdsForParticipant,
  listGroupChatPushTargets,
  markGroupAsRead,
  saveGroupMessage,
} from '../data-access/group-chat';
import { sendGroupChatPushNotification } from '../fcm';

/**
 * Handlers for Chat functionality.
 */
export function registerChatHandlers(io: UnifiedServer, socket: UnifiedSocket) {
  const auth = socket.data.auth!;
  const hasChatView = auth.type === 'employee' || auth.permissions?.includes('chat:view') || false;
  const hasChatCreate = auth.type === 'employee' || auth.permissions?.includes('chat:create') || false;
  const actor = auth.type === 'admin' ? ({ participantType: 'admin', adminId: auth.id } as const) : ({ participantType: 'employee', employeeId: auth.id } as const);

  void (async () => {
    try {
      const groupIds = await listActiveGroupIdsForParticipant({ actor });
      for (const groupId of groupIds) {
        socket.join(`group:${groupId}`);
      }
    } catch (err) {
      console.error('Group room join error:', err);
    }
  })();

  socket.on('send_message', async data => {
    try {
      if (auth.type === 'admin' && !hasChatCreate) {
        return socket.emit('error', { message: 'Forbidden' });
      }
      const targetId = data.employeeId || data.guardId;
      if (data.attachments && data.attachments.length > 4) {
        return socket.emit('error', { message: 'Max 4 attachments' });
      }

      if (auth.type === 'employee') {
        const msg = (data.messageId
          ? await finalizeMessageDraft({
              messageId: data.messageId,
              employeeId: auth.id,
              sender: 'employee',
              content: data.content,
              attachments: data.attachments,
              latitude: data.latitude,
              longitude: data.longitude,
            })
          : await saveMessage({
              employeeId: auth.id,
              sender: 'employee',
              content: data.content,
              attachments: data.attachments,
              latitude: data.latitude,
              longitude: data.longitude,
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

        const msg = (data.messageId
          ? await finalizeMessageDraft({
              messageId: data.messageId,
              employeeId: targetId,
              adminId: auth.id,
              sender: 'admin',
              content: data.content,
              attachments: data.attachments,
              latitude: data.latitude,
              longitude: data.longitude,
            })
          : await saveMessage({
              employeeId: targetId,
              adminId: auth.id,
              sender: 'admin',
              content: data.content,
              attachments: data.attachments,
              latitude: data.latitude,
              longitude: data.longitude,
            })) as unknown as ChatMessage;
        io.to(`employee:${targetId}`).to('admin').emit('new_message', msg);

        const sockets = await io.in(`employee:${targetId}`).fetchSockets();
        if (sockets.length === 0) {
          await sendChatPushNotification({
            employeeId: targetId,
            senderName: msg.admin?.name || 'Admin',
            content: data.content,
            messageId: msg.id,
          });
        }
      }
    } catch (err) {
      console.error('Send Message Error:', err);
      socket.emit('error', { message: 'Failed to send' });
    }
  });

  socket.on('mark_read', async data => {
    try {
      if (auth.type === 'admin' && !hasChatView) {
        return socket.emit('error', { message: 'Forbidden' });
      }
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
      if (auth.type === 'admin' && !hasChatCreate) {
        return socket.emit('error', { message: 'Forbidden' });
      }
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

  socket.on('group_send_message', async data => {
    try {
      if (auth.type === 'admin' && !hasChatCreate) {
        return socket.emit('error', { message: 'Forbidden' });
      }
      if (data.attachments && data.attachments.length > 4) {
        return socket.emit('error', { message: 'Max 4 attachments' });
      }

      const msg = data.messageId
        ? await finalizeGroupMessageDraft({
            groupId: data.groupId,
            messageId: data.messageId,
            actor,
            content: data.content,
            attachments: data.attachments,
            latitude: data.latitude,
            longitude: data.longitude,
          })
        : await saveGroupMessage({
            groupId: data.groupId,
            actor,
            content: data.content,
            attachments: data.attachments,
            latitude: data.latitude,
            longitude: data.longitude,
          });

      io.to(`group:${data.groupId}`).emit('group_new_message', msg as any);

      const pushTargets = await listGroupChatPushTargets({ groupId: data.groupId });
      for (const target of pushTargets) {
        if (!target.employeeId) continue;
        if (target.isMuted) continue;
        if (target.employeeId === auth.id) continue;

        const sockets = await io.in(`employee:${target.employeeId}`).fetchSockets();
        if (sockets.length > 0) continue;

        await sendGroupChatPushNotification({
          employeeId: target.employeeId,
          groupId: data.groupId,
          groupTitle: 'Group chat',
          senderName: (msg as any).senderName ?? (auth.type === 'admin' ? 'Admin' : 'Employee'),
          content: data.content,
          messageId: (msg as any).id,
        });
      }
    } catch (err) {
      console.error('Group Send Message Error:', err);
      socket.emit('error', { message: 'Failed to send' });
    }
  });

  socket.on('group_mark_read', async data => {
    try {
      if (auth.type === 'admin' && !hasChatView) {
        return socket.emit('error', { message: 'Forbidden' });
      }
      const result = await markGroupAsRead({
        groupId: data.groupId,
        actor,
        messageIds: data.messageIds,
      });
      io.to(`group:${data.groupId}`).emit('group_messages_read', {
        groupId: data.groupId,
        participantId: result.participantId,
        messageIds: data.messageIds,
        readAt: result.readAt.toISOString(),
      });
    } catch (err) {
      console.error('Group Mark Read Error:', err);
    }
  });

  socket.on('group_typing', async data => {
    try {
      if (auth.type === 'admin' && !hasChatCreate) {
        return socket.emit('error', { message: 'Forbidden' });
      }
      const participant = await getActiveGroupParticipant({ groupId: data.groupId, actor });
      if (!participant) return;

      socket.to(`group:${data.groupId}`).emit('group_typing', {
        groupId: data.groupId,
        participantId: participant.id,
        participantName: auth.type === 'admin' ? 'Admin' : 'Employee',
        isTyping: data.isTyping,
      });
    } catch (err) {
      console.error('Group Typing Error:', err);
    }
  });
}
