import { GET } from '../app/api/external/v1/sites/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

// Mock prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    site: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe('GET /api/external/v1/sites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated sites', async () => {
    const mockSites = [
      { id: 'site-1', name: 'Site One', status: true },
      { id: 'site-2', name: 'Site Two', status: true },
    ];
    (prisma.site.findMany as jest.Mock).mockResolvedValue(mockSites);
    (prisma.site.count as jest.Mock).mockResolvedValue(2);

    const req = new NextRequest(new URL('http://localhost/api/external/v1/sites?page=1&limit=5'));
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(2);
    expect(data.pagination.total).toBe(2);
    expect(prisma.site.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 5,
    }));
  });

  test('applies status filter', async () => {
    (prisma.site.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.site.count as jest.Mock).mockResolvedValue(0);

    const req = new NextRequest(new URL('http://localhost/api/external/v1/sites?status=false'));
    await GET(req);

    expect(prisma.site.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: false,
      }),
    }));
  });
});
