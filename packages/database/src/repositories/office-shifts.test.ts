import {
  bulkCreateOfficeShiftsWithChangelog,
  createOfficeShiftWithChangelog,
  findRelevantOfficeShiftForEmployee,
  resolveOfficeShiftContextForEmployee,
  updateOfficeShiftWithChangelog,
  replaceOfficeShiftGuard,
  swapOfficeShifts,
  bulkSwapReplaceOfficeShifts,
  getLatestSwapReplacementChangelogByOfficeShiftIds,
} from './office-shifts';
import { db as prisma } from '../prisma/client';
import { redis } from '../redis/client';
import { reconcileApprovedOfficeLeavesForCoverage } from './office-leave-reconciliation';
import {
  deleteEmployeeOfficeDayOverridesByEmployeeAndDates,
  upsertEmployeeOfficeDayOverride,
} from './office-day-overrides';

jest.mock('../prisma/client', () => ({
  db: {
    employee: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    officeShift: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      createManyAndReturn: jest.fn(),
    },
    changelog: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    employeeOfficeDayOverride: {
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

jest.mock('../redis/client', () => ({
  redis: {
    xadd: jest.fn().mockResolvedValue('1-0'),
    publish: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('./office-leave-reconciliation', () => ({
  reconcileApprovedOfficeLeavesForCoverage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./office-day-overrides', () => ({
  deleteEmployeeOfficeDayOverridesByEmployeeAndDates: jest.fn().mockResolvedValue(0),
  upsertEmployeeOfficeDayOverride: jest.fn().mockResolvedValue({}),
}));

describe('office shifts repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.changelog.create as jest.Mock).mockResolvedValue({});
    (prisma.changelog.createMany as jest.Mock).mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(async callback => callback(prisma));
  });

  test('creates an office shift with inherited attendance mode by default', async () => {
    (prisma.officeShift.create as jest.Mock).mockResolvedValue({
      id: 'shift-1',
      officeShiftTypeId: 'type-1',
      officeShiftType: { id: 'type-1', name: 'Morning' },
      employeeId: 'employee-1',
      employee: { id: 'employee-1', fullName: 'Alice', office: { name: 'HQ' } },
      date: new Date('2026-04-10T00:00:00.000Z'),
      startsAt: new Date('2026-04-10T08:00:00.000Z'),
      endsAt: new Date('2026-04-10T17:00:00.000Z'),
      status: 'scheduled',
      note: null,
      attendanceMode: null,
    });

    const created = await createOfficeShiftWithChangelog(
      {
        officeShiftType: { connect: { id: 'type-1' } },
        employee: { connect: { id: 'employee-1' } },
        date: new Date('2026-04-10T00:00:00.000Z'),
        startsAt: new Date('2026-04-10T08:00:00.000Z'),
        endsAt: new Date('2026-04-10T17:00:00.000Z'),
        status: 'scheduled',
        note: null,
      },
      'admin-1'
    );

    expect(prisma.employee.findUnique).not.toHaveBeenCalled();
    expect(prisma.officeShift.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdBy: { connect: { id: 'admin-1' } },
          lastUpdatedBy: { connect: { id: 'admin-1' } },
        }),
      })
    );
    expect(created.attendanceMode).toBeNull();
  });

  test('rejects an explicit attendance override for employees without an assigned office', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      officeId: null,
    });

    await expect(
      createOfficeShiftWithChangelog(
        {
          officeShiftType: { connect: { id: 'type-1' } },
          employee: { connect: { id: 'employee-1' } },
          date: new Date('2026-04-10T00:00:00.000Z'),
          startsAt: new Date('2026-04-10T08:00:00.000Z'),
          endsAt: new Date('2026-04-10T17:00:00.000Z'),
          status: 'scheduled',
          attendanceMode: 'office_required',
        },
        'admin-1'
      )
    ).rejects.toThrow('Shift attendance mode override can only be set for office employees with an assigned office.');
  });

  test('tracks attendance mode changes when updating an office shift', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      officeId: 'office-1',
    });
    (prisma.officeShift.findUnique as jest.Mock).mockResolvedValue({
      id: 'shift-1',
      officeShiftTypeId: 'type-1',
      officeShiftType: { id: 'type-1', name: 'Morning' },
      employeeId: 'employee-1',
      employee: { id: 'employee-1', fullName: 'Alice' },
      date: new Date('2026-04-10T00:00:00.000Z'),
      startsAt: new Date('2026-04-10T08:00:00.000Z'),
      endsAt: new Date('2026-04-10T17:00:00.000Z'),
      status: 'scheduled',
      note: null,
      attendanceMode: null,
    });
    (prisma.officeShift.update as jest.Mock).mockResolvedValue({
      id: 'shift-1',
      officeShiftTypeId: 'type-1',
      officeShiftType: { id: 'type-1', name: 'Morning' },
      employeeId: 'employee-1',
      employee: { id: 'employee-1', fullName: 'Alice' },
      date: new Date('2026-04-10T00:00:00.000Z'),
      startsAt: new Date('2026-04-10T08:00:00.000Z'),
      endsAt: new Date('2026-04-10T17:00:00.000Z'),
      status: 'scheduled',
      note: null,
      attendanceMode: 'non_office',
    });

    await updateOfficeShiftWithChangelog(
      'shift-1',
      {
        attendanceMode: 'non_office',
      },
      'admin-1'
    );

    expect(prisma.changelog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            attendanceMode: 'non_office',
            changes: expect.objectContaining({
              attendanceMode: {
                from: null,
                to: 'non_office',
              },
            }),
          }),
        }),
      })
    );
  });

  test('rejects bulk creation with explicit overrides for employees without an assigned office', async () => {
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([
      { id: 'employee-1', officeId: null },
    ]);

    await expect(
      bulkCreateOfficeShiftsWithChangelog(
        [
          {
            officeShiftTypeId: 'type-1',
            employeeId: 'employee-1',
            date: new Date('2026-04-10T00:00:00.000Z'),
            startsAt: new Date('2026-04-10T08:00:00.000Z'),
            endsAt: new Date('2026-04-10T17:00:00.000Z'),
            status: 'scheduled',
            attendanceMode: 'office_required',
          },
        ],
        'admin-1'
      )
    ).rejects.toThrow('Shift attendance mode override can only be set for office employees with an assigned office.');
  });
});

