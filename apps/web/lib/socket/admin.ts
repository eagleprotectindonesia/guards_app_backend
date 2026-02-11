import { prisma } from '../prisma';
import { redis } from '../redis';
import { Shift, Site } from '@repo/types';
import { UnifiedServer, UnifiedSocket } from '../socket';

/**
 * Handlers for Administrative users.
 */
export function registerAdminHandlers(io: UnifiedServer, socket: UnifiedSocket) {
  socket.join('admin');

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
      const alerts = await prisma.alert.findMany({
        where: { resolvedAt: null, ...(siteId ? { siteId } : {}) },
        orderBy: { createdAt: 'desc' },
        include: { site: true, shift: { include: { employee: true, shiftType: true } } },
      });

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
        const activeShifts = await prisma.shift.findMany({
          where: {
            status: { in: ['scheduled', 'in_progress'] },
            startsAt: { lte: now },
            endsAt: { gte: now },
            employeeId: { not: null },
          },
          include: { shiftType: true, employee: true, site: true, attendance: true },
        });

        // Group by site to match SSE format
        const activeSitesMap = new Map<string, { site: Site; shifts: Shift[] }>();
        for (const shift of activeShifts) {
          if (!activeSitesMap.has(shift.siteId)) {
            activeSitesMap.set(shift.siteId, { site: shift.site, shifts: [] });
          }
          activeSitesMap.get(shift.siteId)?.shifts.push(shift);
        }

        const upcoming = await prisma.shift.findMany({
          where: { status: 'scheduled', startsAt: { gt: now, lte: new Date(now.getTime() + 24 * 3600000) } },
          include: { shiftType: true, employee: true, site: true },
          orderBy: { startsAt: 'asc' },
          take: 50,
        });
        socket.emit('active_shifts', Array.from(activeSitesMap.values()));
        socket.emit('upcoming_shifts', upcoming);
      }
    } catch (err) {
      console.error('Backfill Error:', err);
    }
  });
}
