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
        'Employee',
        'Department',
        'Job Title',
        'Employee ID',
        'Site',
        'Shift Date',
        'Clock In Date',
        'Clock In Time',
        'Clock Out Date',
        'Clock Out Time',
        'Paid Hours',
        'Work Minutes',
        'Status',
        'Clock In Latitude',
        'Clock In Longitude',
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
            const metadata = (att.metadata as { location: { lat?: number; lng?: number } })?.location;
            const lat = metadata?.lat?.toFixed(6) || '';
            const lng = metadata?.lng?.toFixed(6) || '';
            const employeeName = att.employee?.fullName || 'Unknown';
            const department = att.employee?.department || '';
            const jobTitle = att.employee?.jobTitle || '';
            const employeeIdentifier = att.employee?.employeeNumber?.trim() || att.employee?.id || 'N/A';
            const siteName = att.shift.site.name;
            const shiftDate = format(new Date(att.shift.date), 'yyyy/MM/dd');
            const clockInDate = format(new Date(att.recordedAt), 'yyyy/MM/dd');
            const clockInTime = format(new Date(att.recordedAt), 'HH:mm');
            const lastCheckinAt =
              att.shift.status === 'completed' && att.shift.checkins.length > 0
                ? att.shift.checkins.reduce((latest, current) => (current.at > latest ? current.at : latest), att.shift.checkins[0].at)
                : null;
            const clockOutDate = lastCheckinAt ? format(new Date(lastCheckinAt), 'yyyy/MM/dd') : '';
            const clockOutTime = lastCheckinAt ? format(new Date(lastCheckinAt), 'HH:mm') : '';
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

            chunk +=
              [
                escapeCsv(employeeName),
                escapeCsv(department),
                escapeCsv(jobTitle),
                escapeCsv(employeeIdentifier),
                escapeCsv(siteName),
                escapeCsv(shiftDate),
                escapeCsv(clockInDate),
                escapeCsv(clockInTime),
                escapeCsv(clockOutDate),
                escapeCsv(clockOutTime),
                escapeCsv(paidHours),
                workMinutes == null ? '' : String(workMinutes),
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
