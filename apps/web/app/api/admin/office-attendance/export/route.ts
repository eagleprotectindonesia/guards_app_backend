import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { endOfDay, format, startOfDay } from 'date-fns';
import {
  getOfficeAttendanceExportBatch,
  getScheduledPaidMinutesForOfficeAttendance,
} from '@repo/database';
import { adminHasPermission, getAdminSession } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessOfficeAttendance } from '@/lib/auth/admin-visibility';
import {
  buildOfficeAttendanceDisplayRows,
} from '@/app/admin/(authenticated)/attendance/office/office-attendance-display';
import {
  OfficeAttendanceMetadataDto,
  SerializedOfficeAttendanceWithRelationsDto,
} from '@/types/attendance';

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatOptionalNumber(value?: number | null) {
  return value == null ? '' : String(value);
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!adminHasPermission(session, PERMISSIONS.ATTENDANCE.VIEW) || !canAccessOfficeAttendance(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const officeId = searchParams.get('officeId');

  const where: Prisma.OfficeAttendanceWhereInput = {};

  if (officeId) {
    where.officeId = officeId;
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
  const records: SerializedOfficeAttendanceWithRelationsDto[] = [];
  let cursor: string | undefined;

  while (true) {
    const batch = await getOfficeAttendanceExportBatch({
      take: BATCH_SIZE,
      where,
      cursor,
    });

    if (batch.length === 0) {
      break;
    }

    records.push(
      ...batch.map(att => ({
        id: att.id,
        recordedAt: att.recordedAt.toISOString(),
        status: att.status,
        employeeId: att.employeeId,
        officeId: att.officeId,
        metadata: att.metadata as OfficeAttendanceMetadataDto | null,
        office: att.office
          ? {
              id: att.office.id,
              name: att.office.name,
            }
          : null,
        employee: att.employee
          ? {
              id: att.employee.id,
              fullName: att.employee.fullName,
              employeeNumber: att.employee.employeeNumber,
            }
          : null,
      }))
    );

    if (batch.length < BATCH_SIZE) {
      break;
    }

    cursor = batch[batch.length - 1].id;
  }

  const rows = await buildOfficeAttendanceDisplayRows(records, getScheduledPaidMinutesForOfficeAttendance);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const headers = [
        'Employee',
        'Employee ID',
        'Office',
        'Business Date',
        'Clock In Date',
        'Clock In Time',
        'Clock In Distance (m)',
        'Clock Out Date',
        'Clock Out Time',
        'Clock Out Distance (m)',
        'Paid Hours',
        'Status',
        'Lateness (mins)',
      ];

      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let chunk = '';
      for (const row of rows) {
        chunk +=
          [
            escapeCsv(row.employee?.fullName || 'Unknown'),
            escapeCsv(row.employee?.employeeNumber || ''),
            escapeCsv(row.office?.name || ''),
            row.businessDate,
            format(new Date(row.clockInAt), 'yyyy-MM-dd'),
            format(new Date(row.clockInAt), 'HH:mm'),
            formatOptionalNumber(row.clockInMetadata?.distanceMeters),
            row.clockOutAt ? format(new Date(row.clockOutAt), 'yyyy-MM-dd') : '',
            row.clockOutAt ? format(new Date(row.clockOutAt), 'HH:mm') : '',
            formatOptionalNumber(row.clockOutMetadata?.distanceMeters),
            escapeCsv(row.paidHours || ''),
            row.displayStatus,
            formatOptionalNumber(row.latenessMins),
          ].join(',') + '\n';
      }

      controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="office_attendance_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
