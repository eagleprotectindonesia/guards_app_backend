import { Prisma } from '@prisma/client';
import {
  finalizeOfficeDailyAbsences,
  getOfficeAbsentCountForDate,
  getOfficeLateCountForDate,
  getOfficePresentCountForDate,
  getOnsiteAbsentCountForDate,
  getOnsiteLateCountForDate,
  getOnsitePresentCountForDate,
  recordOfficeAttendance,
  resolveCancelledPendingLeaveStatuses,
  resolveRejectedPendingLeaveStatuses,
} from './office-attendance';
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
      count: jest.fn(),
    },
    shift: {
      count: jest.fn(),
    },
    employeeLeaveRequest: {
      findFirst: jest.fn(),
    },
    officeAttendance: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
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

  test('resolveRejectedPendingLeaveStatuses updates past pending leave to absent with rejected note', async () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    (prisma.officeAttendance.findMany as jest.Mock).mockResolvedValue([
      { id: 'pending-1', recordedAt: new Date('2026-05-04T00:00:00.000Z') },
    ]);

    await resolveRejectedPendingLeaveStatuses({
      employeeId: 'employee-1',
      dateKeys: ['2026-05-04'],
      now,
    });

    expect(prisma.officeAttendance.update).toHaveBeenCalledWith({
      where: { id: 'pending-1' },
      data: { status: 'absent', metadata: { note: 'Rejected leave converted to absent' } },
    });
  });

  test('resolveCancelledPendingLeaveStatuses updates past pending leave to absent with cancelled note', async () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    (prisma.officeAttendance.findMany as jest.Mock).mockResolvedValue([
      { id: 'pending-1', recordedAt: new Date('2026-05-04T00:00:00.000Z') },
    ]);

    await resolveCancelledPendingLeaveStatuses({
      employeeId: 'employee-1',
      dateKeys: ['2026-05-04'],
      now,
    });

    expect(prisma.officeAttendance.update).toHaveBeenCalledWith({
      where: { id: 'pending-1' },
      data: { status: 'absent', metadata: { note: 'Cancelled leave converted to absent' } },
    });
  });

  test('resolveCancelledPendingLeaveStatuses deletes future pending leave rows', async () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    (prisma.officeAttendance.findMany as jest.Mock).mockResolvedValue([
      { id: 'pending-1', recordedAt: new Date('2026-05-06T00:00:00.000Z') },
      { id: 'pending-2', recordedAt: new Date('2026-05-06T01:00:00.000Z') },
    ]);

    await resolveCancelledPendingLeaveStatuses({
      employeeId: 'employee-1',
      dateKeys: ['2026-05-06'],
      now,
    });

    expect(prisma.officeAttendance.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['pending-1', 'pending-2'] } },
    });
    expect(prisma.officeAttendance.update).not.toHaveBeenCalled();
  });

  test('resolveCancelledPendingLeaveStatuses deletes same-day pending leave before end of attendance window', async () => {
    const now = new Date('2026-05-05T02:00:00.000Z');
    (prisma.officeAttendance.findMany as jest.Mock).mockResolvedValue([{ id: 'pending-1' }]);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({ isAfterEnd: false });

    await resolveCancelledPendingLeaveStatuses({
      employeeId: 'employee-1',
      dateKeys: ['2026-05-05'],
      now,
    });

    expect(prisma.officeAttendance.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['pending-1'] } },
    });
    expect(prisma.officeAttendance.update).not.toHaveBeenCalled();
  });

  test('resolveRejectedPendingLeaveStatuses converts same-day pending leave after end of attendance window', async () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    (prisma.officeAttendance.findMany as jest.Mock).mockResolvedValue([{ id: 'pending-1' }]);
    (resolveOfficeAttendanceContextForEmployee as jest.Mock).mockResolvedValue({ isAfterEnd: true });

    await resolveRejectedPendingLeaveStatuses({
      employeeId: 'employee-1',
      dateKeys: ['2026-05-05'],
      now,
    });

    expect(prisma.officeAttendance.update).toHaveBeenCalledWith({
      where: { id: 'pending-1' },
      data: { status: 'absent', metadata: { note: 'Rejected leave converted to absent' } },
    });
  });

  describe('shift-anchored count functions', () => {
    const today = new Date('2026-06-26T10:00:00.000Z');

    describe('office functions', () => {
      beforeEach(() => {
        (prisma.officeShift.count as jest.Mock).mockResolvedValue(3);
      });

      test('getOfficePresentCountForDate queries officeShift.count with attended statuses', async () => {
        const result = await getOfficePresentCountForDate(today);
        expect(result).toBe(3);
        expect(prisma.officeShift.count).toHaveBeenCalledWith({
          where: {
            deletedAt: null,
            status: { not: 'cancelled' },
            date: expect.any(Date),
            officeAttendances: { some: { status: { in: ['present', 'late', 'clocked_out'] } } },
          },
        });
      });

      test('getOfficeLateCountForDate queries officeShift.count with single late status', async () => {
        const result = await getOfficeLateCountForDate(today);
        expect(result).toBe(3);
        expect(prisma.officeShift.count).toHaveBeenCalledWith({
          where: {
            deletedAt: null,
            status: { not: 'cancelled' },
            date: expect.any(Date),
            officeAttendances: { some: { status: 'late' } },
          },
        });
      });

      test('getOfficeAbsentCountForDate queries officeShift.count with single absent status', async () => {
        const result = await getOfficeAbsentCountForDate(today);
        expect(result).toBe(3);
        expect(prisma.officeShift.count).toHaveBeenCalledWith({
          where: {
            deletedAt: null,
            status: { not: 'cancelled' },
            date: expect.any(Date),
            officeAttendances: { some: { status: 'absent' } },
          },
        });
      });
    });

    describe('onsite functions', () => {
      beforeEach(() => {
        (prisma.shift.count as jest.Mock).mockResolvedValue(7);
      });

      test('getOnsitePresentCountForDate queries shift.count with attended statuses and role filter', async () => {
        const result = await getOnsitePresentCountForDate(today);
        expect(result).toBe(7);
        expect(prisma.shift.count).toHaveBeenCalledWith({
          where: {
            deletedAt: null,
            employeeId: { not: null },
            status: { not: 'cancelled' },
            date: expect.any(Date),
            employee: { role: 'on_site' },
            attendance: { is: { status: { in: ['present', 'late', 'clocked_out'] } } },
          },
        });
      });

      test('getOnsiteLateCountForDate queries shift.count with single late status', async () => {
        const result = await getOnsiteLateCountForDate(today);
        expect(result).toBe(7);
        expect(prisma.shift.count).toHaveBeenCalledWith({
          where: {
            deletedAt: null,
            employeeId: { not: null },
            status: { not: 'cancelled' },
            date: expect.any(Date),
            employee: { role: 'on_site' },
            attendance: { is: { status: 'late' } },
          },
        });
      });

      test('getOnsiteAbsentCountForDate queries shift.count with single absent status', async () => {
        const result = await getOnsiteAbsentCountForDate(today);
        expect(result).toBe(7);
        expect(prisma.shift.count).toHaveBeenCalledWith({
          where: {
            deletedAt: null,
            employeeId: { not: null },
            status: { not: 'cancelled' },
            date: expect.any(Date),
            employee: { role: 'on_site' },
            attendance: { is: { status: 'absent' } },
          },
        });
      });
    });

    describe('WITA boundary', () => {
      test('date at 17:00 UTC (01:00 next day WITA) filters by next-day date', async () => {
        (prisma.shift.count as jest.Mock).mockResolvedValue(2);
        const witaNextDay = new Date('2026-06-26T17:00:00.000Z');

        await getOnsitePresentCountForDate(witaNextDay);

        const where = (prisma.shift.count as jest.Mock).mock.calls[0][0].where;
        const dateKey = where.date.toISOString().slice(0, 10);
        expect(dateKey).toBe('2026-06-27');
      });

      test('date at 03:00 UTC (11:00 same day WITA) filters by same-day date', async () => {
        (prisma.shift.count as jest.Mock).mockResolvedValue(2);
        const witaSameDay = new Date('2026-06-26T03:00:00.000Z');

        await getOnsitePresentCountForDate(witaSameDay);

        const where = (prisma.shift.count as jest.Mock).mock.calls[0][0].where;
        const dateKey = where.date.toISOString().slice(0, 10);
        expect(dateKey).toBe('2026-06-26');
      });

      test('WITA boundary holds for both office and onsite functions', async () => {
        (prisma.officeShift.count as jest.Mock).mockResolvedValue(1);
        const witaNextDay = new Date('2026-06-26T17:00:00.000Z');

        await getOfficePresentCountForDate(witaNextDay);

        const where = (prisma.officeShift.count as jest.Mock).mock.calls[0][0].where;
        const dateKey = where.date.toISOString().slice(0, 10);
        expect(dateKey).toBe('2026-06-27');
      });
    });
  });
});
