import { NextRequest, NextResponse } from 'next/server';
import { Prisma, Shift, Site, ShiftType } from '@prisma/client';
import { EmployeeWithRelations } from '@repo/database';
import { startOfDay, endOfDay, format } from 'date-fns';
import { getExportShiftsBatch, getEmployeeOnsiteDayOffsForDateRange } from '@repo/database';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const employeeId = searchParams.get('employeeId');
  const siteId = searchParams.get('siteId');
  const includeDayOffs = searchParams.get('includeDayOffs') === 'true';

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

  if (includeDayOffs) {
    return exportShiftsWithDayOffs(where, startDateStr, endDateStr, employeeId);
  }

  const BATCH_SIZE = 1000;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Write Header
      const headers = [
        'Employee ID',
        'Employee Name',
        'Site',
        'Shift Type',
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
        'Swap/Replacement',
        'Swap/Replaced With',
        'Replacement Reason',
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
              swapsWithShift: {
                id: string;
                employee: { fullName: string | null; employeeNumber: string | null };
              } | null;
              replacedByAdmin: { name: string } | null;
            };

            const siteName = s.site.name;
            const shiftTypeName = s.shiftType.name;
            const employeeName = s.employee?.fullName || 'Unassigned';
            const employeeId = s.employee?.employeeNumber || '';
            const date = format(new Date(s.date), 'yyyy/MM/dd');
            const startTime = format(new Date(s.startsAt), 'HH:mm');
            const endTime = format(new Date(s.endsAt), 'HH:mm');
            const checkInStatus = s.checkInStatus || '';
            const createdBy = s.createdBy?.name || 'System';
            const createdAt = format(new Date(s.createdAt), 'yyyy/MM/dd HH:mm');
            const deletedAt = s.deletedAt ? format(new Date(s.deletedAt), 'yyyy/MM/dd HH:mm') : '';

            const swapReplacement = s.swapsWithShiftId ? 'Swapped' : s.replacedByAdminId ? 'Replaced' : '';
            const swapWithEmployee =
              s.swapsWithShift?.employee?.fullName ||
              (s.replacedByAdminId ? s.employee?.fullName || '' : '');
            const replacementReason = s.replacementReason || '';

            // Escape quotes in CSV fields: " -> ""
            const escape = (str: string) => `"${String(str).replace(/"/g, '""')}"`;

            chunk +=
              [
                escape(employeeId),
                escape(employeeName),
                escape(siteName),
                escape(shiftTypeName),
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
                escape(swapReplacement),
                escape(swapWithEmployee),
                escape(replacementReason),
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

async function exportShiftsWithDayOffs(
  shiftsWhere: Prisma.ShiftWhereInput,
  startDateStr: string | null,
  endDateStr: string | null,
  employeeId: string | null
) {
  const BATCH_SIZE = 1000;

  const headers = [
    'Employee ID',
    'Employee Name',
    'Site',
    'Shift Type',
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
    'Swap/Replacement',
    'Swap/Replaced With',
    'Replacement Reason',
  ];

  const escape = (str: string) => `"${String(str).replace(/"/g, '""')}"`;

  type RowEntry = { date: Date; row: string[] };

  const rows: RowEntry[] = [];

  // Collect all shifts
  let cursor: string | undefined = undefined;
  while (true) {
    const batch = await getExportShiftsBatch({ take: BATCH_SIZE, where: shiftsWhere, cursor });
    if (batch.length === 0) break;

    for (const shift of batch) {
      const s = shift as Shift & {
        site: Site;
        shiftType: ShiftType;
        employee: EmployeeWithRelations | null;
        createdBy: { name: string } | null;
        swapsWithShift: {
          id: string;
          employee: { fullName: string | null; employeeNumber: string | null };
        } | null;
        replacedByAdmin: { name: string } | null;
      };

      const swapReplacement = s.swapsWithShiftId ? 'Swapped' : s.replacedByAdminId ? 'Replaced' : '';
      const swapWithEmployee =
        s.swapsWithShift?.employee?.fullName ||
        (s.replacedByAdminId ? s.employee?.fullName || '' : '');
      const replacementReason = s.replacementReason || '';

      rows.push({
        date: s.date,
        row: [
          escape(s.employee?.employeeNumber || ''),
          escape(s.employee?.fullName || 'Unassigned'),
          escape(s.site.name),
          escape(s.shiftType.name),
          escape(format(new Date(s.date), 'yyyy/MM/dd')),
          escape(format(new Date(s.startsAt), 'HH:mm')),
          escape(format(new Date(s.endsAt), 'HH:mm')),
          s.status,
          s.checkInStatus || '',
          String(s.graceMinutes ?? ''),
          String(s.requiredCheckinIntervalMins ?? ''),
          escape(s.createdBy?.name || 'System'),
          escape(format(new Date(s.createdAt), 'yyyy/MM/dd HH:mm')),
          s.deletedAt ? escape(format(new Date(s.deletedAt), 'yyyy/MM/dd HH:mm')) : '',
          escape(swapReplacement),
          escape(swapWithEmployee),
          escape(replacementReason),
        ],
      });
    }

    if (batch.length < BATCH_SIZE) break;
    cursor = batch[batch.length - 1].id;
  }

  // Collect dayoffs
  const dayOffStartDate = startDateStr ? startOfDay(new Date(startDateStr)) : null;
  const dayOffEndDate = endDateStr ? endOfDay(new Date(endDateStr)) : null;

  if (dayOffStartDate) {
    const dayOffs = await getEmployeeOnsiteDayOffsForDateRange(
      dayOffStartDate,
      dayOffEndDate ?? undefined,
      employeeId || undefined
    );

    if (dayOffs.length > 0) {
      for (const dayOff of dayOffs) {
        rows.push({
          date: dayOff.date,
          row: [
            escape(dayOff.employee.employeeNumber || ''),
            escape(dayOff.employee.fullName),
            '',
            escape('Day Off'),
            escape(format(dayOff.date, 'yyyy/MM/dd')),
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
          ],
        });
      }
    }
  }

  // Sort by date ascending
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let chunk = '';
      for (const { row } of rows) {
        chunk += row.join(',') + '\n';
      }
      controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="shifts_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
