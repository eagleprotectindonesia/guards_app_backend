import {
  deleteEmployeeOfficeDayOverridesByEmployeeAndDates,
  getOfficeDayOverrideAnchorDates,
  resolveOfficeDayOverrideAnchorsForEmployee,
  upsertEmployeeOfficeDayOverride,
} from './office-day-overrides';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    changelog: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    employeeOfficeDayOverride: {
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('office day overrides', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('resolves current and previous override anchors by business date', async () => {
    (prisma.employeeOfficeDayOverride.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'override-1',
        date: new Date('2026-04-01T00:00:00.000Z'),
        overrideType: 'off',
      },
      {
        id: 'override-2',
        date: new Date('2026-03-31T00:00:00.000Z'),
        overrideType: 'shift_override',
      },
    ]);

    const anchors = await resolveOfficeDayOverrideAnchorsForEmployee('employee-1', new Date('2026-04-01T01:00:00.000Z'));

    expect(anchors.currentDateKey).toBe('2026-04-01');
    expect(anchors.previousDateKey).toBe('2026-03-31');
    expect(anchors.currentOverride).toMatchObject({ overrideType: 'off' });
    expect(anchors.previousOverride).toMatchObject({ overrideType: 'shift_override' });
  });

  test('upserts an existing day override and logs the change', async () => {
    (prisma.employeeOfficeDayOverride.findUnique as jest.Mock).mockResolvedValue({
      id: 'override-1',
      employeeId: 'employee-1',
      date: new Date('2026-04-02T00:00:00.000Z'),
      overrideType: 'off',
      note: null,
    });
    (prisma.employeeOfficeDayOverride.update as jest.Mock).mockResolvedValue({
      id: 'override-1',
      employeeId: 'employee-1',
      date: new Date('2026-04-02T00:00:00.000Z'),
      overrideType: 'shift_override',
      note: 'Special coverage',
    });

    const result = await upsertEmployeeOfficeDayOverride({
      employeeId: 'employee-1',
      date: '2026-04-02',
      overrideType: 'shift_override',
      note: 'Special coverage',
      adminId: 'admin-1',
    });

    expect(result).toMatchObject({
      id: 'override-1',
      overrideType: 'shift_override',
    });
    expect(prisma.changelog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        entityType: 'EmployeeOfficeDayOverride',
        entityId: 'override-1',
      }),
    });
  });

  test('deletes multiple day overrides and writes delete changelog entries', async () => {
    (prisma.employeeOfficeDayOverride.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'override-1',
        date: new Date('2026-04-03T00:00:00.000Z'),
        overrideType: 'off',
        note: null,
      },
      {
        id: 'override-2',
        date: new Date('2026-04-04T00:00:00.000Z'),
        overrideType: 'shift_override',
        note: 'Temp',
      },
    ]);
    (prisma.employeeOfficeDayOverride.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

    const deleted = await deleteEmployeeOfficeDayOverridesByEmployeeAndDates(
      'employee-1',
      ['2026-04-03', '2026-04-04'],
      'admin-1'
    );

    expect(deleted).toBe(2);
    expect(prisma.employeeOfficeDayOverride.deleteMany).toHaveBeenCalled();
    expect(prisma.changelog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          action: 'DELETE',
          entityType: 'EmployeeOfficeDayOverride',
        }),
      ]),
    });
  });

  test('returns current and previous anchor dates for the business timezone', () => {
    const anchors = getOfficeDayOverrideAnchorDates(new Date('2026-04-01T01:00:00.000Z'));

    expect(anchors.currentDateKey).toBe('2026-04-01');
    expect(anchors.previousDateKey).toBe('2026-03-31');
  });
});
