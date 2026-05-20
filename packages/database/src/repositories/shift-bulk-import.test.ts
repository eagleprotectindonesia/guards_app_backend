import { processGuardShiftBulkImport } from './shifts';
import { db as prisma } from '../prisma/client';
import { deleteEmployeeOnsiteDayOffsByEmployeeAndDates } from './onsite-day-offs';
import { reconcileApprovedOnsiteLeavesForCoverage } from './leave-requests';
import { redis } from '../redis/client';

jest.mock('../prisma/client', () => ({
  db: {
    site: { findMany: jest.fn() },
    shiftType: { findMany: jest.fn() },
    employee: { findMany: jest.fn() },
    shift: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      createMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    changelog: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../redis/client', () => ({
  redis: { xadd: jest.fn(), publish: jest.fn() },
}));

jest.mock('@repo/shared', () => ({
  parseShiftTypeTimeOnDate: jest.fn((date: string, time: string) => new Date(`${date}T${time}.000Z`)),
}));

jest.mock('./shift-types', () => ({
  getShiftTypeDurationInMins: jest.fn(() => 480),
}));

jest.mock('./onsite-day-offs', () => ({
  deleteEmployeeOnsiteDayOffsByEmployeeAndDates: jest.fn(),
  upsertEmployeeOnsiteDayOff: jest.fn(),
}));

jest.mock('./leave-requests', () => ({
  reconcileApprovedOnsiteLeavesForCoverage: jest.fn(),
}));

describe('processGuardShiftBulkImport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async callback => callback(prisma));
    (prisma.site.findMany as jest.Mock).mockResolvedValue([{ id: 'site-1', name: 'Main Site' }]);
    (prisma.shiftType.findMany as jest.Mock).mockResolvedValue([
      { id: 'shift-type-1', name: 'Morning', startTime: '08:00:00', endTime: '16:00:00' },
    ]);
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([{ id: 'emp-1', employeeNumber: 'E001' }]);
    (prisma.shift.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.shift.createManyAndReturn as jest.Mock).mockResolvedValue([]);
    (prisma.shift.update as jest.Mock).mockResolvedValue({ id: 'shift-updated' });
    (prisma.shift.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.shift.findUnique as jest.Mock).mockResolvedValue({
      id: 'existing-shift-1',
      siteId: 'site-1',
      shiftTypeId: 'shift-type-1',
      employeeId: 'emp-1',
      date: new Date('2026-06-10T00:00:00.000Z'),
      startsAt: new Date('2026-06-10T08:00:00.000Z'),
      endsAt: new Date('2026-06-10T16:00:00.000Z'),
      requiredCheckinIntervalMins: 20,
      graceMinutes: 2,
      status: 'scheduled',
      note: null,
      site: { name: 'Main Site' },
      shiftType: { name: 'Morning' },
      employee: { fullName: 'Guard One', office: { name: 'HQ' } },
    });
    (prisma.changelog.create as jest.Mock).mockResolvedValue({});
    (prisma.changelog.createMany as jest.Mock).mockResolvedValue({});
    (redis.xadd as jest.Mock).mockResolvedValue('1-0');
    (redis.publish as jest.Mock).mockResolvedValue(1);
  });

  it('uses CSV interval and grace when updating an existing same-day shift', async () => {
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'existing-shift-1',
        employeeId: 'emp-1',
        date: new Date('2026-06-10T00:00:00.000Z'),
        requiredCheckinIntervalMins: 20,
        graceMinutes: 2,
      },
    ]);

    const result = await processGuardShiftBulkImport(
      [
        {
          rowNumber: 2,
          site: 'Main Site',
          shiftTypeName: 'Morning',
          date: '2026-06-10',
          employeeCode: 'E001',
          interval: '30',
          grace: '5',
          note: 'updated',
        },
      ],
      { now: new Date('2026-06-01T00:00:00.000Z') }
    );

    expect(result.success).toBe(true);
    expect(prisma.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requiredCheckinIntervalMins: 30,
          graceMinutes: 5,
        }),
      })
    );
  });

  it('includes created rows in working-date cleanup and leave reconciliation', async () => {
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([]);

    const result = await processGuardShiftBulkImport(
      [
        {
          rowNumber: 2,
          site: 'Main Site',
          shiftTypeName: 'Morning',
          date: '2026-06-11',
          employeeCode: 'E001',
          interval: '20',
          grace: '2',
          note: null,
        },
      ],
      { now: new Date('2026-06-01T00:00:00.000Z') }
    );

    expect(result.success).toBe(true);
    expect(deleteEmployeeOnsiteDayOffsByEmployeeAndDates).toHaveBeenCalledWith('emp-1', ['2026-06-11'], prisma);
    expect(reconcileApprovedOnsiteLeavesForCoverage).toHaveBeenCalledWith({
      employeeId: 'emp-1',
      startDateKey: '2026-06-11',
      endDateKey: '2026-06-11',
      adminId: undefined,
    });
  });

  it('rejects when a row overlaps an existing overnight shift on adjacent date', async () => {
    (prisma.shiftType.findMany as jest.Mock).mockResolvedValue([
      { id: 'shift-type-early', name: 'Early', startTime: '05:00:00', endTime: '13:00:00' },
    ]);
    (prisma.shift.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'existing-overnight',
          employeeId: 'emp-1',
          startsAt: new Date('2026-06-10T22:00:00.000Z'),
          endsAt: new Date('2026-06-11T06:00:00.000Z'),
        },
      ]);

    const result = await processGuardShiftBulkImport(
      [
        {
          rowNumber: 2,
          site: 'Main Site',
          shiftTypeName: 'Early',
          date: '2026-06-11',
          employeeCode: 'E001',
          interval: '20',
          grace: '2',
          note: null,
        },
      ],
      { now: new Date('2026-06-01T00:00:00.000Z') }
    );

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('overlaps existing shift');
  });

  it('rejects when two rows in the same import overlap for the same employee', async () => {
    (prisma.shiftType.findMany as jest.Mock).mockResolvedValue([
      { id: 'shift-type-night', name: 'Night', startTime: '22:00:00', endTime: '06:00:00' },
      { id: 'shift-type-morning', name: 'Morning', startTime: '05:00:00', endTime: '13:00:00' },
    ]);
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([]);

    const result = await processGuardShiftBulkImport(
      [
        {
          rowNumber: 2,
          site: 'Main Site',
          shiftTypeName: 'Night',
          date: '2026-06-10',
          employeeCode: 'E001',
          interval: '20',
          grace: '2',
          note: null,
        },
        {
          rowNumber: 3,
          site: 'Main Site',
          shiftTypeName: 'Morning',
          date: '2026-06-11',
          employeeCode: 'E001',
          interval: '20',
          grace: '2',
          note: null,
        },
      ],
      { now: new Date('2026-06-01T00:00:00.000Z') }
    );

    expect(result.success).toBe(false);
    expect(result.errors.some(error => error.includes('overlapping shifts in the same import'))).toBe(true);
  });

  it('keeps DB success when post-commit notifications fail in admin mode', async () => {
    (prisma.shift.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.shift.createManyAndReturn as jest.Mock).mockResolvedValue([
      {
        id: 'created-shift-1',
        siteId: 'site-1',
        shiftTypeId: 'shift-type-1',
        employeeId: 'emp-1',
        date: new Date('2026-06-11T00:00:00.000Z'),
        startsAt: new Date('2026-06-11T08:00:00.000Z'),
        endsAt: new Date('2026-06-11T16:00:00.000Z'),
        requiredCheckinIntervalMins: 20,
        status: 'scheduled',
        note: null,
        site: { name: 'Main Site' },
        shiftType: { name: 'Morning' },
        employee: { fullName: 'Guard One', office: { name: 'HQ' } },
      },
    ]);
    (redis.xadd as jest.Mock).mockRejectedValue(new Error('redis down'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await processGuardShiftBulkImport(
      [
        {
          rowNumber: 2,
          site: 'Main Site',
          shiftTypeName: 'Morning',
          date: '2026-06-11',
          employeeCode: 'E001',
          interval: '20',
          grace: '2',
          note: null,
        },
      ],
      { now: new Date('2026-06-01T00:00:00.000Z'), adminId: 'admin-1' }
    );

    expect(result.success).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
