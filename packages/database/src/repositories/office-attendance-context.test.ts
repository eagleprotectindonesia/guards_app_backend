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
  });

  test('prefers office shift context even when employee mode is fixed schedule', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
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
});
