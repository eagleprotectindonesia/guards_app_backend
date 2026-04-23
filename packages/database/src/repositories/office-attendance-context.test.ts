import {
  getScheduledPaidMinutesForOfficeAttendance,
  resolveOfficeAttendanceContextForEmployee,
} from './office-attendance-context';
import { db as prisma } from '../prisma/client';
import {
  getScheduledPaidMinutesForFixedOfficeScheduleAttendance,
  resolveOfficeWorkScheduleContextForEmployee,
} from './office-work-schedules';
import {
  getScheduledPaidMinutesForOfficeShiftAttendance,
  resolveOfficeShiftContextForEmployee,
} from './office-shifts';
import { resolveOfficeDayOverrideAnchorsForEmployee } from './office-day-overrides';
import { resolveHolidayPolicyForEmployeeDate } from './holiday-calendar-entries';

jest.mock('../prisma/client', () => ({
  db: {
    employee: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('./office-work-schedules', () => ({
  getScheduledPaidMinutesForFixedOfficeScheduleAttendance: jest.fn(),
  resolveOfficeWorkScheduleContextForEmployee: jest.fn(),
}));

jest.mock('./office-shifts', () => ({
  getScheduledPaidMinutesForOfficeShiftAttendance: jest.fn(),
  resolveOfficeShiftContextForEmployee: jest.fn(),
}));

jest.mock('./office-day-overrides', () => ({
  resolveOfficeDayOverrideAnchorsForEmployee: jest.fn(),
}));

jest.mock('./holiday-calendar-entries', () => ({
  resolveHolidayPolicyForEmployeeDate: jest.fn(),
}));

describe('office attendance context', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (resolveOfficeDayOverrideAnchorsForEmployee as jest.Mock).mockResolvedValue({
      businessDay: { dateKey: '2026-04-01' },
      currentDateKey: '2026-04-01',
      previousDateKey: '2026-03-31',
      currentOverride: null,
      previousOverride: null,
    });
    (resolveHolidayPolicyForEmployeeDate as jest.Mock).mockResolvedValue(null);
  });

  test('prefers office shift context even when employee mode is fixed schedule', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      department: null,
    });
    (resolveOfficeShiftContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      shift: { id: 'shift-1', attendanceMode: 'non_office' },
      isWorkingDay: true,
    });

    const context = await resolveOfficeAttendanceContextForEmployee('employee-1');

    expect(resolveOfficeShiftContextForEmployee).toHaveBeenCalledWith(
      'employee-1',
      expect.any(Date),
      expect.objectContaining({ allowedDateKeys: expect.any(Set) })
    );
    expect(resolveOfficeWorkScheduleContextForEmployee).not.toHaveBeenCalled();
    expect(context).toMatchObject({
      source: 'office_shift',
      shift: { id: 'shift-1' },
      effectiveAttendanceMode: 'non_office',
      attendancePolicySource: 'shift_override',
    });
  });

  test('falls back to office work schedule context when no office shift exists', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      department: null,
    });
    (resolveOfficeShiftContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      shift: null,
      isWorkingDay: false,
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'default',
      schedule: { id: 'schedule-1', name: 'Default Office Schedule' },
      isWorkingDay: true,
      windowStart: new Date('2026-04-01T00:00:00.000Z'),
      windowEnd: new Date('2026-04-01T09:00:00.000Z'),
    });

    const context = await resolveOfficeAttendanceContextForEmployee('employee-1');

    expect(resolveOfficeShiftContextForEmployee).toHaveBeenCalledWith(
      'employee-1',
      expect.any(Date),
      expect.objectContaining({ allowedDateKeys: expect.any(Set) })
    );
    expect(resolveOfficeWorkScheduleContextForEmployee).toHaveBeenCalledWith(
      'employee-1',
      expect.any(Date),
      expect.objectContaining({ offDateKeys: expect.any(Set) })
    );
    expect(context).toMatchObject({
      source: 'office_work_schedule',
      shift: null,
      schedule: { id: 'schedule-1', name: 'Default Office Schedule' },
      isWorkingDay: true,
      effectiveAttendanceMode: 'office_required',
      attendancePolicySource: 'employee_default',
    });
  });

  test('returns non-working off-day context when current day override is off', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      department: null,
    });
    (resolveOfficeDayOverrideAnchorsForEmployee as jest.Mock).mockResolvedValue({
      businessDay: { dateKey: '2026-04-01' },
      currentDateKey: '2026-04-01',
      previousDateKey: '2026-03-31',
      currentOverride: { overrideType: 'off' },
      previousOverride: null,
    });
    (resolveOfficeShiftContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      shift: null,
      businessDay: { dateKey: '2026-04-01' },
      isWorkingDay: false,
      startMinutes: null,
      endMinutes: null,
      windowStart: null,
      windowEnd: null,
      isLate: false,
      isAfterEnd: false,
    });

    const context = await resolveOfficeAttendanceContextForEmployee('employee-1');

    expect(resolveOfficeWorkScheduleContextForEmployee).not.toHaveBeenCalled();
    expect(context).toMatchObject({
      source: 'office_day_override_off',
      isWorkingDay: false,
      shift: null,
      windowStart: null,
      windowEnd: null,
      effectiveAttendanceMode: 'office_required',
      attendancePolicySource: 'employee_default',
    });
  });

  test('returns non-working shift-managed day when shift override exists without a shift', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: true,
      department: null,
    });
    (resolveOfficeDayOverrideAnchorsForEmployee as jest.Mock).mockResolvedValue({
      businessDay: { dateKey: '2026-04-01' },
      currentDateKey: '2026-04-01',
      previousDateKey: '2026-03-31',
      currentOverride: { overrideType: 'shift_override' },
      previousOverride: null,
    });
    (resolveOfficeShiftContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      shift: null,
      businessDay: { dateKey: '2026-04-01' },
      isWorkingDay: false,
      startMinutes: null,
      endMinutes: null,
      windowStart: null,
      windowEnd: null,
      isLate: false,
      isAfterEnd: false,
    });

    const context = await resolveOfficeAttendanceContextForEmployee('employee-1');

    expect(resolveOfficeWorkScheduleContextForEmployee).not.toHaveBeenCalled();
    expect(context).toMatchObject({
      source: 'office_shift',
      shift: null,
      isWorkingDay: false,
      effectiveAttendanceMode: 'non_office',
      attendancePolicySource: 'employee_default',
    });
  });

  test('uses shift paid minutes when a relevant office shift exists', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      department: null,
    });
    (resolveOfficeShiftContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      shift: { id: 'shift-1' },
    });
    (getScheduledPaidMinutesForOfficeShiftAttendance as jest.Mock).mockResolvedValue(480);

    const minutes = await getScheduledPaidMinutesForOfficeAttendance('employee-1');

    expect(getScheduledPaidMinutesForOfficeShiftAttendance).toHaveBeenCalledWith('employee-1', expect.any(Date));
    expect(getScheduledPaidMinutesForFixedOfficeScheduleAttendance).not.toHaveBeenCalled();
    expect(minutes).toBe(480);
  });

  test('uses schedule paid minutes when no relevant office shift exists', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      department: null,
    });
    (resolveOfficeShiftContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      shift: null,
    });
    (getScheduledPaidMinutesForFixedOfficeScheduleAttendance as jest.Mock).mockResolvedValue(420);

    const minutes = await getScheduledPaidMinutesForOfficeAttendance('employee-1');

    expect(getScheduledPaidMinutesForOfficeShiftAttendance).not.toHaveBeenCalled();
    expect(getScheduledPaidMinutesForFixedOfficeScheduleAttendance).toHaveBeenCalledWith(
      'employee-1',
      expect.any(Date),
      expect.objectContaining({ offDateKeys: expect.any(Set) })
    );
    expect(minutes).toBe(420);
  });

  test('returns zero paid minutes for explicit off-day overrides', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      department: null,
    });
    (resolveOfficeDayOverrideAnchorsForEmployee as jest.Mock).mockResolvedValue({
      businessDay: { dateKey: '2026-04-01' },
      currentDateKey: '2026-04-01',
      previousDateKey: '2026-03-31',
      currentOverride: { overrideType: 'off' },
      previousOverride: null,
    });
    (resolveOfficeShiftContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      shift: null,
      businessDay: { dateKey: '2026-04-01' },
      isWorkingDay: false,
      startMinutes: null,
      endMinutes: null,
      windowStart: null,
      windowEnd: null,
      isLate: false,
      isAfterEnd: false,
    });

    const minutes = await getScheduledPaidMinutesForOfficeAttendance('employee-1');

    expect(minutes).toBe(0);
    expect(getScheduledPaidMinutesForFixedOfficeScheduleAttendance).not.toHaveBeenCalled();
    expect(getScheduledPaidMinutesForOfficeShiftAttendance).not.toHaveBeenCalled();
  });

  test('uses employee default non-office mode when no shift override exists', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: true,
      department: null,
    });
    (resolveOfficeShiftContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      shift: null,
      isWorkingDay: false,
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'default',
      isWorkingDay: true,
    });

    const context = await resolveOfficeAttendanceContextForEmployee('employee-1');

    expect(context).toMatchObject({
      effectiveAttendanceMode: 'non_office',
      attendancePolicySource: 'employee_default',
    });
  });

  test('keeps no-office employees in non-office mode even when a shift override exists', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: null,
      fieldModeEnabled: false,
      department: null,
    });
    (resolveOfficeShiftContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      shift: { id: 'shift-1', attendanceMode: 'office_required' },
      isWorkingDay: true,
    });

    const context = await resolveOfficeAttendanceContextForEmployee('employee-1');

    expect(context).toMatchObject({
      effectiveAttendanceMode: 'non_office',
      attendancePolicySource: 'no_office_employee',
    });
  });

  test('returns holiday non-working context and bypasses shift/schedule resolution', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      department: 'Finance',
    });
    (resolveHolidayPolicyForEmployeeDate as jest.Mock).mockResolvedValue({
      entry: {
        id: 'holiday-1',
        title: 'National Holiday',
        type: 'holiday',
        isPaid: true,
        affectsAttendance: true,
        notificationRequired: false,
        scope: 'all',
        departmentKeys: [],
      },
      marksAsWorkingDay: false,
    });

    const context = await resolveOfficeAttendanceContextForEmployee('employee-1');

    expect(resolveOfficeShiftContextForEmployee).not.toHaveBeenCalled();
    expect(resolveOfficeWorkScheduleContextForEmployee).not.toHaveBeenCalled();
    expect(context).toMatchObject({
      source: 'holiday_calendar_off',
      isWorkingDay: false,
      holidayPolicy: {
        entry: {
          type: 'holiday',
        },
      },
    });
  });

  test('returns week-off non-working context and zero paid minutes', async () => {
    (prisma.employee.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        role: 'office',
        officeId: 'office-1',
        fieldModeEnabled: false,
        department: 'Finance',
      })
      .mockResolvedValueOnce({
        role: 'office',
      })
      .mockResolvedValueOnce({
        role: 'office',
        officeId: 'office-1',
        fieldModeEnabled: false,
        department: 'Finance',
      });
    (resolveHolidayPolicyForEmployeeDate as jest.Mock).mockResolvedValue({
      entry: {
        id: 'holiday-2',
        title: 'Team Week Off',
        type: 'week_off',
        isPaid: true,
        affectsAttendance: true,
        notificationRequired: false,
        scope: 'department',
        departmentKeys: ['finance'],
      },
      marksAsWorkingDay: false,
    });

    const context = await resolveOfficeAttendanceContextForEmployee('employee-1');
    const minutes = await getScheduledPaidMinutesForOfficeAttendance('employee-1');

    expect(context).toMatchObject({
      source: 'holiday_calendar_off',
      isWorkingDay: false,
      holidayPolicy: {
        entry: {
          type: 'week_off',
        },
      },
    });
    expect(minutes).toBe(0);
    expect(getScheduledPaidMinutesForOfficeShiftAttendance).not.toHaveBeenCalled();
    expect(getScheduledPaidMinutesForFixedOfficeScheduleAttendance).not.toHaveBeenCalled();
  });

  test('does not force non-working day for special working day entries', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      department: 'Finance',
    });
    (resolveHolidayPolicyForEmployeeDate as jest.Mock).mockResolvedValue({
      entry: {
        id: 'holiday-3',
        title: 'Special Working Saturday',
        type: 'special_working_day',
        isPaid: true,
        affectsAttendance: true,
        notificationRequired: false,
        scope: 'department',
        departmentKeys: ['finance'],
      },
      marksAsWorkingDay: true,
    });
    (resolveOfficeShiftContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      shift: null,
      isWorkingDay: false,
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'default',
      schedule: { id: 'schedule-1', name: 'Default Office Schedule' },
      isWorkingDay: true,
      windowStart: new Date('2026-04-01T00:00:00.000Z'),
      windowEnd: new Date('2026-04-01T09:00:00.000Z'),
    });

    const context = await resolveOfficeAttendanceContextForEmployee('employee-1');

    expect(resolveOfficeShiftContextForEmployee).toHaveBeenCalled();
    expect(resolveOfficeWorkScheduleContextForEmployee).toHaveBeenCalled();
    expect(context).toMatchObject({
      source: 'office_work_schedule',
      isWorkingDay: true,
      holidayPolicy: {
        entry: {
          type: 'special_working_day',
        },
      },
    });
  });

  test('keeps informational holidays in context without forcing a non-working day', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      department: 'Finance',
    });
    (resolveHolidayPolicyForEmployeeDate as jest.Mock).mockResolvedValue({
      entry: {
        id: 'holiday-4',
        title: 'Company Anniversary',
        type: 'holiday',
        isPaid: true,
        affectsAttendance: false,
        notificationRequired: true,
        scope: 'all',
        departmentKeys: [],
      },
      marksAsWorkingDay: false,
    });
    (resolveOfficeShiftContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'office_shift',
      shift: null,
      isWorkingDay: false,
    });
    (resolveOfficeWorkScheduleContextForEmployee as jest.Mock).mockResolvedValue({
      source: 'default',
      schedule: { id: 'schedule-1', name: 'Default Office Schedule' },
      isWorkingDay: true,
      windowStart: new Date('2026-04-01T00:00:00.000Z'),
      windowEnd: new Date('2026-04-01T09:00:00.000Z'),
    });

    const context = await resolveOfficeAttendanceContextForEmployee('employee-1');

    expect(resolveOfficeShiftContextForEmployee).toHaveBeenCalled();
    expect(resolveOfficeWorkScheduleContextForEmployee).toHaveBeenCalled();
    expect(context).toMatchObject({
      source: 'office_work_schedule',
      isWorkingDay: true,
      holidayPolicy: {
        entry: {
          type: 'holiday',
          affectsAttendance: false,
          notificationRequired: true,
        },
      },
    });
  });
});
