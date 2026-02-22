import { markOverdueScheduledShiftsAsMissed } from './shifts';
import { db as prisma } from '../client';

jest.mock('../client', () => ({
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