describe('office shifts resolver boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('treats shift start boundary as active', async () => {
    const shift = {
      id: 'shift-start-boundary',
      date: new Date('2026-04-01T00:00:00.000Z'),
      startsAt: new Date('2026-04-01T16:00:00.000Z'),
      endsAt: new Date('2026-04-02T00:00:00.000Z'),
      status: 'scheduled',
      deletedAt: null,
      officeShiftType: { id: 'type-1', name: 'Evening' },
    };
    const at = new Date('2026-04-01T16:00:00.000Z');
    (prisma.officeShift.findMany as jest.Mock).mockResolvedValue([shift]);

    const result = await findRelevantOfficeShiftForEmployee('employee-1', at);

    expect(result.shift?.id).toBe('shift-start-boundary');
  });

  test('sets exact-start context flags without marking employee late', async () => {
    const shift = {
      id: 'shift-start-context',
      date: new Date('2026-04-01T00:00:00.000Z'),
      startsAt: new Date('2026-04-01T16:00:00.000Z'),
      endsAt: new Date('2026-04-02T00:00:00.000Z'),
      status: 'scheduled',
      deletedAt: null,
      officeShiftType: { id: 'type-1', name: 'Evening' },
    };
    (prisma.officeShift.findMany as jest.Mock).mockResolvedValue([shift]);

    const context = await resolveOfficeShiftContextForEmployee('employee-1', new Date('2026-04-01T16:00:00.000Z'));

    expect(context.shift?.id).toBe('shift-start-context');
    expect(context.isWorkingDay).toBe(true);
    expect(context.isLate).toBe(false);
    expect(context.isAfterEnd).toBe(false);
  });

  test('treats shift end boundary as active and flips after one millisecond', async () => {
    const endingShift = {
      id: 'shift-ending-now',
      date: new Date('2026-04-01T00:00:00.000Z'),
      startsAt: new Date('2026-04-01T16:00:00.000Z'),
      endsAt: new Date('2026-04-02T00:00:00.000Z'),
      status: 'scheduled',
      deletedAt: null,
      officeShiftType: { id: 'type-1', name: 'Evening' },
    };
    const upcomingShift = {
      id: 'shift-upcoming',
      date: new Date('2026-04-02T00:00:00.000Z'),
      startsAt: new Date('2026-04-02T08:00:00.000Z'),
      endsAt: new Date('2026-04-02T16:00:00.000Z'),
      status: 'scheduled',
      deletedAt: null,
      officeShiftType: { id: 'type-2', name: 'Morning' },
    };
    (prisma.officeShift.findMany as jest.Mock).mockResolvedValue([endingShift, upcomingShift]);

    const atExactEnd = await findRelevantOfficeShiftForEmployee('employee-1', new Date('2026-04-02T00:00:00.000Z'));
    const justAfterEnd = await findRelevantOfficeShiftForEmployee('employee-1', new Date('2026-04-02T00:00:00.001Z'));

    expect(atExactEnd.shift?.id).toBe('shift-ending-now');
    expect(justAfterEnd.shift?.id).toBe('shift-upcoming');
  });

  test('keeps overnight shift active exactly at midnight and resolves metadata', async () => {
    const overnightShift = {
      id: 'shift-overnight-midnight',
      date: new Date('2026-04-01T00:00:00.000Z'),
      startsAt: new Date('2026-04-01T16:00:00.000Z'),
      endsAt: new Date('2026-04-02T00:00:00.000Z'),
      status: 'scheduled',
      deletedAt: null,
      officeShiftType: { id: 'type-1', name: 'Evening' },
    };
    (prisma.officeShift.findMany as jest.Mock).mockResolvedValue([overnightShift]);

    const contextAtMidnight = await resolveOfficeShiftContextForEmployee('employee-1', new Date('2026-04-02T00:00:00.000Z'));
    const contextAfterMidnight = await resolveOfficeShiftContextForEmployee('employee-1', new Date('2026-04-02T00:00:00.001Z'));

    expect(contextAtMidnight.shift?.id).toBe('shift-overnight-midnight');
    expect(contextAtMidnight.windowStart?.toISOString()).toBe('2026-04-01T16:00:00.000Z');
    expect(contextAtMidnight.windowEnd?.toISOString()).toBe('2026-04-02T00:00:00.000Z');
    expect(contextAtMidnight.isLate).toBe(true);
    expect(contextAtMidnight.isAfterEnd).toBe(false);
    expect(contextAfterMidnight.shift).toBeNull();
    expect(contextAfterMidnight.isAfterEnd).toBe(false);
  });

  test('resolves correct shift for two shifts in the same calendar day', async () => {
    const midnightShift = {
      id: 'shift-00-08',
      date: new Date('2026-04-02T00:00:00.000Z'),
      startsAt: new Date('2026-04-02T00:00:00.000Z'),
      endsAt: new Date('2026-04-02T08:00:00.000Z'),
      status: 'scheduled',
      deletedAt: null,
      officeShiftType: { id: 'type-early', name: 'Early' },
    };
    const eveningShift = {
      id: 'shift-16-00',
      date: new Date('2026-04-02T00:00:00.000Z'),
      startsAt: new Date('2026-04-02T16:00:00.000Z'),
      endsAt: new Date('2026-04-03T00:00:00.000Z'),
      status: 'scheduled',
      deletedAt: null,
      officeShiftType: { id: 'type-evening', name: 'Evening' },
    };
    (prisma.officeShift.findMany as jest.Mock).mockResolvedValue([midnightShift, eveningShift]);

    const at0600 = await findRelevantOfficeShiftForEmployee('employee-1', new Date('2026-04-02T06:00:00.000Z'));
    const at1200 = await findRelevantOfficeShiftForEmployee('employee-1', new Date('2026-04-02T12:00:00.000Z'));
    const at1700 = await findRelevantOfficeShiftForEmployee('employee-1', new Date('2026-04-02T17:00:00.000Z'));

    expect(at0600.shift?.id).toBe('shift-00-08');
    expect(at1200.shift?.id).toBe('shift-16-00');
    expect(at1700.shift?.id).toBe('shift-16-00');
  });

  test('filters relevant shifts by allowedDateKeys', async () => {
    const disallowedShift = {
      id: 'shift-disallowed-2026-04-02',
      date: new Date('2026-04-02T00:00:00.000Z'),
      startsAt: new Date('2026-04-01T23:00:00.000Z'),
      endsAt: new Date('2026-04-02T07:00:00.000Z'),
      status: 'scheduled',
      deletedAt: null,
      officeShiftType: { id: 'type-1', name: 'Overnight' },
    };
    const allowedShift = {
      id: 'shift-allowed-2026-04-01',
      date: new Date('2026-04-01T00:00:00.000Z'),
      startsAt: new Date('2026-04-01T20:00:00.000Z'),
      endsAt: new Date('2026-04-02T04:00:00.000Z'),
      status: 'scheduled',
      deletedAt: null,
      officeShiftType: { id: 'type-2', name: 'Evening' },
    };
    (prisma.officeShift.findMany as jest.Mock).mockResolvedValue([disallowedShift, allowedShift]);

    const result = await findRelevantOfficeShiftForEmployee('employee-1', new Date('2026-04-01T22:00:00.000Z'), {
      allowedDateKeys: new Set(['2026-04-01']),
    });

    expect(result.shift?.id).toBe('shift-allowed-2026-04-01');
  });

  test('returns null shift when allowedDateKeys is empty', async () => {
    const shiftA = {
      id: 'shift-a',
      date: new Date('2026-04-01T00:00:00.000Z'),
      startsAt: new Date('2026-04-01T20:00:00.000Z'),
      endsAt: new Date('2026-04-02T04:00:00.000Z'),
      status: 'scheduled',
      deletedAt: null,
      officeShiftType: { id: 'type-a', name: 'A' },
    };
    const shiftB = {
      id: 'shift-b',
      date: new Date('2026-04-02T00:00:00.000Z'),
      startsAt: new Date('2026-04-02T10:00:00.000Z'),
      endsAt: new Date('2026-04-02T18:00:00.000Z'),
      status: 'scheduled',
      deletedAt: null,
      officeShiftType: { id: 'type-b', name: 'B' },
    };
    (prisma.officeShift.findMany as jest.Mock).mockResolvedValue([shiftA, shiftB]);

    const result = await findRelevantOfficeShiftForEmployee('employee-1', new Date('2026-04-01T22:00:00.000Z'), {
      allowedDateKeys: new Set(),
    });

    expect(result.shift).toBeNull();
  });
});

