import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Redis from 'ioredis';
import { Site, ShiftType, Attendance } from '@prisma/client';
import { ExtendedEmployee } from '@repo/database';

export const dynamic = 'force-dynamic';

type ShiftWithRelations = {
  id: string;
  employee: ExtendedEmployee;
  shiftType: ShiftType;
  startsAt: Date;
  endsAt: Date;
  status: string;
  missedCount: number;
  attendance: Attendance;
};

export async function GET(req: Request) {
  // Note: Auth check (Admin only) is handled by proxy.ts
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('siteId');

  const encoder = new TextEncoder();
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    enableReadyCheck: false,
    enableOfflineQueue: false, // Don't queue messages if redis is down
    connectTimeout: 5000,
  });

  subscriber.on('error', err => {
    console.error('Redis subscription error:', err);
  });

  let interval: NodeJS.Timeout;

  const stream = new ReadableStream({
    async start(controller) {
      // 0. Send Initial Connection Event (to flush proxies)
      controller.enqueue(encoder.encode(': connected\n\n'));

      // 1. Send Backfill (Open Alerts)
      const whereCondition = {
        resolvedAt: null,
        ...(siteId ? { siteId } : {}),
      };

      const openAlerts = await prisma.alert.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        include: {
          site: true,
          shift: {
            include: {
              employee: true,
              shiftType: true,
            },
          },
        },
      });

      // 1a. Send Backfill (Warning Alerts from Redis)
      const warningPattern = siteId ? `alert:warning:${siteId}:*` : `alert:warning:*`;
      const warningKeys = await subscriber.keys(warningPattern);
      const warningAlerts = (
        warningKeys.length > 0
          ? (await subscriber.mget(...warningKeys)).filter((v): v is string => v !== null).map(v => JSON.parse(v))
          : []
      ) as { createdAt: string | Date }[];

      // Merge and sort
      const allAlerts = [...openAlerts, ...warningAlerts].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const backfillEvent = `event: backfill\ndata: ${JSON.stringify(allAlerts)}\n\n`;
      controller.enqueue(encoder.encode(backfillEvent));

      // 1b. Send Initial Active Shifts (Global Mode Only)
      if (!siteId) {
        const now = new Date();
        const shifts = await prisma.shift.findMany({
          where: {
            status: { in: ['scheduled', 'in_progress'] },
            startsAt: { lte: now },
            endsAt: { gte: now },
            employeeId: { not: null },
          },
          include: { shiftType: true, employee: true, site: true, attendance: true },
        });

        const activeSitesMap = new Map<string, { site: Site; shifts: ShiftWithRelations[] }>();
        for (const shift of shifts) {
          if (!activeSitesMap.has(shift.siteId)) {
            activeSitesMap.set(shift.siteId, { site: shift.site, shifts: [] });
          }
          activeSitesMap.get(shift.siteId)?.shifts.push({
            id: shift.id,
            employee: shift.employee as ExtendedEmployee,
            shiftType: shift.shiftType,
            startsAt: shift.startsAt,
            endsAt: shift.endsAt,
            status: shift.status,
            // checkInCount: shift.checkInCount,
            missedCount: shift.missedCount,
            attendance: shift.attendance as Attendance,
          });
        }
        const activeSitesPayload = Array.from(activeSitesMap.values());
        const activeEvent = `event: active_shifts\ndata: ${JSON.stringify(activeSitesPayload)}\n\n`;
        controller.enqueue(encoder.encode(activeEvent));
      }

      // 1c. Send Upcoming Shifts (Global Mode Only)
      if (!siteId) {
        const now = new Date();
        const upcomingEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

        const upcomingShifts = await prisma.shift.findMany({
          where: {
            status: 'scheduled',
            startsAt: {
              gt: now,
              lte: upcomingEnd,
            },
          },
          include: {
            shiftType: true,
            employee: true,
            site: true,
          },
          orderBy: {
            startsAt: 'asc',
          },
          take: 50,
        });

        const upcomingEvent = `event: upcoming_shifts\ndata: ${JSON.stringify(upcomingShifts)}\n\n`;
        controller.enqueue(encoder.encode(upcomingEvent));
      }

      // 2. Subscribe to Redis
      if (siteId) {
        const channel = `alerts:site:${siteId}`;
        await subscriber.subscribe(channel);

        subscriber.on('message', (channel, message) => {
          const event = `event: alert\ndata: ${message}\n\n`;
          controller.enqueue(encoder.encode(event));
        });
      } else {
        // Global Mode: Listen to ALL site alerts AND dashboard stats
        await subscriber.psubscribe('alerts:site:*');
        await subscriber.subscribe('dashboard:active-shifts');
        await subscriber.subscribe('dashboard:upcoming-shifts');

        subscriber.on('pmessage', (pattern, channel, message) => {
          if (pattern === 'alerts:site:*') {
            const event = `event: alert\ndata: ${message}\n\n`;
            controller.enqueue(encoder.encode(event));
          }
        });

        subscriber.on('message', (channel, message) => {
          if (channel === 'dashboard:active-shifts') {
            const event = `event: active_shifts\ndata: ${message}\n\n`;
            controller.enqueue(encoder.encode(event));
          } else if (channel === 'dashboard:upcoming-shifts') {
            const event = `event: upcoming_shifts\ndata: ${message}\n\n`;
            controller.enqueue(encoder.encode(event));
          }
        });
      }

      // 3. Keepalive (every 30s)
      interval = setInterval(() => {
        try {
          const ping = `: ping\n\n`;
          controller.enqueue(encoder.encode(ping));
        } catch {
          clearInterval(interval);
        }
      }, 30000);
    },
    async cancel() {
      if (interval) clearInterval(interval);
      await subscriber.quit();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
