import { NextRequest, NextResponse } from 'next/server';
import { Prisma, Shift, Site, ShiftType } from '@prisma/client';
import { EmployeeWithRelations } from '@repo/database';
import { startOfDay, endOfDay, format } from 'date-fns';
import { getExportShiftsBatch } from '@/lib/data-access/shifts';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const employeeId = searchParams.get('employeeId');
  const siteId = searchParams.get('siteId');

  const where: Prisma.ShiftWhereInput = {};

  if (employeeId) {
    where.employeeId = employeeId;
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
        'Employee',
        'Date',
        'Start Time',
        'End Time',
        'Status',
        'Check-In Status',
        'Grace Minutes',
        'Required Checkin Interval (mins)',
        'Created By',
        'Created At',
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
            const s = shift as Shift & {
              site: Site;
              shiftType: ShiftType;
              employee: EmployeeWithRelations | null;
              createdBy: { name: string } | null;
            };

            const siteName = s.site.name;
            const shiftTypeName = s.shiftType.name;
            const employeeName = s.employee?.fullName || 'Unassigned';
            const date = format(new Date(s.date), 'yyyy/MM/dd');
            const startTime = format(new Date(s.startsAt), 'HH:mm');
            const endTime = format(new Date(s.endsAt), 'HH:mm');
            const checkInStatus = s.checkInStatus || '';
            const createdBy = s.createdBy?.name || 'System';
            const createdAt = format(new Date(s.createdAt), 'yyyy/MM/dd HH:mm');
            const deletedAt = s.deletedAt ? format(new Date(s.deletedAt), 'yyyy/MM/dd HH:mm') : '';

            // Escape quotes in CSV fields: " -> ""
            const escape = (str: string) => `"${String(str).replace(/"/g, '""')}"`;

            chunk +=
              [
                escape(s.id),
                escape(siteName),
                escape(shiftTypeName),
                escape(employeeName),
                escape(date),
                escape(startTime),
                escape(endTime),
                s.status,
                checkInStatus,
                s.graceMinutes,
                s.requiredCheckinIntervalMins,
                escape(createdBy),
                escape(createdAt),
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
