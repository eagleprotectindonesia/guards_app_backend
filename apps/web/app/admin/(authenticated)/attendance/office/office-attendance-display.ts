import { BUSINESS_TIMEZONE } from '@repo/database';
import {
  OfficeAttendanceMetadataDto,
  SerializedOfficeAttendanceDisplayDto,
  SerializedOfficeAttendanceWithRelationsDto,
} from '@/types/attendance';

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

function toUnifiedRow(
  clockIn: SerializedOfficeAttendanceWithRelationsDto,
  clockOut: SerializedOfficeAttendanceWithRelationsDto | null
): SerializedOfficeAttendanceDisplayDto {
  const clockInAt = new Date(clockIn.recordedAt);

  return {
    id: clockIn.id,
    employeeId: clockIn.employeeId,
    officeId: clockIn.officeId,
    businessDate: formatBusinessDate(clockInAt, BUSINESS_TIMEZONE),
    clockInAt: clockIn.recordedAt,
    clockOutAt: clockOut?.recordedAt ?? null,
    clockInMetadata: clockIn.metadata,
    clockOutMetadata: clockOut?.metadata ?? null,
    latenessMins: clockIn.metadata?.latenessMins ?? null,
    displayStatus: getDisplayStatus(clockIn.metadata, !!clockOut),
    office: clockIn.office,
    employee: clockIn.employee,
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

    if (attendance.status !== 'clocked_out') {
      continue;
    }

    const clockIn = employeeOpenSessions.shift();
    if (!clockIn) {
      continue;
    }

    unifiedRows.push(toUnifiedRow(clockIn, attendance));

    if (employeeOpenSessions.length > 0) {
      openSessionsByEmployee.set(employeeKey, employeeOpenSessions);
    } else {
      openSessionsByEmployee.delete(employeeKey);
    }
  }

  for (const employeeOpenSessions of openSessionsByEmployee.values()) {
    for (const clockIn of employeeOpenSessions) {
      unifiedRows.push(toUnifiedRow(clockIn, null));
    }
  }

  return unifiedRows.sort((left, right) => new Date(right.clockInAt).getTime() - new Date(left.clockInAt).getTime());
}

export function paginateOfficeAttendanceDisplayRows<T>(rows: T[], page: number, perPage: number) {
  const start = (page - 1) * perPage;
  return rows.slice(start, start + perPage);
}
