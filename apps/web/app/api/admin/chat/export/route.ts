import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';
import { getChatExportBatch, enrichMessageWithUrls } from '@/lib/data-access/chat';
import { getCurrentAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const employeeId = searchParams.get('employeeId');

  if (!employeeId) {
    return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
  }

  const where: Prisma.ChatMessageWhereInput = {
    employeeId,
  };

  if (startDateStr || endDateStr) {
    where.createdAt = {};
    if (startDateStr) {
      where.createdAt.gte = startOfDay(new Date(startDateStr));
    }
    if (endDateStr) {
      where.createdAt.lte = endOfDay(new Date(endDateStr));
    }
  }

  const BATCH_SIZE = 1000;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      let cursor: string | undefined = undefined;

      try {
        while (true) {
          const rawBatch = await getChatExportBatch({
            take: BATCH_SIZE,
            where,
            cursor,
          });

          if (rawBatch.length === 0) {
            break;
          }

          const batch = await Promise.all(rawBatch.map(enrichMessageWithUrls));

          for (const msg of batch) {
            // Send each message as a JSON line (NDJSON)
            controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n'));
          }

          if (batch.length < BATCH_SIZE) {
            break;
          }

          cursor = batch[batch.length - 1].id;
        }
      } catch (error) {
        console.error('Export stream error:', error);
        controller.error(error);
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
  });
}
