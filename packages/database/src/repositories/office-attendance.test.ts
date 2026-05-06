import { Prisma } from '@prisma/client';
import { finalizeOfficeDailyAbsences, recordOfficeAttendance } from './office-attendance';
import { db as prisma } from '../prisma/client';
import { getSystemSetting } from './settings';
import { resolveOfficeAttendanceContextForEmployee } from './office-attendance-context';
import { getOfficeDayOverrideAnchorDates, resolveOfficeDayOverrideAnchorsForEmployee } from './office-day-overrides';

jest.mock('../prisma/client', () => ({
  db: {
    employee: {
      findMany: jest.fn(),
    },
    officeShift: {
      findFirst: jest.fn(),
    },
    employeeLeaveRequest: {
      findFirst: jest.fn(),
    },
    officeAttendance: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('./settings', () => ({
  getSystemSetting: jest.fn(),
}));

jest.mock('./office-attendance-context', () => ({
  resolveOfficeAttendanceContextForEmployee: jest.fn(),
}));

jest.mock('./office-day-overrides', () => ({
  getOfficeDayOverrideAnchorDates: jest.fn(),
  resolveOfficeDayOverrideAnchorsForEmployee: jest.fn(),
}));

describe('office attendance repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a new office attendance record when no conflict exists', async () => {
    (prisma.officeAttendance.create as jest.Mock).mockResolvedValue({
      id: 'attendance-1',
      officeShiftId: 'shift-1',
      status: 'present',
    });

    const result = await recordOfficeAttendance({
      officeId: 'office-1',
      officeShiftId: 'shift-1',
      employeeId: 'employee-1',
      status: 'present',
    });

    expect(result).toMatchObject({
      created: true,
      attendance: {
        id: 'attendance-1',
      },
    });
    expect(prisma.officeAttendance.findFirst).not.toHaveBeenCalled();
  });

  test('returns existing record when unique conflict happens for the same shift and status', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.4.0',
    });

    (prisma.officeAttendance.create as jest.Mock).mockRejectedValue(conflict);
    (prisma.officeAttendance.findFirst as jest.Mock).mockResolvedValue({
      id: 'attendance-existing',
      officeShiftId: 'shift-1',
      status: 'present',
    });

    const result = await recordOfficeAttendance({
      officeId: 'office-1',
      officeShiftId: 'shift-1',
      employeeId: 'employee-1',
      status: 'present',
    });

    expect(prisma.officeAttendance.findFirst).toHaveBeenCalledWith({
      where: {
        officeShiftId: 'shift-1',
        status: 'present',
      },
      orderBy: {
        recordedAt: 'asc',
      },
    });
    expect(result).toMatchObject({
      created: false,
      attendance: {
        id: 'attendance-existing',
      },
    });
  });

  test('rethrows conflict when no existing record can be loaded', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.4.0',
    });

    (prisma.officeAttendance.create as jest.Mock).mockRejectedValue(conflict);
    (prisma.officeAttendance.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      recordOfficeAttendance({
        officeId: 'office-1',
        officeShiftId: 'shift-1',
        employeeId: 'employee-1',
        status: 'present',
      })
    ).rejects.toThrow('Unique constraint failed');
  });

  test('finalizeOfficeDailyAbsences creates absent for normal ended working day without blockers and approved leave', async () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '1' });
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([{ id: 'employee-1' }]);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: true,
      businessDay: { dateKey: '2026-05-05' },
    });
    (getOfficeDayOverrideAnchorDates as jest.Mock).mockReturnValue({ currentDateKey: '2026-05-05' });
    (prisma.officeAttendance.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.employeeLeaveRequest.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.officeAttendance.create as jest.Mock).mockResolvedValue({ id: 'absence-1' });

    const result = await finalizeOfficeDailyAbsences(now);

    expect(result).toEqual({ created: 1 });
    expect(prisma.officeAttendance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'employee-1',
        status: 'absent',
      }),
    });
  });

  test('finalizeOfficeDailyAbsences skips absent when approved leave exists', async () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '1' });
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([{ id: 'employee-1' }]);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: true,
      businessDay: { dateKey: '2026-05-05' },
    });
    (getOfficeDayOverrideAnchorDates as jest.Mock).mockReturnValue({ currentDateKey: '2026-05-05' });
    (prisma.officeAttendance.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.employeeLeaveRequest.findFirst as jest.Mock).mockResolvedValue({ id: 'leave-1' });

    const result = await finalizeOfficeDailyAbsences(now);

    expect(result).toEqual({ created: 0 });
    expect(prisma.officeAttendance.create).not.toHaveBeenCalled();
  });

  test('finalizeOfficeDailyAbsences uses shift-override fallback when ended shift exists', async () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '1' });
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([{ id: 'employee-1' }]);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: false,
      isAfterEnd: false,
      businessDay: null,
    });
    (getOfficeDayOverrideAnchorDates as jest.Mock).mockReturnValue({ currentDateKey: '2026-05-05' });
    (resolveOfficeDayOverrideAnchorsForEmployee as jest.Mock).mockResolvedValue({
      currentOverride: { overrideType: 'shift_override' },
    });
    (prisma.officeShift.findFirst as jest.Mock).mockResolvedValue({ id: 'shift-1' });
    (prisma.officeAttendance.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.employeeLeaveRequest.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.officeAttendance.create as jest.Mock).mockResolvedValue({ id: 'absence-1' });

    const result = await finalizeOfficeDailyAbsences(now);

    expect(result).toEqual({ created: 1 });
    expect(prisma.officeShift.findFirst).toHaveBeenCalled();
    expect(prisma.officeAttendance.create).toHaveBeenCalled();
  });

  test('finalizeOfficeDailyAbsences does not use shift-override fallback when no ended shift exists', async () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '1' });
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([{ id: 'employee-1' }]);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: false,
      isAfterEnd: false,
      businessDay: null,
    });
    (getOfficeDayOverrideAnchorDates as jest.Mock).mockReturnValue({ currentDateKey: '2026-05-05' });
    (resolveOfficeDayOverrideAnchorsForEmployee as jest.Mock).mockResolvedValue({
      currentOverride: { overrideType: 'shift_override' },
    });
    (prisma.officeShift.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await finalizeOfficeDailyAbsences(now);

    expect(result).toEqual({ created: 0 });
    expect(prisma.officeAttendance.create).not.toHaveBeenCalled();
  });

  test('finalizeOfficeDailyAbsences keeps pending_leave when leave effects are enabled', async () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '1' });
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([{ id: 'employee-1' }]);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({
      isWorkingDay: true,
      isAfterEnd: true,
      businessDay: { dateKey: '2026-05-05' },
    });
    (getOfficeDayOverrideAnchorDates as jest.Mock).mockReturnValue({ currentDateKey: '2026-05-05' });
    (prisma.officeAttendance.findFirst as jest.Mock).mockResolvedValue({ id: 'attendance-pending-leave' });

    const result = await finalizeOfficeDailyAbsences(now);

    expect(result).toEqual({ created: 0 });
    expect(prisma.officeAttendance.create).not.toHaveBeenCalled();
    expect(prisma.officeAttendance.update).not.toHaveBeenCalled();
  });
});
