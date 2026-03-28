import { getOfficeScheduleDisplayState } from '../app/employee/components/office/office-attendance-card-utils';

describe('getOfficeScheduleDisplayState', () => {
  test('maps backend-compatible schedule fields for working-day display', () => {
    expect(
      getOfficeScheduleDisplayState({
        isWorkingDay: true,
        scheduledStartStr: '08:00',
        scheduledEndStr: '17:00',
        businessDateStr: '2026-03-28',
        schedule: {
          name: 'Default Office Schedule',
        },
      })
    ).toEqual({
      isWorkingDay: true,
      scheduleName: 'Default Office Schedule',
      businessDate: '2026-03-28',
      scheduledStartStr: '08:00',
      scheduledEndStr: '17:00',
    });
  });

  test('falls back to backend raw fields when display helpers are absent', () => {
    expect(
      getOfficeScheduleDisplayState({
        isWorkingDay: true,
        startMinutes: 9 * 60 + 30,
        endMinutes: 18 * 60,
        businessDay: {
          dateKey: '2026-03-30',
        },
        schedule: {
          name: 'Finance Team Schedule',
        },
      })
    ).toEqual({
      isWorkingDay: true,
      scheduleName: 'Finance Team Schedule',
      businessDate: '2026-03-30',
      scheduledStartStr: '09:30',
      scheduledEndStr: '18:00',
    });
  });

  test('keeps non-working-day state false for UI gating', () => {
    expect(getOfficeScheduleDisplayState({ isWorkingDay: false }).isWorkingDay).toBe(false);
    expect(getOfficeScheduleDisplayState(undefined).isWorkingDay).toBe(false);
  });
});
