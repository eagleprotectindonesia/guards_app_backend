import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay, format } from 'date-fns';
import { getAttendanceExportBatch } from '@repo/database';
import { adminHasPermission, getAdminSession } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { applyAttendanceVisibilityScope } from '@/lib/auth/admin-visibility';

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatPaidHours(minutes: number | null) {
  if (minutes == null) {
    return '';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hrs ${remainingMinutes} mins`;
}

function formatOptionalNumber(value?: number | null) {
  return value == null ? '' : String(value);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceMeters(
  fromLat?: number | null,
  fromLng?: number | null,
  toLat?: number | null,
  toLng?: number | null
) {
  if (
    fromLat == null ||
    fromLng == null ||
    toLat == null ||
    toLng == null ||
    Number.isNaN(fromLat) ||
    Number.isNaN(fromLng) ||
    Number.isNaN(toLat) ||
    Number.isNaN(toLng)
  ) {
    return null;
  }

  const earthRadiusMeters = 6371000;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusMeters * c);
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!adminHasPermission(session, PERMISSIONS.ATTENDANCE.VIEW)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const employeeNumber = searchParams.get('employeeNumber');
  const employeeId = searchParams.get('employeeId');

  const baseWhere: Prisma.AttendanceWhereInput = {};

  if (employeeNumber) {
    baseWhere.employee = { employeeNumber };
  } else if (employeeId) {
    baseWhere.employeeId = employeeId;
  }

  if (startDateStr || endDateStr) {
    baseWhere.recordedAt = {};
    if (startDateStr) {
      baseWhere.recordedAt.gte = startOfDay(new Date(startDateStr));
    }
    if (endDateStr) {
      baseWhere.recordedAt.lte = endOfDay(new Date(endDateStr));
    }
  }

  const where = applyAttendanceVisibilityScope(baseWhere, session);

  const BATCH_SIZE = 1000;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Write Header
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
            const metadata = (att.metadata as { location?: { lat?: number; lng?: number } } | null)?.location;
            const employeeName = att.employee?.fullName || 'Unknown';
            const department = att.employee?.department || '';
            const jobTitle = att.employee?.jobTitle || '';
            const employeeIdentifier = att.employee?.employeeNumber?.trim() || att.employee?.id || 'N/A';
            const siteName = att.shift.site.name;
            const businessDateObj = new Date(att.shift.date);
            const businessDate = format(businessDateObj, 'yyyy-MM-dd');
            const clockInDate = format(new Date(att.recordedAt), 'yyyy-MM-dd');
            const clockInTime = format(new Date(att.recordedAt), 'HH:mm');
            const lastCheckinAt =
              att.shift.status === 'completed' && att.shift.checkins.length > 0
                ? att.shift.checkins.reduce((latest, current) => (current.at > latest ? current.at : latest), att.shift.checkins[0].at)
                : null;
            const clockOutDate = lastCheckinAt ? format(new Date(lastCheckinAt), 'yyyy-MM-dd') : '';
            const clockOutTime = lastCheckinAt ? format(new Date(lastCheckinAt), 'HH:mm') : '';
            const lastCheckin =
              att.shift.status === 'completed' && att.shift.checkins.length > 0
                ? att.shift.checkins.reduce((latest, current) => (current.at > latest.at ? current : latest), att.shift.checkins[0])
                : null;
            const clockOutLocation = (lastCheckin?.metadata as { lat?: number; lng?: number } | null) ?? null;
            const clockInDistanceMeters = getDistanceMeters(
              metadata?.lat,
              metadata?.lng,
              att.shift.site.latitude,
              att.shift.site.longitude
            );
            const clockOutDistanceMeters =
              att.shift.status === 'completed'
                ? getDistanceMeters(
                    clockOutLocation?.lat,
                    clockOutLocation?.lng,
                    att.shift.site.latitude,
                    att.shift.site.longitude
                  )
                : null;
            const workMinutes =
              lastCheckinAt && att.shift.status === 'completed'
                ? Math.min(
                    Math.max(0, Math.floor((new Date(lastCheckinAt).getTime() - new Date(att.recordedAt).getTime()) / (1000 * 60))),
                    Math.max(
                      0,
                      Math.floor((new Date(att.shift.endsAt).getTime() - new Date(att.shift.startsAt).getTime()) / (1000 * 60))
                    )
                  )
                : null;
            const paidHours = formatPaidHours(workMinutes);
            const shiftLengthMinutes = Math.max(
              0,
              Math.floor((new Date(att.shift.endsAt).getTime() - new Date(att.shift.startsAt).getTime()) / (1000 * 60))
            );
            const overtimeMinutes = workMinutes == null ? null : Math.max(0, workMinutes - shiftLengthMinutes);
            const earlyLeaveMinutes = workMinutes == null ? null : Math.max(0, shiftLengthMinutes - workMinutes);
            const latenessMins = (att.metadata as { latenessMins?: number } | null)?.latenessMins ?? null;

            chunk +=
              [
                escapeCsv(employeeIdentifier),
                escapeCsv(employeeName),
                escapeCsv(department),
                escapeCsv(jobTitle),
                escapeCsv(siteName),
                businessDate,
                escapeCsv(format(businessDateObj, 'EEEE')),
                escapeCsv(format(businessDateObj, 'MMMM')),
                escapeCsv(att.shift.shiftType?.name || ''),
                escapeCsv(format(new Date(att.shift.startsAt), 'HH:mm')),
                escapeCsv(format(new Date(att.shift.endsAt), 'HH:mm')),
                String(att.shift.graceMinutes ?? ''),
                escapeCsv(clockInDate),
                escapeCsv(clockInTime),
                formatOptionalNumber(clockInDistanceMeters),
                escapeCsv(clockOutDate),
                escapeCsv(clockOutTime),
                formatOptionalNumber(clockOutDistanceMeters),
                escapeCsv(paidHours),
                workMinutes == null ? '' : String(workMinutes),
                formatOptionalNumber(overtimeMinutes),
                att.status,
                formatOptionalNumber(latenessMins),
                (latenessMins ?? 0) > 0 ? 'Yes' : 'No',
                formatOptionalNumber(earlyLeaveMinutes),
                lastCheckinAt ? 'No' : 'Yes',
                '',
                '',
                '',
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
