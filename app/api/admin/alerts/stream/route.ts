import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Redis from 'ioredis';
import { Guard, Site, ShiftType, Attendance } from '@prisma/client';

export const dynamic = 'force-dynamic';

type ShiftWithRelations = {
  id: string;
  guard: Guard;
  shiftType: ShiftType;
  startsAt: Date;
  endsAt: Date;
  status: string;
  missedCount: number;
  attendance: Attendance;
};

export async function GET(req: Request) {
  const requestId = Math.random().toString(36).substring(7);
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('siteId');

  console.log(`[SSE ${requestId}] Connection started. SiteId: ${siteId || 'Global'}`);

  const encoder = new TextEncoder();
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    enableReadyCheck: false,
    enableOfflineQueue: false, // Don't queue messages if redis is down
    connectTimeout: 5000,
  });

  subscriber.on('error', err => {
    console.error(`[SSE ${requestId}] Redis subscription error:`, err);
  });

  let interval: NodeJS.Timeout;

  const stream = new ReadableStream({
    async start(controller) {
      console.log(`[SSE ${requestId}] Stream starting...`);
      // 0. Send Initial Connection Event (to flush proxies)
      controller.enqueue(encoder.encode(': connected\n\n'));

      try {
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
                guard: true,
                shiftType: true,
              },
            },
          },
        });

        console.log(`[SSE ${requestId}] Sending backfill: ${openAlerts.length} alerts`);
        const backfillEvent = `event: backfill\ndata: ${JSON.stringify(openAlerts)}\n\n`;
        controller.enqueue(encoder.encode(backfillEvent));

        // 1b. Send Initial Active Shifts (Global Mode Only)
        if (!siteId) {
          const now = new Date();
          const shifts = await prisma.shift.findMany({
            where: {
              status: { in: ['scheduled', 'in_progress'] },
              startsAt: { lte: now },
              endsAt: { gte: now },
              guardId: { not: null },
            },
            include: { shiftType: true, guard: true, site: true, attendance: true },
          });

          const activeSitesMap = new Map<string, { site: Site; shifts: ShiftWithRelations[] }>();
          for (const shift of shifts) {
            if (!activeSitesMap.has(shift.siteId)) {
              activeSitesMap.set(shift.siteId, { site: shift.site, shifts: [] });
            }
            activeSitesMap.get(shift.siteId)?.shifts.push({
              id: shift.id,
              guard: shift.guard as Guard,
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
          console.log(`[SSE ${requestId}] Sending active shifts: ${activeSitesPayload.length} sites`);
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
              guard: true,
              site: true,
            },
            orderBy: {
              startsAt: 'asc',
            },
            take: 50,
          });

          console.log(`[SSE ${requestId}] Sending upcoming shifts: ${upcomingShifts.length} shifts`);
          const upcomingEvent = `event: upcoming_shifts\ndata: ${JSON.stringify(upcomingShifts)}\n\n`;
          controller.enqueue(encoder.encode(upcomingEvent));
        }

        // 2. Subscribe to Redis
        if (siteId) {
          const channel = `alerts:site:${siteId}`;
          console.log(`[SSE ${requestId}] Subscribing to channel: ${channel}`);
          await subscriber.subscribe(channel);

          subscriber.on('message', (channel, message) => {
            console.log(`[SSE ${requestId}] Message received on ${channel}`);
            const event = `event: alert\ndata: ${message}\n\n`;
            controller.enqueue(encoder.encode(event));
          });
        } else {
          // Global Mode: Listen to ALL site alerts AND dashboard stats
          console.log(`[SSE ${requestId}] Subscribing to global patterns`);
          await subscriber.psubscribe('alerts:site:*');
          await subscriber.subscribe('dashboard:active-shifts');
          await subscriber.subscribe('dashboard:upcoming-shifts');

          subscriber.on('pmessage', (pattern, channel, message) => {
            if (pattern === 'alerts:site:*') {
              console.log(`[SSE ${requestId}] Global alert received on ${channel}`);
              const event = `event: alert\ndata: ${message}\n\n`;
              controller.enqueue(encoder.encode(event));
            }
          });

          subscriber.on('message', (channel, message) => {
            console.log(`[SSE ${requestId}] Global update received on ${channel}`);
            if (channel === 'dashboard:active-shifts') {
              const event = `event: active_shifts\ndata: ${message}\n\n`;
              controller.enqueue(encoder.encode(event));
            } else if (channel === 'dashboard:upcoming-shifts') {
              const event = `event: upcoming_shifts\ndata: ${message}\n\n`;
              controller.enqueue(encoder.encode(event));
            }
          });
        }

        console.log(`[SSE ${requestId}] Setup complete. Entering keepalive loop.`);
      } catch (err) {
        console.error(`[SSE ${requestId}] Error during start:`, err);
        controller.error(err);
      }

      // 3. Keepalive (every 30s)
      interval = setInterval(() => {
        try {
          console.log(`[SSE ${requestId}] Sending ping`);
          const ping = `: ping\n\n`;
          controller.enqueue(encoder.encode(ping));
        } catch (err) {
          console.error(`[SSE ${requestId}] Ping failed, clearing interval:`, err);
          clearInterval(interval);
        }
      }, 30000);
    },
    async cancel() {
      console.log(`[SSE ${requestId}] Connection closing/cancelled`);
      if (interval) clearInterval(interval);
      try {
        await subscriber.quit();
        console.log(`[SSE ${requestId}] Redis subscriber quit successfully`);
      } catch (err) {
        console.error(`[SSE ${requestId}] Error during Redis quit:`, err);
      }
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
