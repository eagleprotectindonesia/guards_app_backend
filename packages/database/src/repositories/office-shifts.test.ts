import {
  bulkCreateOfficeShiftsWithChangelog,
  createOfficeShiftWithChangelog,
  findRelevantOfficeShiftForEmployee,
  resolveOfficeShiftContextForEmployee,
  updateOfficeShiftWithChangelog,
} from './office-shifts';
import { db as prisma } from '../prisma/client';

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
      update: jest.fn(),
      createManyAndReturn: jest.fn(),
    },
    changelog: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
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
