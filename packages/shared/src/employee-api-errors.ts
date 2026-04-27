export type EmployeeAttendanceCheckinErrorCode =
  | 'unauthorized'
  | 'shift_not_found'
  | 'shift_not_assigned'
  | 'attendance_already_recorded'
  | 'shift_not_active'
  | 'location_required'
  | 'too_far_from_site'
  | 'checkin_interval_completed'
  | 'checkin_too_early'
  | 'internal_server_error';

export type EmployeeAttendanceCheckinErrorPayload = {
  code?: string;
  error?: string;
  message?: string;
  details?: Record<string, unknown>;
};

export type EmployeeAttendanceCheckinErrorTranslationInput = {
  code?: string;
  fallbackMessage?: string;
  details?: Record<string, unknown>;
};

// ESLint's no-unused-vars currently flags named tuple labels in function types.
// Keep the readable signature and suppress the false positive locally.
// eslint-disable-next-line no-unused-vars
export type TranslationFunction = (key: string, options?: Record<string, unknown>) => string;

const EMPLOYEE_ATTENDANCE_CHECKIN_ERROR_KEY_MAP: Record<EmployeeAttendanceCheckinErrorCode, string> = {
  unauthorized: 'errors.unauthorized',
  shift_not_found: 'errors.shiftNotFound',
  shift_not_assigned: 'errors.shiftNotAssigned',
  attendance_already_recorded: 'errors.attendanceAlreadyRecorded',
  shift_not_active: 'errors.shiftNotActive',
  location_required: 'errors.locationRequired',
  too_far_from_site: 'errors.tooFarFromSite',
  checkin_interval_completed: 'errors.checkinIntervalCompleted',
  checkin_too_early: 'errors.checkinTooEarly',
  internal_server_error: 'errors.internalServerError',
};

export function resolveEmployeeAttendanceCheckinErrorMessage(
  t: TranslationFunction,
  {
    code,
    fallbackMessage,
    details,
  }: EmployeeAttendanceCheckinErrorTranslationInput,
  genericFallback: string,
  namespace: 'attendance' | 'checkin'
) {
  if (code && code in EMPLOYEE_ATTENDANCE_CHECKIN_ERROR_KEY_MAP) {
    const key = EMPLOYEE_ATTENDANCE_CHECKIN_ERROR_KEY_MAP[code as EmployeeAttendanceCheckinErrorCode];
    return t(`${namespace}.${key}`, details);
  }

  return fallbackMessage || genericFallback;
}

export function getEmployeeAttendanceCheckinErrorPayload(error: unknown): EmployeeAttendanceCheckinErrorPayload {
  if (!error || typeof error !== 'object') {
    return {};
  }

  if ('response' in error && error.response && typeof error.response === 'object' && 'data' in error.response) {
    const data = (error.response as { data?: unknown }).data;
    if (data && typeof data === 'object') {
      return data as EmployeeAttendanceCheckinErrorPayload;
    }
  }

  return error as EmployeeAttendanceCheckinErrorPayload;
}
