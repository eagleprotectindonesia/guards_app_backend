import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Redis from 'ioredis';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('siteId');

  if (!siteId) {
    return NextResponse.json({ error: 'Missing siteId' }, { status: 400 });
  }

  // TODO: Auth check (Admin access to siteId)

  const encoder = new TextEncoder();
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Send Backfill (Open Alerts)
      const openAlerts = await prisma.alert.findMany({
        where: {
          siteId,
          resolvedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        include: { shift: { include: {  site: true } } },
      });

      const backfillEvent = `event: backfill\ndata: ${JSON.stringify(openAlerts)}\n\n`;
      controller.enqueue(encoder.encode(backfillEvent));

      // 2. Subscribe to Redis
      const channel = `alerts:site:${siteId}`;
      await subscriber.subscribe(channel);

      subscriber.on('message', (channel, message) => {
        const event = `event: alert\ndata: ${message}\n\n`;
        controller.enqueue(encoder.encode(event));
      });

      // 3. Keepalive (every 30s)
      const interval = setInterval(() => {
        const ping = `: ping\n\n`;
        controller.enqueue(encoder.encode(ping));
      }, 30000);

      // Handle close (though ReadableStream cancel method should handle it too)
      // We bind the cleanup to the cancel method below.
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
