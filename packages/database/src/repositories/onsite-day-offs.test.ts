import { deleteEmployeeOnsiteDayOffsByEmployeeAndDates, upsertEmployeeOnsiteDayOff } from './onsite-day-offs';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    changelog: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    employeeOnsiteDayOff: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('onsite day offs', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('upserts an existing onsite day off and logs the change', async () => {
    (prisma.employeeOnsiteDayOff.findUnique as jest.Mock).mockResolvedValue({
      id: 'dayoff-1',
      employeeId: 'employee-1',
      date: new Date('2026-04-02T00:00:00.000Z'),
      note: null,
    });
    (prisma.employeeOnsiteDayOff.update as jest.Mock).mockResolvedValue({
      id: 'dayoff-1',
      employeeId: 'employee-1',
      date: new Date('2026-04-02T00:00:00.000Z'),
      note: 'Adjusted',
    });

    const result = await upsertEmployeeOnsiteDayOff({
      employeeId: 'employee-1',
      date: '2026-04-02',
      note: 'Adjusted',
      adminId: 'admin-1',
    });

    expect(result).toMatchObject({ id: 'dayoff-1', note: 'Adjusted' });
    expect(prisma.changelog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        entityType: 'EmployeeOnsiteDayOff',
        entityId: 'dayoff-1',
      }),
    });
  });

  test('creates a new onsite day off and logs it', async () => {
    (prisma.employeeOnsiteDayOff.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.employeeOnsiteDayOff.create as jest.Mock).mockResolvedValue({
      id: 'dayoff-2',
      employeeId: 'employee-1',
      date: new Date('2026-04-03T00:00:00.000Z'),
      note: 'OFF from import',
    });

    const result = await upsertEmployeeOnsiteDayOff({
      employeeId: 'employee-1',
      date: '2026-04-03',
      note: 'OFF from import',
      adminId: 'admin-1',
    });

    expect(result).toMatchObject({ id: 'dayoff-2' });
    expect(prisma.changelog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        entityType: 'EmployeeOnsiteDayOff',
        entityId: 'dayoff-2',
      }),
    });
  });

  test('deletes multiple onsite day offs and writes delete changelog entries', async () => {
    (prisma.employeeOnsiteDayOff.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'dayoff-1',
        date: new Date('2026-04-03T00:00:00.000Z'),
        note: null,
      },
      {
        id: 'dayoff-2',
        date: new Date('2026-04-04T00:00:00.000Z'),
        note: 'Temp',
      },
    ]);
    (prisma.employeeOnsiteDayOff.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

    const deleted = await deleteEmployeeOnsiteDayOffsByEmployeeAndDates(
      'employee-1',
      ['2026-04-03', '2026-04-04'],
      'admin-1'
    );

    expect(deleted).toBe(2);
    expect(prisma.changelog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          action: 'DELETE',
          entityType: 'EmployeeOnsiteDayOff',
        }),
      ]),
    });
  });
});
