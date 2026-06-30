import { BUSINESS_TIMEZONE, OFFICE_PAID_BREAK_MINUTES } from '@repo/database';
import {
  OfficeAttendanceMetadataDto,
  SerializedOfficeAttendanceDisplayDto,
  SerializedOfficeAttendanceWithRelationsDto,
} from '@/types/attendance';
import type { OfficeAttendanceSessionRow } from '@repo/database';

type AttendanceContextLike = {
  windowEnd: Date | null;
  [key: string]: unknown;
};

function getDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    throw new Error(`Unable to resolve business date parts for timezone ${timeZone}`);
  }

  return { year, month, day };
}

function formatBusinessDate(date: Date, timeZone: string) {
  const { year, month, day } = getDateParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDisplayStatus(clockInMetadata: OfficeAttendanceMetadataDto | null, hasClockOut: boolean) {
  if ((clockInMetadata?.latenessMins ?? 0) > 0) {
    return 'late' as const;
  }

  return hasClockOut ? ('completed' as const) : ('clocked_in' as const);
}

function formatPaidHours(minutes: number | null) {
  if (minutes == null) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours} hrs ${remainingMinutes} mins`;
}

function getActualPaidMinutes(clockInAt: string, clockOutAt: string | null) {
  if (!clockOutAt) {
    return null;
  }

  const durationMinutes = Math.floor((new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / (1000 * 60));
  const breakMinutes = durationMinutes > 5 * 60 ? OFFICE_PAID_BREAK_MINUTES : 0;

  return Math.max(0, durationMinutes - breakMinutes);
}

function getPastOpenSessionPaidMinutes(params: {
  clockInAt: string;
  scheduledPaidMinutes: number;
  currentBusinessDateKey: string;
  businessDateKey: string;
  attendanceContext: AttendanceContextLike;
}) {
  const { clockInAt, scheduledPaidMinutes, currentBusinessDateKey, businessDateKey, attendanceContext } = params;
  const windowEnd = attendanceContext.windowEnd as Date | null | undefined;

  if (businessDateKey >= currentBusinessDateKey || !windowEnd) {
    return null;
  }

  const actualPaidMinutes = getActualPaidMinutes(clockInAt, windowEnd.toISOString());
  return actualPaidMinutes == null ? null : Math.min(actualPaidMinutes, scheduledPaidMinutes);
}

function toUnifiedRowFromPaired(params: {
  session: OfficeAttendanceSessionRow;
  paidMinutes: number | null;
}): SerializedOfficeAttendanceDisplayDto {
  const { session, paidMinutes } = params;
  const clockIn = session.clockIn!;
  const clockOut = session.clockOut;
  const clockInAt = clockIn.recordedAt.toISOString();
  const businessDate =
    session.businessDate ?? formatBusinessDate(clockIn.recordedAt, BUSINESS_TIMEZONE);
  const clockInMetadata = (clockIn.metadata as OfficeAttendanceMetadataDto | null) ?? null;

  return {
    id: clockIn.id,
    employeeId: session.employeeId,
    officeId: session.officeId,
    businessDate,
    clockInAt,
    clockOutAt: clockOut ? clockOut.recordedAt.toISOString() : null,
    clockInPicture: clockIn.picture ?? null,
    paidHours: formatPaidHours(paidMinutes),
    clockInMetadata,
    clockOutMetadata: clockOut ? ((clockOut.metadata as OfficeAttendanceMetadataDto | null) ?? null) : null,
    latenessMins: clockInMetadata?.latenessMins ?? null,
    displayStatus: getDisplayStatus(clockInMetadata, Boolean(clockOut)),
    office: session.office,
    officeShift: session.officeShift,
    employee: session.employee,
  };
}

function toAbsentRowFromPaired(session: OfficeAttendanceSessionRow): SerializedOfficeAttendanceDisplayDto {
  const recordedAt = session.standaloneRecordedAt!;
  const businessDate =
    session.businessDate ?? formatBusinessDate(recordedAt, BUSINESS_TIMEZONE);

  return {
    id: session.sessionId,
    employeeId: session.employeeId,
    officeId: session.officeId,
    businessDate,
    clockInAt: recordedAt.toISOString(),
    clockOutAt: null,
    clockInPicture: null,
    paidHours: null,
    clockInMetadata: null,
    clockOutMetadata: null,
    latenessMins: null,
    displayStatus: 'absent',
    office: session.office,
    officeShift: null,
    employee: session.employee,
  };
}

function toLeaveRowFromPaired(session: OfficeAttendanceSessionRow): SerializedOfficeAttendanceDisplayDto {
  const recordedAt = session.standaloneRecordedAt!;
  const businessDate =
    session.businessDate ?? formatBusinessDate(recordedAt, BUSINESS_TIMEZONE);

  return {
    id: session.sessionId,
    employeeId: session.employeeId,
    officeId: session.officeId,
    businessDate,
    clockInAt: recordedAt.toISOString(),
    clockOutAt: null,
    clockInPicture: null,
    paidHours: null,
    clockInMetadata: null,
    clockOutMetadata: null,
    latenessMins: null,
    displayStatus: 'leave',
    office: session.office,
    officeShift: null,
    employee: session.employee,
  };
}

function toPendingLeaveRowFromPaired(session: OfficeAttendanceSessionRow): SerializedOfficeAttendanceDisplayDto {
  const recordedAt = session.standaloneRecordedAt!;
  const businessDate =
    session.businessDate ?? formatBusinessDate(recordedAt, BUSINESS_TIMEZONE);

  return {
    id: session.sessionId,
    employeeId: session.employeeId,
    officeId: session.officeId,
    businessDate,
    clockInAt: recordedAt.toISOString(),
    clockOutAt: null,
    clockInPicture: null,
    paidHours: null,
    clockInMetadata: null,
    clockOutMetadata: null,
    latenessMins: null,
    displayStatus: 'pending_leave',
    office: session.office,
    officeShift: null,
    employee: session.employee,
  };
}

export type PairedSessionContextMap = Map<string, { context: AttendanceContextLike; scheduledPaidMinutes: number }>;

function contextMapKey(employeeId: string, businessDate: string) {
  return `${employeeId}|${businessDate}`;
}

export function toDisplayRowsFromPairedSessions(params: {
  sessions: OfficeAttendanceSessionRow[];
  contextMap: PairedSessionContextMap;
  now?: Date;
}): SerializedOfficeAttendanceDisplayDto[] {
  const { sessions, contextMap, now = new Date() } = params;
  const currentBusinessDateKey = formatBusinessDate(now, BUSINESS_TIMEZONE);

  const rows: SerializedOfficeAttendanceDisplayDto[] = [];

  for (const session of sessions) {
    if (session.sessionType === 'absent') {
      rows.push(toAbsentRowFromPaired(session));
      continue;
    }
    if (session.sessionType === 'leave') {
      rows.push(toLeaveRowFromPaired(session));
      continue;
    }
    if (session.sessionType === 'pending_leave') {
      rows.push(toPendingLeaveRowFromPaired(session));
      continue;
    }

    if (!session.clockIn) {
      continue;
    }

    const clockInAt = session.clockIn.recordedAt;
    const clockInAtIso = clockInAt.toISOString();
    const businessDateKey =
      session.businessDate ?? formatBusinessDate(clockInAt, BUSINESS_TIMEZONE);

    const cached = contextMap.get(contextMapKey(session.employeeId, businessDateKey));
    if (!cached) {
      rows.push(toUnifiedRowFromPaired({ session, paidMinutes: null }));
      continue;
    }

    const { context: attendanceContext, scheduledPaidMinutes } = cached;

    if (session.sessionType === 'pair' && session.clockOut) {
      const clockOutAtIso = session.clockOut.recordedAt.toISOString();
      const actualPaidMinutes = getActualPaidMinutes(clockInAtIso, clockOutAtIso);
      const paidMinutes =
        actualPaidMinutes == null ? null : Math.min(actualPaidMinutes, scheduledPaidMinutes);
      rows.push(toUnifiedRowFromPaired({ session, paidMinutes }));
      continue;
    }

    if (session.sessionType === 'open') {
      const paidMinutes = getPastOpenSessionPaidMinutes({
        clockInAt: clockInAtIso,
        scheduledPaidMinutes,
        currentBusinessDateKey,
        businessDateKey,
        attendanceContext,
      });
      rows.push(toUnifiedRowFromPaired({ session, paidMinutes }));
      continue;
    }
  }

  return rows;
}

export function buildPairedSessionContextMap(params: {
  sessions: OfficeAttendanceSessionRow[];
  getScheduledPaidMinutes: (employeeId: string, at: Date) => Promise<number>;
  resolveContext: (employeeId: string, at: Date) => Promise<AttendanceContextLike>;
}): Promise<PairedSessionContextMap> {
  const { sessions, getScheduledPaidMinutes, resolveContext } = params;
  const map = new Map<string, { context: AttendanceContextLike; scheduledPaidMinutes: number }>();
  const inflight = new Map<string, Promise<void>>();
  const pending: Array<Promise<void>> = [];

  for (const session of sessions) {
    if (session.sessionType !== 'pair' && session.sessionType !== 'open') {
      continue;
    }
    if (!session.clockIn) {
      continue;
    }
    const clockInAt = session.clockIn.recordedAt;
    const businessDateKey =
      session.businessDate ?? formatBusinessDate(clockInAt, BUSINESS_TIMEZONE);
    const key = contextMapKey(session.employeeId, businessDateKey);
    if (map.has(key) || inflight.has(key)) {
      continue;
    }

    const promise = Promise.all([
      getScheduledPaidMinutes(session.employeeId, clockInAt),
      resolveContext(session.employeeId, clockInAt),
    ]).then(([scheduledPaidMinutes, context]) => {
      map.set(key, { scheduledPaidMinutes, context });
    });
    inflight.set(key, promise);
    pending.push(promise);
  }

  return Promise.all(pending).then(() => map);
}

export function paginateOfficeAttendanceDisplayRows<T>(rows: T[], page: number, perPage: number) {
  const start = (page - 1) * perPage;
  return rows.slice(start, start + perPage);
}

type LegacyOfficeAttendanceContextLike = {
  windowEnd: Date | null;
};

function legacyGetDisplayStatus(clockInMetadata: OfficeAttendanceMetadataDto | null, hasClockOut: boolean) {
  if ((clockInMetadata?.latenessMins ?? 0) > 0) {
    return 'late' as const;
  }

  return hasClockOut ? ('completed' as const) : ('clocked_in' as const);
}

function legacyFormatPaidHours(minutes: number | null) {
  if (minutes == null) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours} hrs ${remainingMinutes} mins`;
}

