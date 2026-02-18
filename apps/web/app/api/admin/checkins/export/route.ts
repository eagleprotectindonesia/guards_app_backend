import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay, format } from 'date-fns';
import { getCheckinExportBatch } from '@/lib/data-access/checkins';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const employeeId = searchParams.get('employeeId');

  const where: Prisma.CheckinWhereInput = {};

  if (employeeId) {
    where.employeeId = employeeId;
  }

  if (startDateStr || endDateStr) {
    where.at = {};
    if (startDateStr) {
      where.at.gte = startOfDay(new Date(startDateStr));
    }
    if (endDateStr) {
      where.at.lte = endOfDay(new Date(endDateStr));
    }
  }

  const BATCH_SIZE = 1000;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Write Header
      const headers = ['Employee', 'Site', 'Shift Date', 'Check-in Time', 'Check-in Date', 'Status', 'Latitude', 'Longitude'];
      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let cursor: string | undefined = undefined;

      try {
        while (true) {
          const batch = await getCheckinExportBatch({
            take: BATCH_SIZE,
            where,
            cursor,
          });

          if (batch.length === 0) {
            break;
          }

          let chunk = '';
          for (const item of batch) {
            const metadata = item.metadata as { lat?: number; lng?: number } | null;
            const lat = metadata?.lat?.toFixed(6) || '';
            const lng = metadata?.lng?.toFixed(6) || '';
            const employeeName = item.employee.fullName;
            const siteName = item.shift.site.name;
            const shiftDate = format(new Date(item.shift.date), 'yyyy/MM/dd');
            const checkinDate = format(new Date(item.at), 'yyyy/MM/dd');
            const checkinTime = format(new Date(item.at), 'HH:mm');

            // Escape quotes in CSV fields: " -> ""
            const escape = (str: string) => `"${str.replace(/"/g, '""')}"`;

            chunk += 
              [
                escape(employeeName),
                escape(siteName),
                escape(shiftDate),
                escape(checkinTime),
                escape(checkinDate),
                item.status,
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
      'Content-Disposition': `attachment; filename="checkins_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
