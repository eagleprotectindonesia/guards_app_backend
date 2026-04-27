import {
  countUnreadAdminNotifications,
  getActiveShiftsForDashboard,
  getOpenAlertsForDashboard,
  getUpcomingShiftsForDashboard,
  listRecentAdminNotifications,
  markAdminNotificationsAsRead,
} from '@repo/database';
import { redis } from '@repo/database/redis';
import { Shift, Site } from '@repo/types';
import { UnifiedServer, UnifiedSocket } from '../socket';

/**
 * Handlers for Administrative users.
 */
export function registerAdminHandlers(io: UnifiedServer, socket: UnifiedSocket) {
  const auth = socket.data.auth!;
  socket.join('admin');
  socket.join(`admin:${auth.id}`);

  socket.on('subscribe_site', (siteId: string) => {
    socket.rooms.forEach(r => {
      if (r.startsWith('admin:site:')) socket.leave(r);
    });
    socket.join(`admin:site:${siteId}`);
  });

  socket.on('request_dashboard_backfill', async (data) => {
    try {
      const { siteId } = data;

      // Fetch Alerts
      const alerts = await getOpenAlertsForDashboard(siteId);

      // Fetch Warnings from Redis
      const warningPattern = siteId ? `alert:warning:${siteId}:*` : `alert:warning:*`;
      const warningKeys = await redis.keys(warningPattern);
      const warnings =
        warningKeys.length > 0
          ? (await redis.mget(...warningKeys)).filter((v): v is string => v !== null).map(v => JSON.parse(v))
          : [];

      socket.emit('dashboard:backfill', {
        alerts: [...alerts, ...warnings].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      });

      // Global Stats
      if (!siteId) {
        const now = new Date();
        const activeShifts = await getActiveShiftsForDashboard(now);

        // Group by site to match SSE format
        const activeSitesMap = new Map<string, { site: Site; shifts: Shift[] }>();
        for (const shift of activeShifts) {
          if (!activeSitesMap.has(shift.siteId)) {
            activeSitesMap.set(shift.siteId, { site: shift.site, shifts: [] });
          }
          activeSitesMap.get(shift.siteId)?.shifts.push(shift);
        }

        const upcoming = await getUpcomingShiftsForDashboard(now, 50);
        socket.emit('active_shifts', Array.from(activeSitesMap.values()));
        socket.emit('upcoming_shifts', upcoming);
      }
    } catch (err) {
      console.error('Backfill Error:', err);
    }
  });

  socket.on('request_admin_notifications_backfill', async data => {
    try {
      const limit = data?.limit ?? 20;
      const [notifications, unreadCount] = await Promise.all([
        listRecentAdminNotifications(auth.id, limit),
        countUnreadAdminNotifications(auth.id),
      ]);

      socket.emit('admin_notifications_backfill', {
        notifications: notifications.map(notification => ({
          ...notification,
          readAt: notification.readAt ? notification.readAt.toISOString() : null,
          createdAt: notification.createdAt.toISOString(),
        })),
        unreadCount,
      });
    } catch (err) {
      console.error('Admin notification backfill error:', err);
    }
  });

  socket.on('mark_admin_notifications_read', async data => {
    try {
      const ids = Array.isArray(data?.notificationIds) ? data.notificationIds.filter(Boolean) : [];
      if (ids.length === 0) {
        return;
      }

      await markAdminNotificationsAsRead(auth.id, ids);
      const unreadCount = await countUnreadAdminNotifications(auth.id);

      socket.emit('admin_notifications_read', {
        readIds: ids,
        unreadCount,
      });
    } catch (err) {
      console.error('Mark admin notifications read error:', err);
    }
  });
}
