import { GET } from '../app/api/external/v1/departments/route';
import { getPaginatedDepartments } from '@repo/database';
import { NextRequest } from 'next/server';

// Mock getPaginatedDepartments
jest.mock('@repo/database', () => ({
  getPaginatedDepartments: jest.fn(),
}));

describe('GET /api/external/v1/departments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated departments with valid parameters', async () => {
    const mockDepartments = [
      { id: '1', name: 'Operations' },
      { id: '2', name: 'HR' },
    ];
    (getPaginatedDepartments as jest.Mock).mockResolvedValue({
      departments: mockDepartments,
      totalCount: 2,
    });

    const req = new NextRequest(new URL('http://localhost/api/external/v1/departments?page=1&limit=10'));
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(2);
    expect(data.pagination.total).toBe(2);
    expect(getPaginatedDepartments).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 10,
    }));
  });

  test('applies search filter correctly', async () => {
    (getPaginatedDepartments as jest.Mock).mockResolvedValue({
      departments: [],
      totalCount: 0,
    });

    const req = new NextRequest(new URL('http://localhost/api/external/v1/departments?search=ops'));
    await GET(req);

    expect(getPaginatedDepartments).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { name: { contains: 'ops', mode: 'insensitive' } },
          { id: { contains: 'ops', mode: 'insensitive' } },
        ],
      }),
    }));
  });
});
