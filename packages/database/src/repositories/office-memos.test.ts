import { listActiveOfficeMemosForEmployee } from './office-memos';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    officeMemo: {
      findMany: jest.fn(),
    },
  },
}));

describe('office memos repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('lists active memos with department and date-range filtering', async () => {
    (prisma.officeMemo.findMany as jest.Mock).mockResolvedValue([]);

    await listActiveOfficeMemosForEmployee({
      department: '  Finance ',
      fromDate: new Date('2026-04-01T05:00:00.000Z'),
      toDate: new Date('2026-04-30T08:00:00.000Z'),
    });

    expect(prisma.officeMemo.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        startDate: { lte: new Date('2026-04-30T00:00:00.000Z') },
        endDate: { gte: new Date('2026-04-01T00:00:00.000Z') },
        OR: [{ scope: 'all' }, { scope: 'department', departmentKeys: { has: 'finance' } }],
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        message: true,
        startDate: true,
        endDate: true,
        scope: true,
        departmentKeys: true,
        createdAt: true,
      },
    });
  });

  test('limits OR scope to global when department is not provided', async () => {
    (prisma.officeMemo.findMany as jest.Mock).mockResolvedValue([]);

    await listActiveOfficeMemosForEmployee({
      fromDate: new Date('2026-05-01T00:00:00.000Z'),
      toDate: new Date('2026-05-31T00:00:00.000Z'),
    });

    expect(prisma.officeMemo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ scope: 'all' }],
        }),
      })
    );
  });
});
