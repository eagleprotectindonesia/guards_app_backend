jest.mock('../../../../packages/database/src/prisma/client', () => ({
  __esModule: true,
  db: {
    $transaction: jest.fn(),
  },
}));

const mockFindMany = jest.fn();
const mockCount = jest.fn();

const { db } = jest.requireMock('../../../../packages/database/src/prisma/client');
(db.$transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
  return cb({
    shiftPhotoReport: {
      findMany: mockFindMany,
      count: mockCount,
    },
  });
});

import { listShiftPhotoReportsPaginated } from '@repo/database';

describe('listShiftPhotoReportsPaginated sort', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  const baseParams = { page: 1, pageSize: 20 };

  test('defaults to createdAt desc when no sort params', async () => {
    await listShiftPhotoReportsPaginated(baseParams);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    );
  });

  test('defaults to createdAt desc with unknown sortBy', async () => {
    await listShiftPhotoReportsPaginated({ ...baseParams, sortBy: 'bogus', sortOrder: 'asc' });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } })
    );
  });

  test('falls back to desc with invalid sortOrder', async () => {
    await listShiftPhotoReportsPaginated({
      ...baseParams,
      sortBy: 'reportNumber',
      sortOrder: 'invalid' as 'asc' | 'desc',
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { reportNumber: 'desc' } })
    );
  });

  test('site asc', async () => {
    await listShiftPhotoReportsPaginated({ ...baseParams, sortBy: 'site', sortOrder: 'asc' });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { shift: { site: { name: 'asc' } } } })
    );
  });

  test('site desc', async () => {
    await listShiftPhotoReportsPaginated({ ...baseParams, sortBy: 'site', sortOrder: 'desc' });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { shift: { site: { name: 'desc' } } } })
    );
  });

  test('employee asc', async () => {
    await listShiftPhotoReportsPaginated({ ...baseParams, sortBy: 'employee', sortOrder: 'asc' });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { employee: { fullName: 'asc' } } })
    );
  });

  test('reportNumber desc', async () => {
    await listShiftPhotoReportsPaginated({ ...baseParams, sortBy: 'reportNumber', sortOrder: 'desc' });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { reportNumber: 'desc' } })
    );
  });

  test('passes through where, skip, take unchanged', async () => {
    const employeeId = 'emp-1';
    await listShiftPhotoReportsPaginated({ ...baseParams, employeeId, sortBy: 'site', sortOrder: 'asc' });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { employeeId },
        skip: 0,
        take: 20,
      })
    );
  });
});
