import { approveLeaveRequestAction, rejectLeaveRequestAction } from '../app/admin/(authenticated)/leave-requests/actions';
import {
  approveEmployeeLeaveRequest,
  getEmployeeLeaveRequestByIdForAdmin,
  isHrApprovalRequiredForLeaveRequest,
  rejectEmployeeLeaveRequest,
} from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';

jest.mock('@repo/database', () => ({
  approveEmployeeLeaveRequest: jest.fn(),
  rejectEmployeeLeaveRequest: jest.fn(),
  getEmployeeLeaveRequestByIdForAdmin: jest.fn(),
  isHrApprovalRequiredForLeaveRequest: jest.fn(),
}));

jest.mock('@/lib/admin-auth', () => ({
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/auth/leave-ownership', () => ({
  resolveLeaveRequestAccessContext: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

describe('admin leave request server actions', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    (requirePermission as jest.Mock).mockResolvedValue({
      id: 'admin-1',
      isSuperAdmin: false,
      permissions: ['leave-requests:edit'],
      rolePolicy: {
        employees: { scope: 'all' },
        attendance: { scope: 'all' },
        leaveRequests: { annualApprover: 'manager' },
      },
    });

    (resolveLeaveRequestAccessContext as jest.Mock).mockResolvedValue({
      isEmployeeVisible: () => true,
    });

    (getEmployeeLeaveRequestByIdForAdmin as jest.Mock).mockResolvedValue({
      id: 'leave-1',
      reason: 'annual',
      startDate: new Date('2026-04-10T00:00:00Z'),
      endDate: new Date('2026-04-12T00:00:00Z'),
      employee: {
        id: 'employee-1',
        role: 'office',
        department: 'ops',
        officeId: 'office-1',
      },
    });
    (isHrApprovalRequiredForLeaveRequest as jest.Mock).mockResolvedValue(true);
  });

  test('approves leave request when owned', async () => {
    const result = await approveLeaveRequestAction('leave-1', 'approved');

    expect(result).toEqual({ success: true });
    expect(approveEmployeeLeaveRequest).toHaveBeenCalledWith({
      requestId: 'leave-1',
      adminId: 'admin-1',
      adminNote: 'approved',
      approvalMode: 'manager',
    });
  });

  test('allows HR approver to approve HR-required leave without ownership', async () => {
    (requirePermission as jest.Mock).mockResolvedValueOnce({
      id: 'admin-hr',
      isSuperAdmin: false,
      permissions: ['leave-requests:edit'],
      rolePolicy: {
        employees: { scope: 'all' },
        attendance: { scope: 'all' },
        leaveRequests: { annualApprover: 'hr' },
      },
    });
    (resolveLeaveRequestAccessContext as jest.Mock).mockResolvedValueOnce({
      isEmployeeVisible: () => false,
    });
    (isHrApprovalRequiredForLeaveRequest as jest.Mock).mockResolvedValueOnce(true);

    const result = await approveLeaveRequestAction('leave-1', 'hr approved');

    expect(result).toEqual({ success: true });
    expect(approveEmployeeLeaveRequest).toHaveBeenCalledWith({
      requestId: 'leave-1',
      adminId: 'admin-hr',
      adminNote: 'hr approved',
      approvalMode: 'hr',
    });
  });

  test('blocks HR approver from approving non-HR-required leave', async () => {
    (requirePermission as jest.Mock).mockResolvedValueOnce({
      id: 'admin-hr',
      isSuperAdmin: false,
      permissions: ['leave-requests:edit'],
      rolePolicy: {
        employees: { scope: 'all' },
        attendance: { scope: 'all' },
        leaveRequests: { annualApprover: 'hr' },
      },
    });
    (isHrApprovalRequiredForLeaveRequest as jest.Mock).mockResolvedValueOnce(false);

    const result = await approveLeaveRequestAction('leave-1', 'hr attempt');

    expect(result).toEqual({
      success: false,
      message: 'Non-HR leave must be reviewed by manager ownership',
    });
    expect(approveEmployeeLeaveRequest).not.toHaveBeenCalled();
  });

  test('superadmin uses manager approval mode', async () => {
    (requirePermission as jest.Mock).mockResolvedValueOnce({
      id: 'super-admin-1',
      isSuperAdmin: true,
      permissions: ['leave-requests:edit'],
      rolePolicy: {
        employees: { scope: 'all' },
        attendance: { scope: 'all' },
        leaveRequests: { annualApprover: 'manager' },
      },
    });

    const result = await approveLeaveRequestAction('leave-1', 'superadmin approves');

    expect(result).toEqual({ success: true });
    expect(approveEmployeeLeaveRequest).toHaveBeenCalledWith({
      requestId: 'leave-1',
      adminId: 'super-admin-1',
      adminNote: 'superadmin approves',
      approvalMode: 'manager',
    });
  });

  test('returns domain policy error from approval', async () => {
    (approveEmployeeLeaveRequest as jest.Mock).mockRejectedValueOnce(new Error('Insufficient annual leave balance'));

    const result = await approveLeaveRequestAction('leave-1', 'approved');

    expect(result).toEqual({ success: false, message: 'Insufficient annual leave balance' });
  });

  test('returns error for non-owned leave request', async () => {
    (resolveLeaveRequestAccessContext as jest.Mock).mockResolvedValue({
      isEmployeeVisible: () => false,
    });

    const result = await approveLeaveRequestAction('leave-1', 'approved');

    expect(result.success).toBe(false);
    expect(result.message).toBe('Leave request not found');
    expect(approveEmployeeLeaveRequest).not.toHaveBeenCalled();
  });

  test('reject requires note', async () => {
    const result = await rejectLeaveRequestAction('leave-1', '   ');

    expect(result.success).toBe(false);
    expect(result.message).toBe('Rejection note is required');
    expect(rejectEmployeeLeaveRequest).not.toHaveBeenCalled();
  });

  test('rejects leave request when note is present', async () => {
    const result = await rejectLeaveRequestAction('leave-1', 'not eligible');

    expect(result.success).toBe(true);
    expect(rejectEmployeeLeaveRequest).toHaveBeenCalledWith({
      requestId: 'leave-1',
      adminId: 'admin-1',
      adminNote: 'not eligible',
    });
  });

  test('blocks HR approver from rejecting non-HR-required leave', async () => {
    (requirePermission as jest.Mock).mockResolvedValueOnce({
      id: 'admin-hr',
      isSuperAdmin: false,
      permissions: ['leave-requests:edit'],
      rolePolicy: {
        employees: { scope: 'all' },
        attendance: { scope: 'all' },
        leaveRequests: { annualApprover: 'hr' },
      },
    });
    (isHrApprovalRequiredForLeaveRequest as jest.Mock).mockResolvedValueOnce(false);

    const result = await rejectLeaveRequestAction('leave-1', 'hr reject attempt');

    expect(result).toEqual({
      success: false,
      message: 'Non-HR leave must be reviewed by manager ownership',
    });
    expect(rejectEmployeeLeaveRequest).not.toHaveBeenCalled();
  });
});