function legacyGetActualPaidMinutes(clockInAt: string, clockOutAt: string | null) {
  if (!clockOutAt) {
    return null;
  }

  const durationMinutes = Math.floor((new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / (1000 * 60));
  const breakMinutes = durationMinutes > 5 * 60 ? OFFICE_PAID_BREAK_MINUTES : 0;

  return Math.max(0, durationMinutes - breakMinutes);
}

function legacyGetPastOpenSessionPaidMinutes(params: {
  clockIn: SerializedOfficeAttendanceWithRelationsDto;
  scheduledPaidMinutes: number;
  currentBusinessDateKey: string;
  attendanceContext: LegacyOfficeAttendanceContextLike;
}) {
  const { clockIn, scheduledPaidMinutes, currentBusinessDateKey, attendanceContext } = params;
  const clockInAt = new Date(clockIn.recordedAt);
  const businessDate = clockIn.businessDate ?? formatBusinessDate(clockInAt, BUSINESS_TIMEZONE);

  if (businessDate >= currentBusinessDateKey || !attendanceContext.windowEnd) {
    return null;
  }

  const actualPaidMinutes = getActualPaidMinutes(clockIn.recordedAt, attendanceContext.windowEnd.toISOString());
  return actualPaidMinutes == null ? null : Math.min(actualPaidMinutes, scheduledPaidMinutes);
}

function legacyToUnifiedRow(
  clockIn: SerializedOfficeAttendanceWithRelationsDto,
  clockOut: SerializedOfficeAttendanceWithRelationsDto | null,
  paidMinutes: number | null
): SerializedOfficeAttendanceDisplayDto {
  const clockInAt = new Date(clockIn.recordedAt);
  const clockOutAt = clockOut?.recordedAt ?? null;
  const businessDate = clockIn.businessDate ?? formatBusinessDate(clockInAt, BUSINESS_TIMEZONE);

  return {
    id: clockIn.id,
    employeeId: clockIn.employeeId,
    officeId: clockIn.officeId,
    businessDate,
    clockInAt: clockIn.recordedAt,
    clockOutAt,
    clockInPicture: clockIn.picture ?? null,
    paidHours: legacyFormatPaidHours(paidMinutes),
    clockInMetadata: clockIn.metadata,
    clockOutMetadata: clockOut?.metadata ?? null,
    latenessMins: clockIn.metadata?.latenessMins ?? null,
    displayStatus: legacyGetDisplayStatus(clockIn.metadata, !!clockOut),
    office: clockIn.office,
    officeShift: clockIn.officeShift ?? null,
    employee: clockIn.employee,
  };
}

function legacyToAbsentRow(attendance: SerializedOfficeAttendanceWithRelationsDto): SerializedOfficeAttendanceDisplayDto {
  const recordedAt = new Date(attendance.recordedAt);
  const businessDate = attendance.businessDate ?? formatBusinessDate(recordedAt, BUSINESS_TIMEZONE);

  return {
    id: attendance.id,
    employeeId: attendance.employeeId,
    officeId: attendance.officeId,
    businessDate,
    clockInAt: attendance.recordedAt,
    clockOutAt: null,
    clockInPicture: null,
    paidHours: null,
    clockInMetadata: null,
    clockOutMetadata: null,
    latenessMins: null,
    displayStatus: 'absent',
    office: attendance.office,
    officeShift: attendance.officeShift ?? null,
    employee: attendance.employee,
  };
}

function legacyToLeaveRow(attendance: SerializedOfficeAttendanceWithRelationsDto): SerializedOfficeAttendanceDisplayDto {
  const recordedAt = new Date(attendance.recordedAt);
  const businessDate = attendance.businessDate ?? formatBusinessDate(recordedAt, BUSINESS_TIMEZONE);

  return {
    id: attendance.id,
    employeeId: attendance.employeeId,
    officeId: attendance.officeId,
    businessDate,
    clockInAt: attendance.recordedAt,
    clockOutAt: null,
    clockInPicture: null,
    paidHours: null,
    clockInMetadata: null,
    clockOutMetadata: null,
    latenessMins: null,
    displayStatus: 'leave',
    office: attendance.office,
    officeShift: attendance.officeShift ?? null,
    employee: attendance.employee,
  };
}

function legacyToPendingLeaveRow(attendance: SerializedOfficeAttendanceWithRelationsDto): SerializedOfficeAttendanceDisplayDto {
  const recordedAt = new Date(attendance.recordedAt);
  const businessDate = attendance.businessDate ?? formatBusinessDate(recordedAt, BUSINESS_TIMEZONE);

  return {
    id: attendance.id,
    employeeId: attendance.employeeId,
    officeId: attendance.officeId,
    businessDate,
    clockInAt: attendance.recordedAt,
    clockOutAt: null,
    clockInPicture: null,
    paidHours: null,
    clockInMetadata: null,
    clockOutMetadata: null,
    latenessMins: null,
    displayStatus: 'pending_leave',
    office: attendance.office,
    officeShift: attendance.officeShift ?? null,
    employee: attendance.employee,
  };
}

export function unifyOfficeAttendanceForAdminDisplay(
  attendances: SerializedOfficeAttendanceWithRelationsDto[]
): SerializedOfficeAttendanceDisplayDto[] {
  const sorted = attendances
    .slice()
    .sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime());

  const openSessionsByEmployee = new Map<string, SerializedOfficeAttendanceWithRelationsDto[]>();
  const unifiedRows: SerializedOfficeAttendanceDisplayDto[] = [];

  for (const attendance of sorted) {
    const employeeKey = attendance.employeeId ?? attendance.employee?.id ?? 'unknown';
    const employeeOpenSessions = openSessionsByEmployee.get(employeeKey) ?? [];

    if (attendance.status === 'present' || attendance.status === 'late') {
      employeeOpenSessions.push(attendance);
      openSessionsByEmployee.set(employeeKey, employeeOpenSessions);
      continue;
    }

    if (attendance.status === 'absent') {
      unifiedRows.push(legacyToAbsentRow(attendance));
      continue;
    }

    if (attendance.status === 'leave') {
      unifiedRows.push(legacyToLeaveRow(attendance));
      continue;
    }

    if (attendance.status === 'pending_leave') {
      unifiedRows.push(legacyToPendingLeaveRow(attendance));
      continue;
    }

    if (attendance.status !== 'clocked_out') {
      continue;
    }

    const clockIn = employeeOpenSessions.shift();
    if (!clockIn) {
      continue;
    }

    unifiedRows.push(
      legacyToUnifiedRow(clockIn, attendance, legacyGetActualPaidMinutes(clockIn.recordedAt, attendance.recordedAt))
    );

    if (employeeOpenSessions.length > 0) {
      openSessionsByEmployee.set(employeeKey, employeeOpenSessions);
    } else {
      openSessionsByEmployee.delete(employeeKey);
    }
  }

  for (const employeeOpenSessions of openSessionsByEmployee.values()) {
    for (const clockIn of employeeOpenSessions) {
      unifiedRows.push(legacyToUnifiedRow(clockIn, null, null));
    }
  }

  return unifiedRows.sort((left, right) => new Date(right.clockInAt).getTime() - new Date(left.clockInAt).getTime());
}

