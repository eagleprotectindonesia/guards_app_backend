import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay, format } from 'date-fns';
import {
  getAttendanceExportBatch,
  getEmployeeOnsiteDayOffChangelogsForDates,
  getLatestGuardShiftEditChangelogs,
  listLeaveRequestsOverlappingOfficeAttendance,
} from '@repo/database';
import type { LeaveRequestReason, LeaveRequestStatus } from '@repo/types';
import { adminHasPermission, getAdminAuthSession } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { applyAttendanceVisibilityScope } from '@/lib/auth/admin-visibility';
import { getLeaveReasonMeta } from '@/lib/leave-requests';
import { getDistanceMeters, resolvePunchDistance } from '@/lib/site-post-location';
import type { AttendanceMetadata } from '@/lib/site-post-location';

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

function formatLeaveStatus(status: LeaveRequestStatus) {
  switch (status) {
    case 'pending_hr':
      return 'Pending HR';
    case 'pending_manager':
      return 'Pending Manager';
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseDateKey(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

type ShiftEditChangelog = {
  action: string;
  admin: {
    name: string;
  } | null;
};

type OnsiteDayOffChangelog = {
  action: string;
  details: Prisma.JsonValue | null;
  admin: {
    name: string;
  } | null;
};

type OnsiteDayOffDetails = {
  employeeId: string;
  date: string;
};

function parseOnsiteDayOffDetails(details: Prisma.JsonValue | null): OnsiteDayOffDetails | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }

  const employeeId = (details as Record<string, unknown>).employeeId;
  const date = (details as Record<string, unknown>).date;

  if (typeof employeeId !== 'string' || typeof date !== 'string') {
    return null;
  }

  return { employeeId, date };
}

export async function GET(request: NextRequest) {
  const session = await getAdminAuthSession();
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
        'Leave Type',
        'Leave Status',
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

          const batchEmployeeIds = Array.from(
            new Set(batch.map(att => att.employeeId ?? att.employee?.id).filter((id): id is string => Boolean(id)))
          );
          const batchDateKeys = batch.map(att => toDateKey(att.shift.date));
          const batchShiftIds = Array.from(
            new Set(batch.map(att => att.shiftId ?? att.shift?.id).filter((id): id is string => Boolean(id)))
          );
          const minBatchDateKey = batchDateKeys.reduce((min, key) => (key < min ? key : min), batchDateKeys[0]);
          const maxBatchDateKey = batchDateKeys.reduce((max, key) => (key > max ? key : max), batchDateKeys[0]);
          const guardShiftEditChangelogs = await getLatestGuardShiftEditChangelogs(batchShiftIds);
          const latestGuardShiftEditChangelogByShiftId = new Map<string, ShiftEditChangelog>();
          for (const changelog of guardShiftEditChangelogs) {
            if (!latestGuardShiftEditChangelogByShiftId.has(changelog.entityId)) {
              latestGuardShiftEditChangelogByShiftId.set(changelog.entityId, {
                action: changelog.action,
                admin: changelog.admin,
              });
            }
          }
          const onsiteDayOffChangelogs = await getEmployeeOnsiteDayOffChangelogsForDates({
            employeeIds: batchEmployeeIds,
            dateKeys: Array.from(new Set(batchDateKeys)),
          });
          const batchRowKeys = new Set(
            batch
              .map(att => {
                const employeeId = att.employeeId ?? att.employee?.id;
                return employeeId ? `${employeeId}|${toDateKey(att.shift.date)}` : null;
              })
              .filter((key): key is string => Boolean(key))
          );
          const latestDayoffTransitionByRowKey = new Map<string, OnsiteDayOffChangelog>();
          const sawOffByRowKey = new Map<string, boolean>();
          for (const changelog of onsiteDayOffChangelogs) {
            const details = parseOnsiteDayOffDetails(changelog.details);
            if (!details) {
              continue;
            }

            const rowKey = `${details.employeeId}|${details.date}`;
            if (!batchRowKeys.has(rowKey)) {
              continue;
            }

            if (changelog.action === 'CREATE' || changelog.action === 'UPDATE') {
              sawOffByRowKey.set(rowKey, true);
              continue;
            }

            if (changelog.action === 'DELETE' && sawOffByRowKey.get(rowKey)) {
              latestDayoffTransitionByRowKey.set(rowKey, {
                action: changelog.action,
                details: changelog.details,
                admin: changelog.admin,
              });
            }
          }
          const overlappingLeaveRequests =
            batchEmployeeIds.length === 0
              ? []
              : await listLeaveRequestsOverlappingOfficeAttendance({
                  employeeIds: batchEmployeeIds,
                  startDate: parseDateKey(minBatchDateKey),
                  endDate: parseDateKey(maxBatchDateKey),
                });

          const leaveRequestsByEmployee = new Map<
            string,
            Array<{
              reason: LeaveRequestReason;
              status: LeaveRequestStatus;
              startDate: Date;
              endDate: Date;
            }>
          >();
          for (const leaveRequest of overlappingLeaveRequests) {
            const existing = leaveRequestsByEmployee.get(leaveRequest.employeeId) ?? [];
            existing.push({
              reason: leaveRequest.reason as LeaveRequestReason,
              status: leaveRequest.status as LeaveRequestStatus,
              startDate: leaveRequest.startDate,
              endDate: leaveRequest.endDate,
            });
            leaveRequestsByEmployee.set(leaveRequest.employeeId, existing);
          }

          let chunk = '';
          for (const att of batch) {
            const employeeName = att.employee?.fullName || 'Unknown';
            const department = att.employee?.department || '';
            const jobTitle = att.employee?.jobTitle || '';
            const employeeIdentifier = att.employee?.employeeNumber?.trim() || att.employee?.id || 'N/A';
            const employeeLookupId = att.employeeId ?? att.employee?.id ?? '';
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
            const clockInResult = resolvePunchDistance({
              site: att.shift.site,
              metadata: att.metadata as AttendanceMetadata | null,
              calculateDistance: getDistanceMeters,
            });
            const clockInDistanceMeters = clockInResult.distanceMeters;
            const clockOutResult =
              att.shift.status === 'completed' && lastCheckin
                ? resolvePunchDistance({
                    site: att.shift.site,
                    metadata: lastCheckin.metadata as AttendanceMetadata | null,
                    calculateDistance: getDistanceMeters,
                  })
                : null;
            const clockOutDistanceMeters = clockOutResult?.distanceMeters ?? null;
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
            const employeeLeaveRequests = leaveRequestsByEmployee.get(employeeLookupId) ?? [];
            const attendanceDateKey = toDateKey(att.shift.date);
            const matchingLeave = employeeLeaveRequests.find(leaveRequest => {
              const startDateKey = toDateKey(leaveRequest.startDate);
              const endDateKey = toDateKey(leaveRequest.endDate);
              return startDateKey <= attendanceDateKey && endDateKey >= attendanceDateKey;
            });
            let leaveType = '';
            let leaveStatus = '';
            if (matchingLeave) {
              leaveType = getLeaveReasonMeta(matchingLeave.reason).label;
              leaveStatus = formatLeaveStatus(matchingLeave.status);
            } else if (att.status === 'absent') {
              leaveType = 'Unpaid Leave';
              leaveStatus = 'None';
            }
            const rowKey = employeeLookupId ? `${employeeLookupId}|${attendanceDateKey}` : '';
            const dayoffTransition = rowKey ? latestDayoffTransitionByRowKey.get(rowKey) : undefined;
            const shiftEditChangelog = latestGuardShiftEditChangelogByShiftId.get(att.shiftId ?? att.shift.id);
            const editedBy = dayoffTransition?.admin?.name || shiftEditChangelog?.admin?.name || '';
            const editReason = dayoffTransition ? 'Dayoff changes' : shiftEditChangelog ? 'Shift changes' : '';

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
                escapeCsv(leaveType),
                escapeCsv(leaveStatus),
                att.status,
                formatOptionalNumber(latenessMins),
                (latenessMins ?? 0) > 0 ? 'Yes' : 'No',
                formatOptionalNumber(earlyLeaveMinutes),
                lastCheckinAt ? 'No' : 'Yes',
                '',
                escapeCsv(editedBy),
                escapeCsv(editReason),
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
