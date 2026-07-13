import { getSiteAssignmentDashboardMetrics } from './sites';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    site: {
      count: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
    },
  },
}));

describe('getSiteAssignmentDashboardMetrics', () => {
  const now = new Date('2026-06-09T10:00:00.000Z');
  const sevenDaysLater = new Date('2026-06-16T10:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('counts distinct assigned sites from scheduled shifts within the next 7 days', async () => {
    (prisma.site.count as jest.Mock).mockResolvedValue(5);
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([
      { siteId: 'site-1' },
      { siteId: 'site-2' },
    ]);

    const result = await getSiteAssignmentDashboardMetrics(now);

    expect(prisma.site.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        kind: 'fixed',
      },
    });

    expect(prisma.shift.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: 'scheduled',
        startsAt: {
          gte: now,
          lt: sevenDaysLater,
        },
        site: {
          deletedAt: null,
        },
      },
      distinct: ['siteId'],
      select: {
        siteId: true,
      },
    });

    expect(result).toEqual({
      totalSites: 5,
      assignedSites: 2,
      unassignedSites: 3,
    });
  });

  it('does not double-count sites with multiple shifts in the window', async () => {
    (prisma.site.count as jest.Mock).mockResolvedValue(3);
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([
      { siteId: 'site-1' },
    ]);

    const result = await getSiteAssignmentDashboardMetrics(now);

    expect(result.assignedSites).toBe(1);
    expect(result.unassignedSites).toBe(2);
  });

  it('returns all sites as unassigned when no scheduled shifts match the window', async () => {
    (prisma.site.count as jest.Mock).mockResolvedValue(4);
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getSiteAssignmentDashboardMetrics(now);

    expect(result).toEqual({
      totalSites: 4,
      assignedSites: 0,
      unassignedSites: 4,
    });
  });
});
