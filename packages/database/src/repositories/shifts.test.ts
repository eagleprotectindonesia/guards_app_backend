import { getActiveShifts, getActiveShiftsForDashboard, markOverdueScheduledShiftsAsMissed } from './shifts';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    $transaction: jest.fn(),
    shift: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    alert: {
      updateManyAndReturn: jest.fn(),
    },
  },
}));

describe('markOverdueScheduledShiftsAsMissed', () => {
  const now = new Date();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should transition overdue scheduled shifts to missed and resolve alerts', async () => {
    const mockShifts = [
      { id: 'shift-1', siteId: 'site-1' },
      { id: 'shift-2', siteId: 'site-1' },
    ];

    const mockResolvedAlerts = [
      { id: 'alert-1', siteId: 'site-1' },
    ];

    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
      return cb(prisma);
    });

    (prisma.shift.findMany as jest.Mock).mockResolvedValue(mockShifts);
    (prisma.shift.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.alert.updateManyAndReturn as jest.Mock).mockResolvedValue(mockResolvedAlerts);

    const result = await markOverdueScheduledShiftsAsMissed(now);

    expect(prisma.shift.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'scheduled',
        endsAt: { lte: now },
        deletedAt: null,
        employeeId: { not: null },
      },
    }));

    expect(prisma.shift.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['shift-1', 'shift-2'] } },
      data: { status: 'missed' },
    });

    expect(prisma.alert.updateManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        shiftId: { in: ['shift-1', 'shift-2'] },
        resolvedAt: null,
      },
      data: expect.objectContaining({
        resolutionType: 'auto',
      }),
    }));

    expect(result.updatedShiftIds).toEqual(['shift-1', 'shift-2']);
    expect(result.resolvedAlerts).toEqual(mockResolvedAlerts);
  });

  it('should return empty result if no overdue shifts found', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
      return cb(prisma);
    });

    (prisma.shift.findMany as jest.Mock).mockResolvedValue([]);

    const result = await markOverdueScheduledShiftsAsMissed(now);

    expect(result.updatedShiftIds).toEqual([]);
    expect(result.resolvedAlerts).toEqual([]);
    expect(prisma.shift.updateMany).not.toHaveBeenCalled();
  });
});

describe('active shift query filters', () => {
  const now = new Date('2026-05-20T10:00:00.000Z');
  const baseShift = {
    id: 'shift-1',
    employeeId: 'emp-1',
    shiftType: { id: 'st-1' },
    employee: { id: 'emp-1', office: { name: 'HQ' } },
    site: { id: 'site-1' },
    attendance: null,
    startsAt: new Date('2026-05-20T08:00:00.000Z'),
    requiredCheckinIntervalMins: 20,
    missedCount: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('getActiveShifts keeps in_progress shifts until end time + grace', async () => {
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([
      {
        ...baseShift,
        id: 'scheduled-1',
        status: 'scheduled',
        endsAt: new Date('2026-05-20T12:00:00.000Z'),
        graceMinutes: 2,
      },
      {
        ...baseShift,
        id: 'in-progress-within-grace',
        status: 'in_progress',
        endsAt: new Date('2026-05-20T09:59:00.000Z'),
        graceMinutes: 2,
      },
      {
        ...baseShift,
        id: 'in-progress-expired',
        status: 'in_progress',
        endsAt: new Date('2026-05-20T09:50:00.000Z'),
        graceMinutes: 5,
      },
    ]);

    const result = await getActiveShifts(now);

    expect(result.map(shift => shift.id)).toEqual(['scheduled-1', 'in-progress-within-grace']);
  });

  it('getActiveShiftsForDashboard keeps in_progress shifts until end time + grace', async () => {
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([
      {
        ...baseShift,
        id: 'scheduled-1',
        status: 'scheduled',
        endsAt: new Date('2026-05-20T12:00:00.000Z'),
        graceMinutes: 2,
      },
      {
        ...baseShift,
        id: 'in-progress-within-grace',
        status: 'in_progress',
        endsAt: new Date('2026-05-20T09:59:00.000Z'),
        graceMinutes: 2,
      },
      {
        ...baseShift,
        id: 'in-progress-expired',
        status: 'in_progress',
        endsAt: new Date('2026-05-20T09:50:00.000Z'),
        graceMinutes: 5,
      },
    ]);

    const result = await getActiveShiftsForDashboard(now);

    expect(result.map(shift => shift.id)).toEqual(['scheduled-1', 'in-progress-within-grace']);
  });
});
