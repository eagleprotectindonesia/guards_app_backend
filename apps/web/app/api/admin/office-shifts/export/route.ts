import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { endOfDay, format, startOfDay } from 'date-fns';
import { getPaginatedOfficeShifts, getEmployeeDayOffsForDateRange } from '@repo/database';
import { adminHasPermission, getAdminAuthSession } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const session = await getAdminAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!adminHasPermission(session, PERMISSIONS.OFFICE_SHIFTS.VIEW)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const includeDayOffs = searchParams.get('includeDayOffs') === 'true';

  if (!startDateStr || !endDateStr) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  const startDate = startOfDay(new Date(startDateStr));
  const endDate = endOfDay(new Date(endDateStr));

  if (includeDayOffs) {
    return exportOfficeShiftsWithDayOffs(startDate, endDate);
  }

  const where: Prisma.OfficeShiftWhereInput = {
    startsAt: {
      gte: startDate,
      lte: endDate,
    },
  };

  const BATCH_SIZE = 1000;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const headers = [
        'Employee ID',
        'Employee Name',
        'Shift Type',
        'Date',
        'Start Time',
        'End Time',
        'Status',
        'Note',
        'Created By',
        'Last Updated By',
      ];
      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let skip = 0;

      try {
        while (true) {
          const { officeShifts } = await getPaginatedOfficeShifts({
            where,
            orderBy: { startsAt: 'asc' },
            skip,
            take: BATCH_SIZE,
          });

          if (officeShifts.length === 0) {
            break;
          }

          let chunk = '';
          for (const shift of officeShifts) {
            chunk +=
              [
                escapeCsv(shift.employee.employeeNumber || ''),
                escapeCsv(shift.employee.fullName),
                escapeCsv(shift.officeShiftType.name),
                escapeCsv(format(new Date(shift.startsAt), 'yyyy-MM-dd')),
                escapeCsv(format(new Date(shift.startsAt), 'HH:mm')),
                escapeCsv(format(new Date(shift.endsAt), 'HH:mm')),
                escapeCsv(shift.status),
                escapeCsv(shift.note || ''),
                escapeCsv(shift.createdBy?.name || ''),
                escapeCsv(shift.lastUpdatedBy?.name || ''),
              ].join(',') + '\n';
          }

          controller.enqueue(encoder.encode(chunk));

          if (officeShifts.length < BATCH_SIZE) {
            break;
          }

          skip += BATCH_SIZE;
        }
      } catch (error) {
        console.error('Office shifts export stream error:', error);
        controller.error(error);
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="office_shifts_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}

async function exportOfficeShiftsWithDayOffs(startDate: Date, endDate: Date) {
  const BATCH_SIZE = 1000;

  const headers = [
    'Employee ID',
    'Employee Name',
    'Shift Type',
    'Date',
    'Start Time',
    'End Time',
    'Status',
    'Note',
    'Created By',
    'Last Updated By',
  ];

  type RowEntry = { date: Date; row: string[] };
  const rows: RowEntry[] = [];

  // Collect all office shifts
  let skip = 0;
  while (true) {
    const { officeShifts } = await getPaginatedOfficeShifts({
      where: {
        startsAt: { gte: startDate, lte: endDate },
      },
      orderBy: { startsAt: 'asc' },
      skip,
      take: BATCH_SIZE,
    });

    if (officeShifts.length === 0) break;

    for (const shift of officeShifts) {
      rows.push({
        date: shift.startsAt,
        row: [
          escapeCsv(shift.employee.employeeNumber || ''),
          escapeCsv(shift.employee.fullName),
          escapeCsv(shift.officeShiftType.name),
          escapeCsv(format(new Date(shift.startsAt), 'yyyy-MM-dd')),
          escapeCsv(format(new Date(shift.startsAt), 'HH:mm')),
          escapeCsv(format(new Date(shift.endsAt), 'HH:mm')),
          escapeCsv(shift.status),
          escapeCsv(shift.note || ''),
          escapeCsv(shift.createdBy?.name || ''),
          escapeCsv(shift.lastUpdatedBy?.name || ''),
        ],
      });
    }

    if (officeShifts.length < BATCH_SIZE) break;
    skip += BATCH_SIZE;
  }

  // Collect dayoffs
  const dayOffs = await getEmployeeDayOffsForDateRange(startDate, endDate);

  for (const dayOff of dayOffs) {
    rows.push({
      date: dayOff.date,
      row: [
        escapeCsv(dayOff.employee.employeeNumber || ''),
        escapeCsv(dayOff.employee.fullName),
        escapeCsv('Day Off'),
        escapeCsv(format(new Date(dayOff.date), 'yyyy-MM-dd')),
        '',
        '',
        '',
        escapeCsv(dayOff.note || ''),
        '',
        '',
      ],
    });
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
      'Content-Disposition': `attachment; filename="office_shifts_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
