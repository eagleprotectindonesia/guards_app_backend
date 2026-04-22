import { GET as listLeaveRequests } from '../app/api/admin/leave-requests/route';
import { POST as approveLeaveRequest } from '../app/api/admin/leave-requests/[id]/approve/route';
import { POST as rejectLeaveRequest } from '../app/api/admin/leave-requests/[id]/reject/route';
import {
  approveEmployeeLeaveRequest,
  listEmployeeLeaveRequestsForAdmin,
  prisma,
  rejectEmployeeLeaveRequest,
} from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';

jest.mock('@repo/database', () => ({
  listEmployeeLeaveRequestsForAdmin: jest.fn(),
  approveEmployeeLeaveRequest: jest.fn(),
  rejectEmployeeLeaveRequest: jest.fn(),
  prisma: {
    employeeLeaveRequest: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/admin-auth', () => ({
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/auth/leave-ownership', () => ({
  resolveLeaveRequestAccessContext: jest.fn(),
}));

describe('admin leave requests API ownership enforcement', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    (requirePermission as jest.Mock).mockResolvedValue({
      id: 'admin-1',
      rolePolicy: {
        employees: { scope: 'all' },
        attendance: { scope: 'all' },
      },
      isSuperAdmin: false,
    });
  });

  test('GET /api/admin/leave-requests returns only owned employees and strips ownership fields', async () => {
    (resolveLeaveRequestAccessContext as jest.Mock).mockResolvedValue({
      mode: 'ownership_scope',
      employeeRoleFilter: undefined,
      includeFallbackQueue: false,
      isEmployeeVisible: ({ id }: { id: string }) => id === 'employee-1',
    });

    (listEmployeeLeaveRequestsForAdmin as jest.Mock).mockResolvedValue([
      {
        id: 'leave-1',
        employeeId: 'employee-1',
        status: 'pending',
        createdAt: new Date('2026-04-21T10:00:00.000Z'),
        updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        startDate: new Date('2026-04-25T00:00:00.000Z'),
        endDate: new Date('2026-04-26T00:00:00.000Z'),
        employee: {
          id: 'employee-1',
          fullName: 'Jane Doe',
          employeeNumber: 'EMP-1',
          role: 'office',
          department: 'operations',
          officeId: 'office-1',
        },
        reviewedBy: null,
      },
      {
        id: 'leave-2',
        employeeId: 'employee-2',
        status: 'pending',
        createdAt: new Date('2026-04-21T10:00:00.000Z'),
        updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        startDate: new Date('2026-04-25T00:00:00.000Z'),
        endDate: new Date('2026-04-26T00:00:00.000Z'),
        employee: {
          id: 'employee-2',
          fullName: 'John Doe',
          employeeNumber: 'EMP-2',
          role: 'office',
          department: 'finance',
          officeId: 'office-2',
        },
        reviewedBy: null,
      },
    ]);

    const response = await listLeaveRequests(new Request('http://localhost/api/admin/leave-requests'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.leaveRequests).toHaveLength(1);
    expect(body.leaveRequests[0].employee).toEqual({
      id: 'employee-1',
      fullName: 'Jane Doe',
      employeeNumber: 'EMP-1',
      role: 'office',
    });
    expect(listEmployeeLeaveRequestsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ employeeRoleFilter: undefined })
    );
  });

  test('POST /approve denies non-owned leave request', async () => {
    (resolveLeaveRequestAccessContext as jest.Mock).mockResolvedValue({
      mode: 'ownership_scope',
      employeeRoleFilter: undefined,
      includeFallbackQueue: false,
      isEmployeeVisible: () => false,
    });

    (prisma.employeeLeaveRequest.findUnique as jest.Mock).mockResolvedValue({
      id: 'leave-1',
      employee: {
        id: 'employee-1',
        role: 'office',
        department: 'operations',
        officeId: 'office-1',
      },
    });

    const response = await approveLeaveRequest(
      new Request('http://localhost/api/admin/leave-requests/leave-1/approve', {
        method: 'POST',
      body: JSON.stringify({ adminNote: 'ok' }),
      }),
      { params: Promise.resolve({ id: 'leave-1' }) }
    );

    expect(response.status).toBe(404);
    expect(approveEmployeeLeaveRequest).not.toHaveBeenCalled();
  });

  test('POST /reject allows owned leave request', async () => {
    (resolveLeaveRequestAccessContext as jest.Mock).mockResolvedValue({
      mode: 'ownership_scope',
      employeeRoleFilter: undefined,
      includeFallbackQueue: false,
      isEmployeeVisible: () => true,
    });

    (prisma.employeeLeaveRequest.findUnique as jest.Mock).mockResolvedValue({
      id: 'leave-1',
      employee: {
        id: 'employee-1',
        role: 'office',
        department: 'operations',
        officeId: 'office-1',
      },
    });

    (rejectEmployeeLeaveRequest as jest.Mock).mockResolvedValue({
      id: 'leave-1',
      status: 'rejected',
    });

    const response = await rejectLeaveRequest(
      new Request('http://localhost/api/admin/leave-requests/leave-1/reject', {
        method: 'POST',
      body: JSON.stringify({ adminNote: 'not approved' }),
      }),
      { params: Promise.resolve({ id: 'leave-1' }) }
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.leaveRequest).toEqual({ id: 'leave-1', status: 'rejected' });
    expect(rejectEmployeeLeaveRequest).toHaveBeenCalledWith({
      requestId: 'leave-1',
      adminId: 'admin-1',
      adminNote: 'not approved',
    });
  });
});
