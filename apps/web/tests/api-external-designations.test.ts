import { GET } from '../app/api/external/v1/designations/route';
import { getPaginatedDesignations } from '@repo/database';
import { NextRequest } from 'next/server';

// Mock getPaginatedDesignations
jest.mock('@repo/database', () => ({
  getPaginatedDesignations: jest.fn(),
}));

describe('GET /api/external/v1/designations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated designations with valid parameters', async () => {
    const mockDesignations = [
      { id: '1', name: 'Guard', departmentId: 'dept-1' },
      { id: '2', name: 'Supervisor', departmentId: 'dept-1' },
    ];
    (getPaginatedDesignations as jest.Mock).mockResolvedValue({
      designations: mockDesignations,
      totalCount: 2,
    });

    const req = new NextRequest(new URL('http://localhost/api/external/v1/designations?page=1&limit=10'));
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(2);
    expect(data.pagination.total).toBe(2);
    expect(getPaginatedDesignations).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 10,
    }));
  });

  test('applies filters correctly', async () => {
    (getPaginatedDesignations as jest.Mock).mockResolvedValue({
      designations: [],
      totalCount: 0,
    });

    const req = new NextRequest(new URL('http://localhost/api/external/v1/designations?departmentId=dept-1&role=on_site'));
    await GET(req);

    expect(getPaginatedDesignations).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        departmentId: 'dept-1',
        role: 'on_site',
      }),
    }));
  });
});
