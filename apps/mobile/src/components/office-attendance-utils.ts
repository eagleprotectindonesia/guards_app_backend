import type { OfficeAttendanceState, OfficeAttendanceWindowStatus } from '@repo/types';
import { TranslationFunction } from '@repo/shared';

type OfficeScheduleContextLike = {
  isWorkingDay?: boolean;
  isLate?: boolean;
  isAfterEnd?: boolean;
  scheduledStartStr?: string | null;
  scheduledEndStr?: string | null;
  businessDateStr?: string | null;
  startMinutes?: number | null;
  endMinutes?: number | null;
  schedule?: {
    name?: string | null;
  } | null;
  businessDay?: {
    dateKey?: string | null;
  } | null;
} | null | undefined;

type OfficeAttendanceErrorInput = {
  code?: string;
  fallbackMessage?: string;
  details?: Record<string, unknown>;
};

function formatMinutesAsTime(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return null;

  const normalized = Math.max(0, Math.trunc(minutes));
  const hours = Math.floor(normalized / 60) % 24;
  const mins = normalized % 60;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function getOfficeScheduleDisplayState(
  scheduleContext: OfficeScheduleContextLike,
  attendanceState?: OfficeAttendanceState | null
) {
  const status = (attendanceState?.status ?? 'non_working_day') as OfficeAttendanceWindowStatus;

  return {
    isWorkingDay: Boolean(scheduleContext?.isWorkingDay),
    isLate: Boolean(scheduleContext?.isLate),
    isAfterEnd: Boolean(scheduleContext?.isAfterEnd),
    scheduleName: scheduleContext?.schedule?.name ?? null,
    businessDate: scheduleContext?.businessDateStr ?? scheduleContext?.businessDay?.dateKey ?? null,
    scheduledStartStr: scheduleContext?.scheduledStartStr ?? formatMinutesAsTime(scheduleContext?.startMinutes),
    scheduledEndStr: scheduleContext?.scheduledEndStr ?? formatMinutesAsTime(scheduleContext?.endMinutes),
    status,
    canClockIn: attendanceState?.canClockIn ?? false,
    canClockOut: attendanceState?.canClockOut ?? false,
    windowClosed: attendanceState?.windowClosed ?? false,
    isMissed: status === 'missed',
    isAvailable: status === 'available',
    isClockedIn: status === 'clocked_in',
    isCompleted: status === 'completed',
    messageCode: attendanceState?.messageCode ?? null,
    latestAttendance: attendanceState?.latestAttendance ?? null,
  };
}

const OFFICE_ATTENDANCE_ERROR_KEY_MAP: Record<string, string> = {
  location_required: 'officeAttendance.errors.locationRequired',
  too_far_from_office: 'officeAttendance.errors.tooFarFromOffice',
  assigned_office_not_found: 'officeAttendance.errors.assignedOfficeNotFound',
  office_location_not_configured: 'officeAttendance.errors.officeLocationNotConfigured',
  not_working_day: 'officeAttendance.errors.notWorkingDay',
  office_hours_ended: 'officeAttendance.errors.officeHoursEnded',
  clock_in_required: 'officeAttendance.errors.clockInRequired',
  office_attendance_already_clocked_in: 'officeAttendance.errors.alreadyClockedIn',
  office_attendance_completed: 'officeAttendance.errors.attendanceCompleted',
  unauthorized: 'officeAttendance.errors.unauthorized',
  internal_server_error: 'officeAttendance.errors.internalServerError',
};

export function resolveOfficeAttendanceErrorMessage(
  t: TranslationFunction,
  { code, fallbackMessage, details }: OfficeAttendanceErrorInput
) {
  if (code && code in OFFICE_ATTENDANCE_ERROR_KEY_MAP) {
    return t(OFFICE_ATTENDANCE_ERROR_KEY_MAP[code], details);
  }

  return fallbackMessage || t('officeAttendance.errors.generic');
}
