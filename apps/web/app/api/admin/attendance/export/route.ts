import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay, format } from 'date-fns';
import { getAttendanceExportBatch } from '@/lib/data-access/attendance';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const employeeId = searchParams.get('employeeId');

  const where: Prisma.AttendanceWhereInput = {};

  if (employeeId) {
    where.employeeId = employeeId;
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
      const headers = ['Employee', 'Employee ID', 'Site', 'Shift Date', 'Record Date', 'Record Time', 'Status', 'Latitude', 'Longitude'];
      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let cursor: string | undefined = undefined;

      try {
        while (true) {
          const batch = await getAttendanceExportBatch({
            take: BATCH_SIZE,
            where,
            cursor,
          });

          if (batch.length === 0) {
            break;
          }

          let chunk = '';
          for (const att of batch) {
            const metadata = (att.metadata as { location: { lat?: number; lng?: number } })?.location;
            const lat = metadata?.lat?.toFixed(6) || '';
            const lng = metadata?.lng?.toFixed(6) || '';
            const employeeName = att.employee?.fullName || 'Unknown';
            const employeeId = att.employee?.id || 'N/A';
            const siteName = att.shift.site.name;
            const shiftDate = format(new Date(att.shift.date), 'yyyy/MM/dd');
            const recordDate = format(new Date(att.recordedAt), 'yyyy/MM/dd');
            const recordTime = format(new Date(att.recordedAt), 'HH:mm');

            // Escape quotes in CSV fields: " -> ""
            const escape = (str: string) => `"${str.replace(/"/g, '""')}"`;

            chunk +=
              [
                escape(employeeName),
                escape(employeeId),
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
