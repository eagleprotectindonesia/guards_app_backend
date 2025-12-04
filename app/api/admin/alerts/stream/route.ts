import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Redis from 'ioredis';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('siteId');

  // If siteId is missing, we assume "Global Dashboard" mode (all sites).

  // TODO: Auth check (Admin access)

  const encoder = new TextEncoder();
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Send Backfill (Open Alerts)
      const whereCondition: any = {
        resolvedAt: null,
      };
      if (siteId) {
        whereCondition.siteId = siteId;
      }

      const openAlerts = await prisma.alert.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        include: { 
            site: true,
            shift: { 
                include: { 
                    guard: true,
                    shiftType: true,
                } 
            } 
        },
      });

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
            include: { shiftType: true, guard: true, site: true },
          });

          const activeSitesMap = new Map<string, { site: any; shifts: any[] }>();
          for (const shift of shifts) {
            if (!activeSitesMap.has(shift.siteId)) {
                activeSitesMap.set(shift.siteId, { site: shift.site, shifts: [] });
            }
            activeSitesMap.get(shift.siteId)?.shifts.push({
                id: shift.id,
                guard: shift.guard,
                shiftType: shift.shiftType,
                startsAt: shift.startsAt,
                endsAt: shift.endsAt,
                status: shift.status,
                checkInCount: shift.checkInCount,
                missedCount: shift.missedCount,
            });
          }
          const activeSitesPayload = Array.from(activeSitesMap.values());
          const activeEvent = `event: active_shifts\ndata: ${JSON.stringify(activeSitesPayload)}\n\n`;
          controller.enqueue(encoder.encode(activeEvent));
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
            }
        });
      }

      // 3. Keepalive (every 30s)
      const interval = setInterval(() => {
        const ping = `: ping\n\n`;
        controller.enqueue(encoder.encode(ping));
      }, 30000);

      // Handle cleanup
      (controller as any)._interval = interval;
    },
    async cancel(controller) {
      if ((controller as any)._interval) clearInterval((controller as any)._interval);
      await subscriber.quit();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
