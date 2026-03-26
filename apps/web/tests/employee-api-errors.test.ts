import { resolveEmployeeAttendanceCheckinErrorMessage } from '@repo/shared';

describe('employee attendance/check-in error translation resolver', () => {
  test('resolves known attendance code through i18n key', () => {
    const t = jest.fn((key: string) => key);

    const message = resolveEmployeeAttendanceCheckinErrorMessage(
      t,
      {
        code: 'attendance_already_recorded',
        fallbackMessage: 'Attendance already recorded for this shift',
      },
      'Failed to record attendance',
      'attendance'
    );

    expect(message).toBe('attendance.errors.attendanceAlreadyRecorded');
  });

  test('falls back to backend message for unknown code', () => {
    const t = jest.fn((key: string) => key);

    const message = resolveEmployeeAttendanceCheckinErrorMessage(
      t,
      {
        code: 'unexpected_code',
        fallbackMessage: 'Backend fallback',
      },
      'Failed to record attendance',
      'attendance'
    );

    expect(message).toBe('Backend fallback');
  });

  test('falls back to generic message when no payload text exists', () => {
    const t = jest.fn((key: string) => key);

    const message = resolveEmployeeAttendanceCheckinErrorMessage(t, {}, 'Failed to record attendance', 'attendance');

    expect(message).toBe('Failed to record attendance');
  });
});
