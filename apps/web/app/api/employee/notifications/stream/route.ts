import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import Redis from 'ioredis';

export async function GET(req: NextRequest) {
  const employee = await getAuthenticatedEmployee();

  if (!employee) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  // Create a new Redis instance for blocking read
  const reader = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    enableReadyCheck: false,
  });

  reader.on('error', err => {
    console.error('Redis reader error (Employee SSE):', err);
  });

  // Support reconnection by reading the Last-Event-ID header
  const lastEventId = req.headers.get('last-event-id') || req.nextUrl.searchParams.get('lastId') || '$';

  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const channel = `employee:stream:${employee.id}`;
      let currentLastId = lastEventId;

      // Inner loop for continuous reading
      const readLoop = async () => {
        try {
          while (!isClosed) {
            // Block for 20 seconds waiting for new messages
            const results = await reader.xread('BLOCK', 20000, 'STREAMS', channel, currentLastId);

            if (results && results.length > 0) {
              const messages = results[0][1];
              for (const [id, fields] of messages) {
                currentLastId = id;
                
                // Convert Redis array [key, val, key, val] to object
                const data: Record<string, string> = {};
                for (let i = 0; i < fields.length; i += 2) {
                  data[fields[i]] = fields[i + 1];
                }

                if (data.type === 'session_revoked') {
                  const newTokenVersion = parseInt(data.newTokenVersion, 10);
                  if (newTokenVersion > employee.tokenVersion) {
                    const event = `id: ${id}\nevent: force_logout\ndata: ${JSON.stringify({ reason: 'logged_in_elsewhere' })}\n\n`;
                    controller.enqueue(encoder.encode(event));
                  }
                } else if (data.type === 'shift_updated') {
                  const event = `id: ${id}\nevent: shift_updated\ndata: ${JSON.stringify({ shiftId: data.shiftId })}\n\n`;
                  controller.enqueue(encoder.encode(event));
                }
              }
            } else {
              // Send keepalive ping if no messages received within BLOCK period
              const ping = `: ping\n\n`;
              controller.enqueue(encoder.encode(ping));
            }
          }
        } catch (err) {
          if (!isClosed) {
            console.error('SSE Stream error:', err);
            controller.error(err);
          }
        }
      };

      readLoop();
    },
    cancel() {
      isClosed = true;
      reader.quit();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}