export async function buildOfficeAttendanceDisplayRows(
  attendances: SerializedOfficeAttendanceWithRelationsDto[],
  getScheduledPaidMinutes: (employeeId: string, at: Date) => Promise<number>,
  resolveAttendanceContext: (employeeId: string, at: Date) => Promise<LegacyOfficeAttendanceContextLike>,
  now = new Date()
) {
  const sorted = attendances
    .slice()
    .sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime());

  const openSessionsByEmployee = new Map<string, SerializedOfficeAttendanceWithRelationsDto[]>();
  const unifiedRows: SerializedOfficeAttendanceDisplayDto[] = [];
  const currentBusinessDateKey = formatBusinessDate(now, BUSINESS_TIMEZONE);

  for (const attendance of sorted) {
    const employeeKey = attendance.employeeId ?? attendance.employee?.id ?? 'unknown';
    const employeeOpenSessions = openSessionsByEmployee.get(employeeKey) ?? [];

    if (attendance.status === 'present' || attendance.status === 'late') {
      employeeOpenSessions.push(attendance);
      openSessionsByEmployee.set(employeeKey, employeeOpenSessions);
      continue;
    }

    if (attendance.status === 'absent') {
      unifiedRows.push(legacyToAbsentRow(attendance));
      continue;
    }

    if (attendance.status === 'leave') {
      unifiedRows.push(legacyToLeaveRow(attendance));
      continue;
    }

    if (attendance.status === 'pending_leave') {
      unifiedRows.push(legacyToPendingLeaveRow(attendance));
      continue;
    }

    if (attendance.status !== 'clocked_out') {
      continue;
    }

    const clockIn = employeeOpenSessions.shift();
    if (!clockIn) {
      continue;
    }

    const actualPaidMinutes = legacyGetActualPaidMinutes(clockIn.recordedAt, attendance.recordedAt);
    const scheduledPaidMinutes = await getScheduledPaidMinutes(clockIn.employeeId, new Date(clockIn.recordedAt));
    const paidMinutes = actualPaidMinutes == null ? null : Math.min(actualPaidMinutes, scheduledPaidMinutes);

    unifiedRows.push(legacyToUnifiedRow(clockIn, attendance, paidMinutes));

    if (employeeOpenSessions.length > 0) {
      openSessionsByEmployee.set(employeeKey, employeeOpenSessions);
    } else {
      openSessionsByEmployee.delete(employeeKey);
    }
  }

  for (const employeeOpenSessions of openSessionsByEmployee.values()) {
    for (const clockIn of employeeOpenSessions) {
      const clockInAt = new Date(clockIn.recordedAt);
      const [scheduledPaidMinutes, attendanceContext] = await Promise.all([
        getScheduledPaidMinutes(clockIn.employeeId, clockInAt),
        resolveAttendanceContext(clockIn.employeeId, clockInAt),
      ]);
      const paidMinutes = legacyGetPastOpenSessionPaidMinutes({
        clockIn,
        scheduledPaidMinutes,
        currentBusinessDateKey,
        attendanceContext,
      });

      unifiedRows.push(legacyToUnifiedRow(clockIn, null, paidMinutes));
    }
  }

  return unifiedRows.sort((left, right) => new Date(right.clockInAt).getTime() - new Date(left.clockInAt).getTime());
}
