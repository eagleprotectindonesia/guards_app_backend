import {
  analyzeFutureOfficeWorkScheduleAssignment,
  bulkUpsertFutureOfficeWorkScheduleAssignments,
  resolveOfficeWorkScheduleContextForEmployee,
  scheduleFutureOfficeWorkScheduleAssignment,
} from './office-work-schedules';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    systemSetting: {
      findUnique: jest.fn(),
    },
    employee: {
      findUnique: jest.fn(),
    },
    changelog: {
      create: jest.fn(),
    },
    officeWorkSchedule: {
      findUnique: jest.fn(),
    },
    employeeOfficeWorkScheduleAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe('office work schedules', () => {
  function mockTransaction() {
    (prisma.$transaction as jest.Mock).mockImplementation(async callback => callback(prisma));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.employee.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      fullName: where.id === 'employee-2' ? 'Employee Two' : 'Employee One',
      employeeNumber: where.id === 'employee-2' ? 'EMP002' : 'EMP001',
    }));
    (prisma.changelog.create as jest.Mock).mockResolvedValue({});
  });

  test('resolves employee assignment for the requested date before default schedule', async () => {
    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock).mockResolvedValue({
      id: 'assignment-1',
      employeeId: 'employee-1',
      officeWorkSchedule: {
        id: 'schedule-custom',
        code: 'custom',
        name: 'Custom Schedule',
        days: [
          { weekday: 0, isWorkingDay: false, startTime: null, endTime: null },
          { weekday: 1, isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
          { weekday: 2, isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
          { weekday: 3, isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
          { weekday: 4, isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
          { weekday: 5, isWorkingDay: true, startTime: '09:00', endTime: '18:00' },
          { weekday: 6, isWorkingDay: false, startTime: null, endTime: null },
        ],
      },
    });

    const context = await resolveOfficeWorkScheduleContextForEmployee('employee-1', new Date('2026-03-30T01:30:00.000Z'));

    expect(context.source).toBe('assignment');
    expect(context.schedule.id).toBe('schedule-custom');
    expect(context.isWorkingDay).toBe(true);
    expect(context.startMinutes).toBe(9 * 60);
    expect(context.endMinutes).toBe(18 * 60);
  });

  test('resolves an overnight office work schedule window across midnight', async () => {
    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock).mockResolvedValue({
      id: 'assignment-overnight',
      employeeId: 'employee-1',
      officeWorkSchedule: {
        id: 'schedule-overnight',
        code: 'overnight',
        name: 'Overnight Schedule',
        days: [
          { weekday: 0, isWorkingDay: true, startTime: '18:00', endTime: '02:00' },
          { weekday: 1, isWorkingDay: false, startTime: null, endTime: null },
          { weekday: 2, isWorkingDay: false, startTime: null, endTime: null },
          { weekday: 3, isWorkingDay: false, startTime: null, endTime: null },
          { weekday: 4, isWorkingDay: false, startTime: null, endTime: null },
          { weekday: 5, isWorkingDay: false, startTime: null, endTime: null },
          { weekday: 6, isWorkingDay: false, startTime: null, endTime: null },
        ],
      },
    });

    const context = await resolveOfficeWorkScheduleContextForEmployee('employee-1', new Date('2026-03-29T17:30:00.000Z'));

    expect(context.source).toBe('assignment');
    expect(context.isWorkingDay).toBe(true);
    expect(context.startMinutes).toBe(18 * 60);
    expect(context.endMinutes).toBe(2 * 60);
    expect(context.isLate).toBe(true);
    expect(context.isAfterEnd).toBe(false);
    expect(context.windowStart?.toISOString()).toBe('2026-03-29T10:00:00.000Z');
    expect(context.windowEnd?.toISOString()).toBe('2026-03-29T18:00:00.000Z');
  });

  test('creates a future assignment and bounds the previous active assignment', async () => {
    const effectiveFrom = new Date('2026-03-30T00:00:00.000Z');
    const previousAssignment = {
      id: 'assignment-current',
      employeeId: 'employee-2',
      officeWorkScheduleId: 'schedule-old',
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveUntil: null,
    };

    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(previousAssignment)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    mockTransaction();

    (prisma.employeeOfficeWorkScheduleAssignment.create as jest.Mock).mockResolvedValue({
      id: 'assignment-future',
      employeeId: 'employee-2',
      officeWorkScheduleId: 'schedule-new',
      effectiveFrom,
      effectiveUntil: null,
    });
    (prisma.officeWorkSchedule.findUnique as jest.Mock).mockResolvedValue({
      id: 'schedule-new',
      name: 'Schedule New',
    });

    const result = await scheduleFutureOfficeWorkScheduleAssignment({
      employeeId: 'employee-2',
      officeWorkScheduleId: 'schedule-new',
      effectiveFrom,
    });

    expect(prisma.employeeOfficeWorkScheduleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-current' },
      data: { effectiveUntil: effectiveFrom },
    });
    expect(prisma.employeeOfficeWorkScheduleAssignment.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'employee-2',
        officeWorkScheduleId: 'schedule-new',
        effectiveFrom,
        effectiveUntil: null,
      },
    });
    expect(result).toMatchObject({
      id: 'assignment-future',
      officeWorkScheduleId: 'schedule-new',
    });
    expect(prisma.changelog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        entityType: 'Employee',
        entityId: 'employee-2',
        details: expect.objectContaining({
          name: 'Office Schedule Assignment',
          nextScheduleName: 'Schedule New',
          operationType: 'create_future_assignment',
          source: 'single_update',
        }),
      }),
    });
  });

  test('treats same-date same-schedule future assignment as a no-op', async () => {
    const effectiveFrom = new Date('2026-03-30T00:00:00.000Z');
    const existingAssignment = {
      id: 'assignment-future',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-1',
      effectiveFrom,
      effectiveUntil: null,
    };

    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock).mockResolvedValue(existingAssignment);
    (prisma.changelog.create as jest.Mock).mockClear();

    const result = await analyzeFutureOfficeWorkScheduleAssignment({
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-1',
      effectiveFrom,
      referenceDate: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(result.mode).toBe('noop');
    expect(result.exactAssignment).toEqual(existingAssignment);
    expect(result.previousAssignment).toBeNull();
    expect(result.nextAssignment).toBeNull();
    expect(prisma.changelog.create).not.toHaveBeenCalled();
  });

  test('replaces same-date future assignment when schedule changes', async () => {
    const effectiveFrom = new Date('2026-03-30T00:00:00.000Z');
    const existingAssignment = {
      id: 'assignment-future',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-old',
      effectiveFrom,
      effectiveUntil: null,
    };

    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock).mockResolvedValue(existingAssignment);
    (prisma.employeeOfficeWorkScheduleAssignment.update as jest.Mock).mockResolvedValue({
      ...existingAssignment,
      officeWorkScheduleId: 'schedule-new',
    });
    (prisma.officeWorkSchedule.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'schedule-new', name: 'Schedule New' })
      .mockResolvedValueOnce({ id: 'schedule-old', name: 'Schedule Old' });

    const result = await scheduleFutureOfficeWorkScheduleAssignment({
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-new',
      effectiveFrom,
    });

    expect(prisma.employeeOfficeWorkScheduleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-future' },
      data: { officeWorkScheduleId: 'schedule-new' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'assignment-future',
      officeWorkScheduleId: 'schedule-new',
    });
    expect(prisma.changelog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        entityType: 'Employee',
        entityId: 'employee-1',
        details: expect.objectContaining({
          previousScheduleName: 'Schedule Old',
          nextScheduleName: 'Schedule New',
          operationType: 'replace_same_date_assignment',
          source: 'single_update',
        }),
      }),
    });
  });

  test('creates a later future assignment after an existing future row', async () => {
    const firstFutureStart = new Date('2026-03-30T00:00:00.000Z');
    const secondFutureStart = new Date('2026-04-06T00:00:00.000Z');
    const previousAssignment = {
      id: 'assignment-a',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-a',
      effectiveFrom: firstFutureStart,
      effectiveUntil: null,
    };

    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(previousAssignment)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    mockTransaction();
    (prisma.employeeOfficeWorkScheduleAssignment.create as jest.Mock).mockResolvedValue({
      id: 'assignment-b',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-b',
      effectiveFrom: secondFutureStart,
      effectiveUntil: null,
    });
    (prisma.officeWorkSchedule.findUnique as jest.Mock).mockResolvedValue({
      id: 'schedule-b',
      name: 'Schedule B',
    });

    await scheduleFutureOfficeWorkScheduleAssignment({
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-b',
      effectiveFrom: secondFutureStart,
    });

    expect(prisma.employeeOfficeWorkScheduleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-a' },
      data: { effectiveUntil: secondFutureStart },
    });
    expect(prisma.employeeOfficeWorkScheduleAssignment.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'employee-1',
        officeWorkScheduleId: 'schedule-b',
        effectiveFrom: secondFutureStart,
        effectiveUntil: null,
      },
    });
  });

  test('inserts an earlier future assignment before an existing future row and auto-bounds the new row', async () => {
    const currentStart = new Date('2026-03-01T00:00:00.000Z');
    const insertedStart = new Date('2026-03-30T00:00:00.000Z');
    const nextStart = new Date('2026-04-06T00:00:00.000Z');
    const previousAssignment = {
      id: 'assignment-current',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-current',
      effectiveFrom: currentStart,
      effectiveUntil: null,
    };
    const nextAssignment = {
      id: 'assignment-future',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-next',
      effectiveFrom: nextStart,
      effectiveUntil: null,
    };

    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(previousAssignment)
      .mockResolvedValueOnce(nextAssignment)
      .mockResolvedValueOnce(null);

    mockTransaction();
    (prisma.employeeOfficeWorkScheduleAssignment.create as jest.Mock).mockResolvedValue({
      id: 'assignment-inserted',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-inserted',
      effectiveFrom: insertedStart,
      effectiveUntil: nextStart,
    });
    (prisma.officeWorkSchedule.findUnique as jest.Mock).mockResolvedValue({
      id: 'schedule-inserted',
      name: 'Schedule Inserted',
    });

    await scheduleFutureOfficeWorkScheduleAssignment({
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-inserted',
      effectiveFrom: insertedStart,
    });

    expect(prisma.employeeOfficeWorkScheduleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-current' },
      data: { effectiveUntil: insertedStart },
    });
    expect(prisma.employeeOfficeWorkScheduleAssignment.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'employee-1',
        officeWorkScheduleId: 'schedule-inserted',
        effectiveFrom: insertedStart,
        effectiveUntil: nextStart,
      },
    });
  });

  test('inserts between two future assignments and preserves both bounds', async () => {
    const firstStart = new Date('2026-03-30T00:00:00.000Z');
    const middleStart = new Date('2026-04-06T00:00:00.000Z');
    const lastStart = new Date('2026-04-13T00:00:00.000Z');
    const previousAssignment = {
      id: 'assignment-a',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-a',
      effectiveFrom: firstStart,
      effectiveUntil: lastStart,
    };
    const nextAssignment = {
      id: 'assignment-c',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-c',
      effectiveFrom: lastStart,
      effectiveUntil: null,
    };

    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(previousAssignment)
      .mockResolvedValueOnce(nextAssignment)
      .mockResolvedValueOnce(null);

    mockTransaction();
    (prisma.employeeOfficeWorkScheduleAssignment.create as jest.Mock).mockResolvedValue({
      id: 'assignment-b',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-b',
      effectiveFrom: middleStart,
      effectiveUntil: lastStart,
    });
    (prisma.officeWorkSchedule.findUnique as jest.Mock).mockResolvedValue({
      id: 'schedule-b',
      name: 'Schedule B',
    });

    await scheduleFutureOfficeWorkScheduleAssignment({
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-b',
      effectiveFrom: middleStart,
    });

    expect(prisma.employeeOfficeWorkScheduleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-a' },
      data: { effectiveUntil: middleStart },
    });
    expect(prisma.employeeOfficeWorkScheduleAssignment.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'employee-1',
        officeWorkScheduleId: 'schedule-b',
        effectiveFrom: middleStart,
        effectiveUntil: lastStart,
      },
    });
  });

  test('bulk upsert sorts employee timelines before applying them', async () => {
    const laterStart = new Date('2026-04-06T00:00:00.000Z');
    const earlierStart = new Date('2026-03-30T00:00:00.000Z');
    const currentAssignment = {
      id: 'assignment-current',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-current',
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveUntil: null,
    };
    const laterAssignment = {
      id: 'assignment-later',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-later',
      effectiveFrom: laterStart,
      effectiveUntil: null,
    };

    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(currentAssignment)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(currentAssignment)
      .mockResolvedValueOnce(laterAssignment)
      .mockResolvedValueOnce(null);

    mockTransaction();
    (prisma.employeeOfficeWorkScheduleAssignment.create as jest.Mock)
      .mockResolvedValueOnce({
        id: 'assignment-early',
        employeeId: 'employee-1',
        officeWorkScheduleId: 'schedule-early',
        effectiveFrom: earlierStart,
        effectiveUntil: null,
      })
      .mockResolvedValueOnce({
        id: 'assignment-late',
        employeeId: 'employee-1',
        officeWorkScheduleId: 'schedule-late',
        effectiveFrom: laterStart,
        effectiveUntil: null,
      });
    (prisma.officeWorkSchedule.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'schedule-early', name: 'Schedule Early' })
      .mockResolvedValueOnce({ id: 'schedule-late', name: 'Schedule Late' });

    await bulkUpsertFutureOfficeWorkScheduleAssignments([
      {
        employeeId: 'employee-1',
        officeWorkScheduleId: 'schedule-late',
        effectiveFrom: laterStart,
      },
      {
        employeeId: 'employee-1',
        officeWorkScheduleId: 'schedule-early',
        effectiveFrom: earlierStart,
      },
    ]);

    expect(prisma.employeeOfficeWorkScheduleAssignment.create).toHaveBeenCalledTimes(2);
    expect((prisma.employeeOfficeWorkScheduleAssignment.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-early',
      effectiveFrom: earlierStart,
    });
    expect((prisma.employeeOfficeWorkScheduleAssignment.create as jest.Mock).mock.calls[1][0].data).toMatchObject({
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-late',
      effectiveFrom: laterStart,
    });
  });

  test('throws when a new bounded assignment would overlap an existing row', async () => {
    const insertedStart = new Date('2026-03-30T00:00:00.000Z');
    const nextStart = new Date('2026-04-06T00:00:00.000Z');
    const previousAssignment = {
      id: 'assignment-current',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-current',
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveUntil: null,
    };
    const nextAssignment = {
      id: 'assignment-future',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-next',
      effectiveFrom: nextStart,
      effectiveUntil: null,
    };
    const overlappingAssignment = {
      id: 'assignment-overlap',
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-overlap',
      effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
      effectiveUntil: new Date('2026-04-03T00:00:00.000Z'),
    };

    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(previousAssignment)
      .mockResolvedValueOnce(nextAssignment)
      .mockResolvedValueOnce(overlappingAssignment);

    mockTransaction();

    await expect(
      scheduleFutureOfficeWorkScheduleAssignment({
        employeeId: 'employee-1',
        officeWorkScheduleId: 'schedule-inserted',
        effectiveFrom: insertedStart,
      })
    ).rejects.toThrow('Office work schedule assignment overlaps an existing assignment');
  });
});
