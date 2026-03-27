import {
  resolveOfficeWorkScheduleContextForEmployee,
  scheduleFutureOfficeWorkScheduleAssignment,
} from './office-work-schedules';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    systemSetting: {
      findUnique: jest.fn(),
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

    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
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
  });
});
