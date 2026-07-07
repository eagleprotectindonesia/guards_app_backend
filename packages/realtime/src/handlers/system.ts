import { redis } from '@repo/database/redis';
import { countUnreadAdminNotifications } from '@repo/database';
import { UnifiedServer } from '../socket';

/**
 * Listens to Redis channels and broadcasts to Socket.io rooms.
 */
export function registerSystemHandlers(io: UnifiedServer) {
  const sub = redis.duplicate({ enableOfflineQueue: true });

  sub.on('error', err => {
    console.error('[Socket Redis Sub] Error:', err);
  });

  const handleRedisMessage = async (channel: string, message: string) => {
    try {
      const payload = JSON.parse(message);

      if (channel.startsWith('alerts:site:')) {
        const siteId = channel.split(':').pop();
        // Broadcast to global admin room
        io.to('admin').emit('alert', payload);
        // Broadcast to site-specific admin room
        if (siteId) {
          io.to(`admin:site:${siteId}`).emit('alert', payload);
        }
      } else if (channel === 'dashboard:active-shifts') {
        io.to('admin').emit('active_shifts', payload);
      } else if (channel === 'dashboard:upcoming-shifts') {
        io.to('admin').emit('upcoming_shifts', payload);
      } else if (channel === 'dashboard:live-activity') {
        io.to('admin').emit('new_dashboard:live_activity_event', payload);
      } else if (channel.startsWith('admin-notifications:admin:')) {
        const adminId = channel.split(':').pop();
        if (!adminId) {
          return;
        }

        const unreadCount = await countUnreadAdminNotifications(adminId);
        const notification = payload.notification;

        io.to(`admin:${adminId}`).emit('admin_notification_created', {
          notification: {
            ...notification,
            readAt: notification?.readAt ? new Date(notification.readAt).toISOString() : null,
            createdAt: notification?.createdAt
              ? new Date(notification.createdAt).toISOString()
              : new Date().toISOString(),
          },
          unreadCount,
        });
      } else if (channel === 'events:tickets') {
        const { type, data } = payload;
        if (type === 'ticket:created') {
          io.to('admin').emit('ticket_created', data);
        } else if (type === 'ticket:status_updated') {
          io.to('admin').to(`ticket:${data.ticketId}`).emit('ticket_status_updated', data);
        } else if (type === 'ticket:message_created') {
          io.to('admin').to(`ticket:${data.ticketId}`).emit('ticket_message_added', data);
        }
      } else if (channel === 'events:hr-activities') {
        io.to('admin').emit('hr_live_activity', payload);
      } else if (channel === 'webhooks:panic') {
        io.to('admin').emit('new_dashboard:panic_alerts', payload);
      } else if (channel === 'events:calendar') {
        const { type, data } = payload;
        if (type === 'calendar:event_created') {
          if (data.employeeId) {
            io.to(`employee:${data.employeeId}`).emit('calendar_event_created', {
              eventId: data.eventId,
              kind: data.kind,
            });
          }
          if (data.adminId) {
            io.to(`admin:${data.adminId}`).emit('calendar_event_created', { eventId: data.eventId, kind: data.kind });
          }
          io.to('admin').emit('calendar_changed', { type: 'created', eventId: data.eventId });
        } else if (type === 'calendar:event_updated') {
          if (data.employeeId) {
            io.to(`employee:${data.employeeId}`).emit('calendar_event_updated', { eventId: data.eventId });
          }
          if (data.adminId) {
            io.to(`admin:${data.adminId}`).emit('calendar_event_updated', { eventId: data.eventId });
          }
          io.to('admin').emit('calendar_changed', { type: 'updated', eventId: data.eventId });
        } else if (type === 'calendar:event_deleted') {
          if (data.employeeId) {
            io.to(`employee:${data.employeeId}`).emit('calendar_event_deleted', { eventId: data.eventId });
          }
          if (data.adminId) {
            io.to(`admin:${data.adminId}`).emit('calendar_event_deleted', { eventId: data.eventId });
          }
          io.to('admin').emit('calendar_changed', { type: 'deleted', eventId: data.eventId });
        } else if (type === 'calendar:event_tagged') {
          if (data.adminId) {
            io.to(`admin:${data.adminId}`).emit('calendar_event_tagged', {
              eventId: data.eventId,
              eventTitle: data.eventTitle,
              taggedByName: data.taggedByName,
            });
          }
          if (data.employeeId) {
            io.to(`employee:${data.employeeId}`).emit('calendar_event_tagged', {
              eventId: data.eventId,
              eventTitle: data.eventTitle,
              taggedByName: data.taggedByName,
            });
          }
        }
      }
    } catch (err) {
      console.error('[Socket Redis Sub] Parse Error:', err, 'Message:', message);
    }
  };

  sub.on('message', (channel, message) => {
    void handleRedisMessage(channel, message);
  });

  sub.on('pmessage', (_pattern, channel, message) => {
    void handleRedisMessage(channel, message);
  });

  void (async () => {
    try {
      await sub.psubscribe('alerts:site:*');
      await sub.psubscribe('admin-notifications:admin:*');
      await sub.subscribe(
        'dashboard:active-shifts',
        'dashboard:upcoming-shifts',
        'dashboard:live-activity',
        'events:tickets',
        'events:hr-activities',
        'webhooks:panic',
        'events:calendar'
      );
      console.log(
        '[Socket Redis Sub] Subscribed to alerts, dashboard, ticket, HR activity, panic, and calendar channels'
      );
    } catch (err) {
      console.error('[Socket Redis Sub] Subscription Failed:', err);
    }
  })();

  return async () => {
    await sub.quit();
  };
}
