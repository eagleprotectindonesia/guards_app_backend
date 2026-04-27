import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { endOfDay, format, startOfDay } from 'date-fns';
import {
  getOfficeAttendanceExportBatch,
  OFFICE_PAID_BREAK_MINUTES,
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

function getWorkMinutes(clockInAt: string, clockOutAt: string | null) {
  if (!clockOutAt) {
    return null;
  }

  const durationMinutes = Math.floor((new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / (1000 * 60));
  const breakMinutes = durationMinutes > 5 * 60 ? OFFICE_PAID_BREAK_MINUTES : 0;

  return Math.max(0, durationMinutes - breakMinutes);
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
              department: att.employee.department,
              jobTitle: att.employee.jobTitle,
            }
          : null,
        officeShift: att.officeShift
          ? {
              id: att.officeShift.id,
              officeShiftType: att.officeShift.officeShiftType
                ? {
                    name: att.officeShift.officeShiftType.name,
                    startTime: att.officeShift.officeShiftType.startTime,
                    endTime: att.officeShift.officeShiftType.endTime,
                  }
                : null,
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
  const scheduledMinutesCache = new Map<string, number>();
  const scheduledMinutesByRow = await Promise.all(
    rows.map(async row => {
      const key = `${row.employeeId}|${row.clockInAt}`;
      const cached = scheduledMinutesCache.get(key);
      if (cached != null) {
        return cached;
      }

      const scheduledMinutes = await getScheduledPaidMinutesForOfficeAttendance(row.employeeId, new Date(row.clockInAt));
      scheduledMinutesCache.set(key, scheduledMinutes);
      return scheduledMinutes;
    })
  );

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const headers = [
        'Employee ID',
        'Employee',
        'Department',
        'Job Title',
        'Office',
        'Business Date',
        'Day Name',
        'Month',
        'Assigned Shift',
        'Shift Start Time',
        'Shift End Time',
        'Grace Minutes',
        'Clock In Date',
        'Clock In Time',
        'Clock In Distance (m)',
        'Clock Out Date',
        'Clock Out Time',
        'Clock Out Distance (m)',
        'Paid Hours',
        'Work Minutes',
        'Overtime Minutes',
        'Status',
        'Lateness (mins)',
        'Late Flag',
        'Early Leave Minutes',
        'Missed Punch Flag',
        'Manual Edit Flag',
        'Edited By',
        'Edit Reason',
      ];

      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let chunk = '';
      for (const [index, row] of rows.entries()) {
        const scheduledMinutes = scheduledMinutesByRow[index];
        const workMinutes = getWorkMinutes(row.clockInAt, row.clockOutAt);
        const overtimeMinutes = workMinutes == null ? null : Math.max(0, workMinutes - scheduledMinutes);
        const earlyLeaveMinutes = workMinutes == null ? null : Math.max(0, scheduledMinutes - workMinutes);
        const businessDate = new Date(`${row.businessDate}T00:00:00`);

        chunk +=
          [
            escapeCsv(row.employee?.employeeNumber || ''),
            escapeCsv(row.employee?.fullName || 'Unknown'),
            escapeCsv(row.employee?.department || ''),
            escapeCsv(row.employee?.jobTitle || ''),
            escapeCsv(row.office?.name || ''),
            row.businessDate,
            escapeCsv(format(businessDate, 'EEEE')),
            escapeCsv(format(businessDate, 'MMMM')),
            escapeCsv(row.officeShift?.officeShiftType?.name || ''),
            escapeCsv(row.officeShift?.officeShiftType?.startTime || ''),
            escapeCsv(row.officeShift?.officeShiftType?.endTime || ''),
            '0',
            format(new Date(row.clockInAt), 'yyyy-MM-dd'),
            format(new Date(row.clockInAt), 'HH:mm'),
            formatOptionalNumber(row.clockInMetadata?.distanceMeters),
            row.clockOutAt ? format(new Date(row.clockOutAt), 'yyyy-MM-dd') : '',
            row.clockOutAt ? format(new Date(row.clockOutAt), 'HH:mm') : '',
            formatOptionalNumber(row.clockOutMetadata?.distanceMeters),
            escapeCsv(row.paidHours || ''),
            formatOptionalNumber(workMinutes),
            formatOptionalNumber(overtimeMinutes),
            row.displayStatus,
            formatOptionalNumber(row.latenessMins),
            (row.latenessMins ?? 0) > 0 ? 'Yes' : 'No',
            formatOptionalNumber(earlyLeaveMinutes),
            row.clockOutAt ? 'No' : 'Yes',
            '',
            '',
            '',
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
