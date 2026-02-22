import { GET } from '../app/api/external/v1/attendance/route';
import { getPaginatedAttendance } from '@repo/database';
import { NextRequest } from 'next/server';

jest.mock('@repo/database', () => ({
  getPaginatedAttendance: jest.fn(),
}));

describe('GET /api/external/v1/attendance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated attendance with valid parameters', async () => {
    const mockAttendances = [
      { id: '1', status: 'present', recordedAt: new Date(), employee: { id: 'e1', fullName: 'John Doe' }, shift: { id: 's1', site: { name: 'Site A' } } },
    ];
    (getPaginatedAttendance as jest.Mock).mockResolvedValue({
      attendances: mockAttendances,
      totalCount: 1,
    });

    const req = new NextRequest(new URL('http://localhost/api/external/v1/attendance?page=1&limit=10'));
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(1);
    expect(data.pagination.total).toBe(1);
  });

  test('applies filters correctly', async () => {
    (getPaginatedAttendance as jest.Mock).mockResolvedValue({
      attendances: [],
      totalCount: 0,
    });

    const req = new NextRequest(new URL('http://localhost/api/external/v1/attendance?employeeId=e1&status=present'));
    await GET(req);

    expect(getPaginatedAttendance).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        employeeId: 'e1',
        status: 'present',
      }),
    }));
  });

  test('applies date filters correctly', async () => {
    (getPaginatedAttendance as jest.Mock).mockResolvedValue({
      attendances: [],
      totalCount: 0,
    });

    const startDate = '2025-01-01';
    const endDate = '2025-01-31';
    const req = new NextRequest(new URL(`http://localhost/api/external/v1/attendance?startDate=${startDate}&endDate=${endDate}`));
    await GET(req);

    expect(getPaginatedAttendance).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        recordedAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
    }));
  });
});
