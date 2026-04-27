import { POST } from '../app/api/employee/my/leave-requests/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { createEmployeeLeaveRequest, OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR } from '@repo/database';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  createEmployeeLeaveRequest: jest.fn(),
  listEmployeeLeaveRequestsByEmployee: jest.fn(),
  OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR: 'Overlapping pending leave request already exists',
}));

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      json: jest.fn((body, init) => ({
        json: async () => body,
        status: init?.status || 200,
      })),
    },
  };
});

describe('POST /api/employee/my/leave-requests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 when employee is not authenticated', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(null);

    const req = new Request('http://localhost/api/employee/my/leave-requests', {
      method: 'POST',
      body: JSON.stringify({
        startDate: '2026-04-10',
        endDate: '2026-04-12',
        reason: 'sick',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(createEmployeeLeaveRequest).not.toHaveBeenCalled();
  });

  test('returns 400 when overlapping pending request exists', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: 'employee-1' });
    (createEmployeeLeaveRequest as jest.Mock).mockRejectedValue(new Error(OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR));

    const req = new Request('http://localhost/api/employee/my/leave-requests', {
      method: 'POST',
      body: JSON.stringify({
        startDate: '2026-04-10',
        endDate: '2026-04-12',
        reason: 'sick',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe(OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR);
  });

  test('returns 201 when request is created', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: 'employee-1' });
    (createEmployeeLeaveRequest as jest.Mock).mockResolvedValue({
      id: 'leave-1',
      employeeId: 'employee-1',
      status: 'pending',
    });

    const req = new Request('http://localhost/api/employee/my/leave-requests', {
      method: 'POST',
      body: JSON.stringify({
        startDate: '2026-04-10',
        endDate: '2026-04-12',
        reason: 'sick',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.leaveRequest).toMatchObject({ id: 'leave-1' });
    expect(createEmployeeLeaveRequest).toHaveBeenCalledWith({
      employeeId: 'employee-1',
      startDate: '2026-04-10',
      endDate: '2026-04-12',
      reason: 'sick',
      employeeNote: undefined,
      attachments: undefined,
    });
  });
});
