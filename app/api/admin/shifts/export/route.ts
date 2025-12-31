import { NextRequest, NextResponse } from 'next/server';
import { Prisma, Shift, Guard, Site, ShiftType } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';
import { getExportShiftsBatch } from '@/lib/data-access/shifts';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const guardId = searchParams.get('guardId');
  const siteId = searchParams.get('siteId');

  const where: Prisma.ShiftWhereInput = {};

  if (guardId) {
    where.guardId = guardId;
  }

  if (siteId) {
    where.siteId = siteId;
  }

  if (startDateStr || endDateStr) {
    where.startsAt = {};
    if (startDateStr) {
      where.startsAt.gte = startOfDay(new Date(startDateStr));
    }
    if (endDateStr) {
      where.startsAt.lte = endOfDay(new Date(endDateStr));
    }
  }

  const BATCH_SIZE = 1000;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Write Header
      const headers = [
        'Shift ID',
        'Site',
        'Shift Type',
        'Guard',
        'Date',
        'Start Time',
        'End Time',
        'Status',
        'Check-In Status',
        'Grace Minutes',
        'Required Checkin Interval (mins)',
        'Deleted At',
      ];
      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let cursor: string | undefined = undefined;

      try {
        while (true) {
          const batch = await getExportShiftsBatch({
            take: BATCH_SIZE,
            where,
            cursor,
          });

          if (batch.length === 0) {
            break;
          }

          let chunk = '';
          for (const shift of batch) {
            // Casting to include relations to satisfy TS if needed
            const s = shift as Shift & { site: Site; shiftType: ShiftType; guard: Guard | null };

            const siteName = s.site.name;
            const shiftTypeName = s.shiftType.name;
            const guardName = s.guard?.name || 'Unassigned';
            const date = new Date(s.date).toLocaleDateString();
            const startTime = new Date(s.startsAt).toLocaleTimeString();
            const endTime = new Date(s.endsAt).toLocaleTimeString();
            const checkInStatus = s.checkInStatus || '';
            const deletedAt = s.deletedAt ? new Date(s.deletedAt).toLocaleString() : '';

            // Escape quotes in CSV fields: " -> ""
            const escape = (str: string) => `"${String(str).replace(/"/g, '""')}"`;

            chunk +=
              [
                escape(s.id),
                escape(siteName),
                escape(shiftTypeName),
                escape(guardName),
                escape(date),
                escape(startTime),
                escape(endTime),
                s.status,
                checkInStatus,
                s.graceMinutes,
                s.requiredCheckinIntervalMins,
                escape(deletedAt),
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
      'Content-Disposition': `attachment; filename="shifts_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
