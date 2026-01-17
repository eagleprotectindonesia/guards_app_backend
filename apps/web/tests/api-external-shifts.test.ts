import { GET } from '../app/api/external/v1/shifts/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

// Mock prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    shift: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe('GET /api/external/v1/shifts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated shifts', async () => {
    const mockShifts = [
      { id: 'shift-1', status: 'scheduled' },
      { id: 'shift-2', status: 'in_progress' },
    ];
    (prisma.shift.findMany as jest.Mock).mockResolvedValue(mockShifts);
    (prisma.shift.count as jest.Mock).mockResolvedValue(2);

    const req = new NextRequest(new URL('http://localhost/api/external/v1/shifts?page=1&limit=5'));
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(2);
    expect(prisma.shift.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 5,
    }));
  });

  test('applies date range filters', async () => {
    (prisma.shift.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.shift.count as jest.Mock).mockResolvedValue(0);

    const startDate = '2026-01-01';
    const endDate = '2026-01-31';
    const req = new NextRequest(new URL(`http://localhost/api/external/v1/shifts?startDate=${startDate}&endDate=${endDate}`));
    await GET(req);

    expect(prisma.shift.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        date: {
          gte: expect.any(Date),
          lte: expect.any(Date),
        },
      }),
    }));
  });
});
