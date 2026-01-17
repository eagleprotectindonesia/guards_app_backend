import { GET } from '../app/api/external/v1/employees/route';
import { getPaginatedEmployees } from '@repo/database';
import { NextRequest } from 'next/server';

// Mock getPaginatedEmployees
jest.mock('@repo/database', () => ({
  getPaginatedEmployees: jest.fn(),
}));

describe('GET /api/external/v1/employees', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated employees with valid parameters', async () => {
    const mockEmployees = [
      { id: '1', firstName: 'John', lastName: 'Doe', status: true },
      { id: '2', firstName: 'Jane', lastName: 'Smith', status: true },
    ];
    (getPaginatedEmployees as jest.Mock).mockResolvedValue({
      employees: mockEmployees,
      totalCount: 2,
    });

    const req = new NextRequest(new URL('http://localhost/api/external/v1/employees?page=1&limit=10'));
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(2);
    expect(data.pagination.total).toBe(2);
    expect(getPaginatedEmployees).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 10,
    }));
  });

  test('applies filters correctly', async () => {
    (getPaginatedEmployees as jest.Mock).mockResolvedValue({
      employees: [],
      totalCount: 0,
    });

    const req = new NextRequest(new URL('http://localhost/api/external/v1/employees?departmentId=dept-1&status=true'));
    await GET(req);

    expect(getPaginatedEmployees).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        departmentId: 'dept-1',
        status: true,
      }),
    }));
  });

  test('handles invalid status filter', async () => {
    const req = new NextRequest(new URL('http://localhost/api/external/v1/employees?status=not-a-bool'));
    const response = await GET(req);
    // Should either ignore invalid status or return 400. 
    // Usually, it's better to just ignore or default if it's not critical.
    // Let's expect it to still work but maybe without that filter.
    expect(response.status).toBe(200);
  });
});
