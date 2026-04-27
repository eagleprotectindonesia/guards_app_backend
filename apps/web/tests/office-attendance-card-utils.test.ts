import { getOfficeScheduleDisplayState } from '../app/employee/components/office/office-attendance-card-utils';

describe('getOfficeScheduleDisplayState', () => {
  test('maps backend-compatible schedule fields for working-day display', () => {
    expect(
      getOfficeScheduleDisplayState({
        isWorkingDay: true,
        isLate: false,
        isAfterEnd: false,
        scheduledStartStr: '08:00',
        scheduledEndStr: '17:00',
        businessDateStr: '2026-03-28',
        schedule: {
          name: 'Default Office Schedule',
        },
      }, {
        status: 'available',
        canClockIn: true,
        canClockOut: false,
        windowClosed: false,
        messageCode: null,
        latestAttendance: null,
      })
    ).toEqual({
      isWorkingDay: true,
      isLate: false,
      isAfterEnd: false,
      scheduleName: 'Default Office Schedule',
      businessDate: '2026-03-28',
      scheduledStartStr: '08:00',
      scheduledEndStr: '17:00',
      status: 'available',
      canClockIn: true,
      canClockOut: false,
      windowClosed: false,
      isMissed: false,
      isAvailable: true,
      isClockedIn: false,
      isCompleted: false,
      messageCode: null,
      latestAttendance: null,
    });
  });

  test('falls back to backend raw fields when display helpers are absent', () => {
    expect(
      getOfficeScheduleDisplayState({
        isWorkingDay: true,
        isLate: true,
        isAfterEnd: false,
        startMinutes: 9 * 60 + 30,
        endMinutes: 18 * 60,
        businessDay: {
          dateKey: '2026-03-30',
        },
        schedule: {
          name: 'Finance Team Schedule',
        },
      }, {
        status: 'clocked_in',
        canClockIn: false,
        canClockOut: true,
        windowClosed: false,
        messageCode: 'already_clocked_in',
        latestAttendance: {
          id: 'attendance-1',
          employeeId: 'employee-1',
          status: 'present',
          recordedAt: '2026-03-30T01:00:00.000Z',
        },
      })
    ).toEqual({
      isWorkingDay: true,
      isLate: true,
      isAfterEnd: false,
      scheduleName: 'Finance Team Schedule',
      businessDate: '2026-03-30',
      scheduledStartStr: '09:30',
      scheduledEndStr: '18:00',
      status: 'clocked_in',
      canClockIn: false,
      canClockOut: true,
      windowClosed: false,
      isMissed: false,
      isAvailable: false,
      isClockedIn: true,
      isCompleted: false,
      messageCode: 'already_clocked_in',
      latestAttendance: {
        id: 'attendance-1',
        employeeId: 'employee-1',
        status: 'present',
        recordedAt: '2026-03-30T01:00:00.000Z',
      },
    });
  });

  test('maps missed state for a closed window without attendance', () => {
    expect(
      getOfficeScheduleDisplayState(
        {
          isWorkingDay: true,
          isLate: true,
          isAfterEnd: true,
        },
        {
          status: 'missed',
          canClockIn: false,
          canClockOut: false,
          windowClosed: true,
          messageCode: 'office_hours_ended',
          latestAttendance: null,
        }
      )
    ).toMatchObject({
      isWorkingDay: true,
      isLate: true,
      isAfterEnd: true,
      status: 'missed',
      canClockIn: false,
      isMissed: true,
      windowClosed: true,
      messageCode: 'office_hours_ended',
    });
  });

  test('keeps non-working-day state false for UI gating', () => {
    expect(getOfficeScheduleDisplayState({ isWorkingDay: false }).isWorkingDay).toBe(false);
    expect(getOfficeScheduleDisplayState(undefined).status).toBe('non_working_day');
  });
});
