import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Attendance, Guard, Prisma, Shift, Site } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const guardId = searchParams.get('guardId');

  const where: Prisma.AttendanceWhereInput = {};

  if (guardId) {
    where.shift = {
      guardId: guardId,
    };
  }

  if (startDateStr || endDateStr) {
    where.recordedAt = {};
    if (startDateStr) {
      where.recordedAt.gte = startOfDay(new Date(startDateStr));
    }
    if (endDateStr) {
      where.recordedAt.lte = endOfDay(new Date(endDateStr));
    }
  }

  const BATCH_SIZE = 1000;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Write Header
      const headers = ['Guard', 'Site', 'Shift Date', 'Record Date', 'Record Time', 'Status', 'Latitude', 'Longitude'];
      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let cursor: string | undefined = undefined;

      try {
        while (true) {
          const queryOptions = {
            take: BATCH_SIZE,
            where,
            orderBy: { id: 'asc' as const },
            include: {
              shift: {
                include: {
                  guard: true,
                  site: true,
                },
              },
            },
            ...(cursor && { skip: 1, cursor: { id: cursor } }),
          };

          const batch: Array<
            Attendance & {
              shift: Shift & {
                guard: Guard | null;
                site: Site;
              };
            }
          > = await prisma.attendance.findMany(queryOptions);

          if (batch.length === 0) {
            break;
          }

          let chunk = '';
          for (const att of batch) {
            const metadata = att.metadata as { lat?: number; lng?: number } | null;
            const lat = metadata?.lat?.toFixed(6) || '';
            const lng = metadata?.lng?.toFixed(6) || '';
            const guardName = att.shift.guard?.name || 'Unknown';
            const siteName = att.shift.site.name;
            const shiftDate = new Date(att.shift.date).toLocaleDateString();
            const recordDate = new Date(att.recordedAt).toLocaleDateString();
            const recordTime = new Date(att.recordedAt).toLocaleTimeString();

            // Escape quotes in CSV fields: " -> ""
            const escape = (str: string) => `"${str.replace(/"/g, '""')}"`;

            chunk +=
              [
                escape(guardName),
                escape(siteName),
                escape(shiftDate),
                escape(recordDate),
                escape(recordTime),
                att.status,
                lat,
                lng,
              ].join(',') + '\n';
          }

          controller.enqueue(encoder.encode(chunk));

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
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="attendance_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
