import {
  createOfficeMemo,
  deleteOfficeMemo,
  listActiveOfficeMemosForEmployee,
  listOfficeMemos,
  updateOfficeMemo,
} from './office-memos';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    changelog: {
      create: jest.fn(),
    },
    officeMemo: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('office memos repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('lists office memos for admin view sorted by startDate and updatedAt', async () => {
    (prisma.officeMemo.findMany as jest.Mock).mockResolvedValue([]);

    await listOfficeMemos();

    expect(prisma.officeMemo.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ startDate: 'desc' }, { updatedAt: 'desc' }],
      include: {
        createdBy: { select: { name: true } },
        lastUpdatedBy: { select: { name: true } },
      },
    });
  });

  test('creates memo with normalized department keys and changelog', async () => {
    (prisma.officeMemo.create as jest.Mock).mockResolvedValue({ id: 'memo-1' });

    await createOfficeMemo(
      {
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        title: '  Memo Title  ',
        message: '  Keep clean  ',
        scope: 'department',
        departmentKeys: [' Finance ', 'finance', 'HR'],
        isActive: true,
      },
      'admin-1'
    );

    expect(prisma.officeMemo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: '  Memo Title  ',
        message: 'Keep clean',
        scope: 'department',
        departmentKeys: ['finance', 'hr'],
        isActive: true,
        createdById: 'admin-1',
        lastUpdatedById: 'admin-1',
      }),
    });
    expect(prisma.changelog.create).toHaveBeenCalled();
  });

  test('rejects invalid date range', async () => {
    await expect(
      createOfficeMemo({
        startDate: '2026-05-10',
        endDate: '2026-05-01',
        title: 'Invalid',
        scope: 'all',
        isActive: true,
      })
    ).rejects.toThrow('endDate must be on or after startDate');
  });

  test('updates memo and sets lastUpdatedById', async () => {
    (prisma.officeMemo.update as jest.Mock).mockResolvedValue({ id: 'memo-1' });

    await updateOfficeMemo(
      'memo-1',
      {
        startDate: '2026-05-01',
        endDate: '2026-05-20',
        title: 'Updated',
        message: '',
        scope: 'all',
        departmentKeys: [],
        isActive: false,
      },
      'admin-2'
    );

    expect(prisma.officeMemo.update).toHaveBeenCalledWith({
      where: { id: 'memo-1' },
      data: expect.objectContaining({
        title: 'Updated',
        message: null,
        scope: 'all',
        departmentKeys: [],
        isActive: false,
        lastUpdatedById: 'admin-2',
      }),
    });
    expect(prisma.changelog.create).toHaveBeenCalled();
  });

  test('deletes memo when found and writes changelog', async () => {
    (prisma.officeMemo.findUnique as jest.Mock).mockResolvedValue({
      id: 'memo-2',
      title: 'Delete me',
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: new Date('2026-05-02T00:00:00.000Z'),
      scope: 'all',
      isActive: true,
    });
    (prisma.officeMemo.delete as jest.Mock).mockResolvedValue({ id: 'memo-2' });

    await deleteOfficeMemo('memo-2', 'admin-1');

    expect(prisma.officeMemo.delete).toHaveBeenCalledWith({ where: { id: 'memo-2' } });
    expect(prisma.changelog.create).toHaveBeenCalled();
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
});