describe('office shift replace / swap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.changelog.create as jest.Mock).mockResolvedValue({});
    (prisma.changelog.createMany as jest.Mock).mockResolvedValue({});
    (prisma.changelog.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => callback(prisma));
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    (redis.xadd as jest.Mock).mockResolvedValue('1-0');
    (redis.publish as jest.Mock).mockResolvedValue(1);
    (reconcileApprovedOfficeLeavesForCoverage as jest.Mock).mockResolvedValue(undefined);
    (deleteEmployeeOfficeDayOverridesByEmployeeAndDates as jest.Mock).mockResolvedValue(0);
    (upsertEmployeeOfficeDayOverride as jest.Mock).mockResolvedValue({});
  });

  const baseShift = {
    id: 'shift-a',
    officeShiftTypeId: 'type-1',
    officeShiftType: { id: 'type-1', name: 'Morning' },
    employeeId: 'employee-1',
    employee: { id: 'employee-1', fullName: 'Alice', employeeNumber: 'E1', office: { name: 'HQ' } },
    date: new Date('2026-04-10T00:00:00.000Z'),
    startsAt: new Date('2026-04-10T08:00:00.000Z'),
    endsAt: new Date('2026-04-10T17:00:00.000Z'),
    status: 'scheduled' as const,
    note: 'original note',
    attendanceMode: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
  };

  const replacedShift = {
    ...baseShift,
    employeeId: 'employee-2',
    employee: { id: 'employee-2', fullName: 'Bob', employeeNumber: 'E2', office: { name: 'HQ' } },
    note: '[Replaced on 2026-04-01T00:00:00.000Z]: Sick\n\noriginal note',
  };

  test('replaceOfficeShiftGuard reassigns the employee and writes a REPLACEMENT changelog', async () => {
    (prisma.officeShift.findUnique as jest.Mock).mockResolvedValue(baseShift);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      id: 'employee-2',
      role: 'office',
      status: true,
      fullName: 'Bob',
      employeeNumber: 'E2',
    });
    (prisma.officeShift.update as jest.Mock).mockResolvedValue(replacedShift);

    await replaceOfficeShiftGuard(
      {
        officeShiftId: 'shift-a',
        replacementEmployeeId: 'employee-2',
        reason: 'Sick',
        notes: 'cover for sick leave',
      },
      'admin-1'
    );

    expect(prisma.officeShift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'shift-a', deletedAt: null },
        data: expect.objectContaining({ employee: { connect: { id: 'employee-2' } } }),
      })
    );
    // shift_override day override re-pointed from old owner to new owner
    expect(deleteEmployeeOfficeDayOverridesByEmployeeAndDates).toHaveBeenCalledWith(
      'employee-1',
      ['2026-04-10'],
      'admin-1',
      prisma,
      true,
      ['shift_override']
    );
    expect(upsertEmployeeOfficeDayOverride).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'employee-2', date: '2026-04-10', overrideType: 'shift_override' }),
      prisma
    );
    expect(prisma.changelog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'OfficeShift',
          action: 'UPDATE',
          details: expect.objectContaining({
            method: 'REPLACEMENT',
            previousEmployeeId: 'employee-1',
            previousEmployeeName: 'Alice',
            replacementReason: 'Sick',
            changes: expect.objectContaining({
              employeeId: { from: 'employee-1', to: 'employee-2' },
            }),
          }),
        }),
      })
    );
    expect(redis.publish).toHaveBeenCalledWith('events:shifts', expect.stringContaining('OFFICE_SHIFT_REPLACED'));
  });

  test('replaceOfficeShiftGuard rejects forbidden status', async () => {
    (prisma.officeShift.findUnique as jest.Mock).mockResolvedValue({ ...baseShift, status: 'completed' as const });

    await expect(
      replaceOfficeShiftGuard(
        { officeShiftId: 'shift-a', replacementEmployeeId: 'employee-2', reason: 'Sick' },
        'admin-1'
      )
    ).rejects.toThrow('Only scheduled or in-progress office shifts can be replaced');
  });

  test('replaceOfficeShiftGuard rejects same employee', async () => {
    (prisma.officeShift.findUnique as jest.Mock).mockResolvedValue(baseShift);

    await expect(
      replaceOfficeShiftGuard(
        { officeShiftId: 'shift-a', replacementEmployeeId: 'employee-1', reason: 'Sick' },
        'admin-1'
      )
    ).rejects.toThrow('Replacement employee must be different from the current employee');
  });

  test('swapOfficeShifts exchanges employees and writes two SWAP changelogs', async () => {
    const shiftA = { ...baseShift, id: 'shift-a' };
    const shiftB = {
      ...baseShift,
      id: 'shift-b',
      date: new Date('2026-04-11T00:00:00.000Z'),
      startsAt: new Date('2026-04-11T08:00:00.000Z'),
      endsAt: new Date('2026-04-11T17:00:00.000Z'),
      employeeId: 'employee-2',
      employee: { id: 'employee-2', fullName: 'Bob', employeeNumber: 'E2', office: { name: 'HQ' } },
    };
    (prisma.officeShift.findUnique as jest.Mock)
      .mockResolvedValueOnce(shiftA)
      .mockResolvedValueOnce(shiftB);
    (prisma.officeShift.update as jest.Mock)
      .mockResolvedValueOnce({ ...shiftA, employeeId: 'employee-2', employee: shiftB.employee, note: '[Swap on x]: Sick' })
      .mockResolvedValueOnce({ ...shiftB, employeeId: 'employee-1', employee: shiftA.employee, note: '[Swap on x]: Sick' });

    await swapOfficeShifts(
      { officeShiftAId: 'shift-a', officeShiftBId: 'shift-b', reason: 'Sick' },
      'admin-1'
    );

    expect(prisma.officeShift.update).toHaveBeenCalledTimes(2);
    expect(upsertEmployeeOfficeDayOverride).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'employee-2', date: '2026-04-10' }),
      prisma
    );
    expect(upsertEmployeeOfficeDayOverride).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'employee-1', date: '2026-04-11' }),
      prisma
    );
    expect(prisma.changelog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            entityType: 'OfficeShift',
            details: expect.objectContaining({ method: 'SWAP', swapPairShiftId: 'shift-b' }),
          }),
          expect.objectContaining({
            entityType: 'OfficeShift',
            details: expect.objectContaining({ method: 'SWAP', swapPairShiftId: 'shift-a' }),
          }),
        ]),
      })
    );
    expect(redis.publish).toHaveBeenCalledWith('events:shifts', expect.stringContaining('OFFICE_SHIFT_SWAPPED'));
  });

  test('swapOfficeShifts rejects swapping a shift with itself', async () => {
    await expect(
      swapOfficeShifts({ officeShiftAId: 'shift-a', officeShiftBId: 'shift-a', reason: 'Sick' }, 'admin-1')
    ).rejects.toThrow('Cannot swap an office shift with itself');
  });

  test('getLatestSwapReplacementChangelogByOfficeShiftIds maps most recent entries', async () => {
    (prisma.changelog.findMany as jest.Mock).mockResolvedValue([
      {
        entityId: 'shift-a',
        details: { method: 'REPLACEMENT', previousEmployeeName: 'Alice', replacementReason: 'Sick' },
      },
      {
        entityId: 'shift-b',
        details: { method: 'SWAP', swapPairShiftId: 'shift-a' },
      },
    ]);

    const map = await getLatestSwapReplacementChangelogByOfficeShiftIds(['shift-a', 'shift-b']);

    expect(map.get('shift-a')).toEqual({
      method: 'REPLACEMENT',
      previousEmployeeName: 'Alice',
      replacementReason: 'Sick',
    });
    expect(map.get('shift-b')).toEqual({ method: 'SWAP', previousEmployeeName: null });
  });

  test('bulkSwapReplaceOfficeShifts swaps time-matched and replaces unmatched, re-pointing overrides', async () => {
    (prisma.employee.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'employee-1', fullName: 'Alice', deletedAt: null, role: 'office', status: true })
      .mockResolvedValueOnce({ id: 'employee-2', fullName: 'Bob', deletedAt: null, role: 'office', status: true });
    const shiftA1 = {
      ...baseShift,
      id: 'shift-a1',
      date: new Date('2026-04-10T00:00:00.000Z'),
      startsAt: new Date('2026-04-10T08:00:00.000Z'),
      endsAt: new Date('2026-04-10T17:00:00.000Z'),
      employeeId: 'employee-1',
      employee: { id: 'employee-1', fullName: 'Alice', employeeNumber: 'E1', office: { name: 'HQ' } },
      note: 'a1',
    };
    const shiftA2 = {
      ...baseShift,
      id: 'shift-a2',
      date: new Date('2026-04-12T00:00:00.000Z'),
      startsAt: new Date('2026-04-12T08:00:00.000Z'),
      endsAt: new Date('2026-04-12T17:00:00.000Z'),
      employeeId: 'employee-1',
      employee: { id: 'employee-1', fullName: 'Alice', employeeNumber: 'E1', office: { name: 'HQ' } },
      note: 'a2',
    };
    const shiftB1 = {
      ...baseShift,
      id: 'shift-b1',
      date: new Date('2026-04-10T00:00:00.000Z'),
      startsAt: new Date('2026-04-10T08:00:00.000Z'),
      endsAt: new Date('2026-04-10T17:00:00.000Z'),
      employeeId: 'employee-2',
      employee: { id: 'employee-2', fullName: 'Bob', employeeNumber: 'E2', office: { name: 'HQ' } },
      note: 'b1',
    };
    (prisma.officeShift.findMany as jest.Mock)
      .mockResolvedValueOnce([shiftA1, shiftA2]) // employee A
      .mockResolvedValueOnce([shiftB1]); // employee B
    (prisma.officeShift.update as jest.Mock).mockImplementation(async (args: any) => ({
      ...(args.where.id === 'shift-a1' ? shiftA1 : args.where.id === 'shift-a2' ? shiftA2 : shiftB1),
      employeeId: args.data.employee.connect.id,
      employee:
        args.data.employee.connect.id === 'employee-2'
          ? { id: 'employee-2', fullName: 'Bob', employeeNumber: 'E2', office: { name: 'HQ' } }
          : { id: 'employee-1', fullName: 'Alice', employeeNumber: 'E1', office: { name: 'HQ' } },
      note: args.data.note,
    }));

    const result = await bulkSwapReplaceOfficeShifts(
      {
        employeeAId: 'employee-1',
        employeeBId: 'employee-2',
        fromDate: '2026-04-10',
        toDate: '2026-04-12',
        reason: 'Sick',
      },
      'admin-1'
    );

    expect(result.swappedCount).toBe(1);
    expect(result.replacedCount).toBe(1);
    // shift-a2 (unmatched) goes to employee-2 -> REPLACEMENT
    expect(prisma.officeShift.update).toHaveBeenCalledTimes(3);
    // Override re-pointing: a1->b, b1->a, a2->b
    expect(upsertEmployeeOfficeDayOverride).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'employee-2', date: '2026-04-10' }),
      prisma
    );
    expect(upsertEmployeeOfficeDayOverride).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'employee-1', date: '2026-04-10' }),
      prisma
    );
    expect(upsertEmployeeOfficeDayOverride).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'employee-2', date: '2026-04-12' }),
      prisma
    );
    const changelogData = (prisma.changelog.createMany as jest.Mock).mock.calls[0][0].data;
    expect(changelogData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ details: expect.objectContaining({ method: 'SWAP', previousEmployeeName: 'Alice' }) }),
        expect.objectContaining({ details: expect.objectContaining({ method: 'REPLACEMENT', previousEmployeeName: 'Alice' }) }),
      ])
    );
    expect(redis.publish).toHaveBeenCalledWith('events:shifts', expect.stringContaining('OFFICE_SHIFT_SWAP_REPLACE'));
  });

  test('bulkSwapReplaceOfficeShifts rejects same employee', async () => {
    await expect(
      bulkSwapReplaceOfficeShifts(
        { employeeAId: 'employee-1', employeeBId: 'employee-1', fromDate: '2026-04-10', toDate: '2026-04-12' },
        'admin-1'
      )
    ).rejects.toThrow('Cannot swap an employee with themselves');
  });

  test('bulkSwapReplaceOfficeShifts throws when no eligible shifts found', async () => {
    (prisma.employee.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'employee-1', fullName: 'Alice', deletedAt: null, role: 'office', status: true })
      .mockResolvedValueOnce({ id: 'employee-2', fullName: 'Bob', deletedAt: null, role: 'office', status: true });
    (prisma.officeShift.findMany as jest.Mock).mockResolvedValue([]);
    await expect(
      bulkSwapReplaceOfficeShifts(
        { employeeAId: 'employee-1', employeeBId: 'employee-2', fromDate: '2026-04-10', toDate: '2026-04-12', reason: 'Sick' },
        'admin-1'
      )
    ).rejects.toThrow('No eligible office shifts found');
  });

  test('bulkSwapReplaceOfficeShifts replaces unmatched B shifts to A', async () => {
    (prisma.employee.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'employee-1', fullName: 'Alice', deletedAt: null, role: 'office', status: true })
      .mockResolvedValueOnce({ id: 'employee-2', fullName: 'Bob', deletedAt: null, role: 'office', status: true });
    const shiftA1 = {
      ...baseShift,
      id: 'shift-a1',
      date: new Date('2026-04-10T00:00:00.000Z'),
      startsAt: new Date('2026-04-10T08:00:00.000Z'),
      endsAt: new Date('2026-04-10T17:00:00.000Z'),
      employeeId: 'employee-1',
      employee: { id: 'employee-1', fullName: 'Alice', employeeNumber: 'E1', office: { name: 'HQ' } },
      note: 'a1',
    };
    const shiftB1 = {
      ...baseShift,
      id: 'shift-b1',
      date: new Date('2026-04-11T00:00:00.000Z'),
      startsAt: new Date('2026-04-11T09:00:00.000Z'),
      endsAt: new Date('2026-04-11T18:00:00.000Z'),
      employeeId: 'employee-2',
      employee: { id: 'employee-2', fullName: 'Bob', employeeNumber: 'E2', office: { name: 'HQ' } },
      note: 'b1',
    };
    const shiftB2 = {
      ...baseShift,
      id: 'shift-b2',
      date: new Date('2026-04-12T00:00:00.000Z'),
      startsAt: new Date('2026-04-12T09:00:00.000Z'),
      endsAt: new Date('2026-04-12T18:00:00.000Z'),
      employeeId: 'employee-2',
      employee: { id: 'employee-2', fullName: 'Bob', employeeNumber: 'E2', office: { name: 'HQ' } },
      note: 'b2',
    };
    (prisma.officeShift.findMany as jest.Mock)
      .mockResolvedValueOnce([shiftA1]) // employee A
      .mockResolvedValueOnce([shiftB1, shiftB2]); // employee B (both unmatched)
    (prisma.officeShift.update as jest.Mock).mockImplementation(async (args: any) => ({
      ...(args.where.id === 'shift-a1' ? shiftA1 : args.where.id === 'shift-b1' ? shiftB1 : shiftB2),
      employeeId: args.data.employee.connect.id,
      employee:
        args.data.employee.connect.id === 'employee-2'
          ? { id: 'employee-2', fullName: 'Bob', employeeNumber: 'E2', office: { name: 'HQ' } }
          : { id: 'employee-1', fullName: 'Alice', employeeNumber: 'E1', office: { name: 'HQ' } },
      note: args.data.note,
    }));

    const result = await bulkSwapReplaceOfficeShifts(
      { employeeAId: 'employee-1', employeeBId: 'employee-2', fromDate: '2026-04-10', toDate: '2026-04-12', reason: 'Sick' },
      'admin-1'
    );

    // a1 is unmatched -> REPLACEMENT to B; b1,b2 unmatched -> REPLACEMENT to A
    expect(result.swappedCount).toBe(0);
    expect(result.replacedCount).toBe(3);
    expect(prisma.officeShift.update).toHaveBeenCalledTimes(3);
    const changelogData = (prisma.changelog.createMany as jest.Mock).mock.calls[0][0].data;
    expect(changelogData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: 'shift-b1',
          details: expect.objectContaining({ method: 'REPLACEMENT', previousEmployeeName: 'Bob' }),
        }),
        expect.objectContaining({
          entityId: 'shift-a1',
          details: expect.objectContaining({ method: 'REPLACEMENT', previousEmployeeName: 'Alice' }),
        }),
      ])
    );
  });

  test('bulkSwapReplaceOfficeShifts excludes batch shifts from overlap, only flags pre-existing conflicts', async () => {
    (prisma.employee.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'employee-1', fullName: 'Alice', deletedAt: null, role: 'office', status: true })
      .mockResolvedValueOnce({ id: 'employee-2', fullName: 'Bob', deletedAt: null, role: 'office', status: true });
    const shiftA1 = {
      ...baseShift,
      id: 'shift-a1',
      date: new Date('2026-04-10T00:00:00.000Z'),
      startsAt: new Date('2026-04-10T08:00:00.000Z'),
      endsAt: new Date('2026-04-10T17:00:00.000Z'),
      employeeId: 'employee-1',
      employee: { id: 'employee-1', fullName: 'Alice', employeeNumber: 'E1', office: { name: 'HQ' } },
      note: 'a1',
    };
    const shiftB1 = {
      ...baseShift,
      id: 'shift-b1',
      date: new Date('2026-04-10T00:00:00.000Z'),
      startsAt: new Date('2026-04-10T08:00:00.000Z'),
      endsAt: new Date('2026-04-10T17:00:00.000Z'),
      employeeId: 'employee-2',
      employee: { id: 'employee-2', fullName: 'Bob', employeeNumber: 'E2', office: { name: 'HQ' } },
      note: 'b1',
    };
    (prisma.officeShift.findMany as jest.Mock)
      .mockResolvedValueOnce([shiftA1])
      .mockResolvedValueOnce([shiftB1]);
    // A pre-existing shift on employee A that overlaps shiftB1's window (and is NOT in the batch)
    (prisma.officeShift.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'preexisting-1',
      employeeId: 'employee-1',
    });
    await expect(
      bulkSwapReplaceOfficeShifts(
        { employeeAId: 'employee-1', employeeBId: 'employee-2', fromDate: '2026-04-10', toDate: '2026-04-12', reason: 'Sick' },
        'admin-1'
      )
    ).rejects.toThrow(/conflicts with Alice/);
  });
});
