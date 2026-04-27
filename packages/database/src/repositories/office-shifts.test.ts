import {
  bulkCreateOfficeShiftsWithChangelog,
  createOfficeShiftWithChangelog,
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
