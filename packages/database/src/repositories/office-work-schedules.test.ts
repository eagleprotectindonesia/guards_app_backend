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

  test('creates a future assignment and bounds the previous active assignment', async () => {
    const effectiveFrom = new Date('2026-03-30T00:00:00.000Z');
    const previousAssignment = {
      id: 'assignment-current',
      employeeId: 'employee-2',
      officeWorkScheduleId: 'schedule-old',
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveUntil: null,
    };

    (prisma.employeeOfficeWorkScheduleAssignment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock)
      .mockResolvedValueOnce(previousAssignment)
      .mockResolvedValueOnce(null);

    (prisma.$transaction as jest.Mock).mockImplementation(async callback =>
      callback(prisma)
    );

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

    (prisma.employeeOfficeWorkScheduleAssignment.findMany as jest.Mock).mockResolvedValue([existingAssignment]);
    (prisma.changelog.create as jest.Mock).mockClear();

    const result = await analyzeFutureOfficeWorkScheduleAssignment({
      employeeId: 'employee-1',
      officeWorkScheduleId: 'schedule-1',
      effectiveFrom,
      referenceDate: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(result.mode).toBe('noop');
    expect(result.exactAssignment).toEqual(existingAssignment);
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

    (prisma.employeeOfficeWorkScheduleAssignment.findMany as jest.Mock).mockResolvedValue([existingAssignment]);
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

  test('rejects same employee when another future assignment exists on a different date', async () => {
    const assignments = [
      {
        id: 'assignment-a',
        employeeId: 'employee-1',
        officeWorkScheduleId: 'schedule-a',
        effectiveFrom: new Date('2026-03-30T00:00:00.000Z'),
        effectiveUntil: null,
      },
      {
        id: 'assignment-b',
        employeeId: 'employee-1',
        officeWorkScheduleId: 'schedule-b',
        effectiveFrom: new Date('2026-04-06T00:00:00.000Z'),
        effectiveUntil: null,
      },
    ];

    (prisma.employeeOfficeWorkScheduleAssignment.findMany as jest.Mock).mockResolvedValue(assignments);

    await expect(
      bulkUpsertFutureOfficeWorkScheduleAssignments([
        {
          employeeId: 'employee-1',
          officeWorkScheduleId: 'schedule-new',
          effectiveFrom: new Date('2026-03-30T00:00:00.000Z'),
        },
      ])
    ).rejects.toThrow('A future office work schedule assignment on a different effective date already exists');
    expect(prisma.changelog.create).not.toHaveBeenCalled();
  });
});
