import { GET } from '../app/api/external/v1/check-ins/route';
import { getPaginatedCheckins } from '@repo/database';
import { NextRequest } from 'next/server';

jest.mock('@repo/database', () => ({
  getPaginatedCheckins: jest.fn(),
}));

describe('GET /api/external/v1/check-ins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated check-ins with valid parameters', async () => {
    const mockCheckins = [
      { id: '1', status: 'on_time', at: new Date(), employee: { id: 'e1', firstName: 'John' }, shift: { id: 's1', site: { name: 'Site A' } } },
    ];
    (getPaginatedCheckins as jest.Mock).mockResolvedValue({
      checkins: mockCheckins,
      totalCount: 1,
    });

    const req = new NextRequest(new URL('http://localhost/api/external/v1/check-ins?page=1&limit=10'));
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(1);
    expect(data.pagination.total).toBe(1);
  });

  test('applies filters correctly', async () => {
    (getPaginatedCheckins as jest.Mock).mockResolvedValue({
      checkins: [],
      totalCount: 0,
    });

    const req = new NextRequest(new URL('http://localhost/api/external/v1/check-ins?employeeId=e1&status=on_time'));
    await GET(req);

    expect(getPaginatedCheckins).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        employeeId: 'e1',
        status: 'on_time',
      }),
    }));
  });

  test('applies date filters correctly', async () => {
    (getPaginatedCheckins as jest.Mock).mockResolvedValue({
      checkins: [],
      totalCount: 0,
    });

    const startDate = '2025-01-01';
    const endDate = '2025-01-31';
    const req = new NextRequest(new URL(`http://localhost/api/external/v1/check-ins?startDate=${startDate}&endDate=${endDate}`));
    await GET(req);

    expect(getPaginatedCheckins).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        at: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
    }));
  });
});
