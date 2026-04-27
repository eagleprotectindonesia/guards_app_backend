import { approveLeaveRequestAction, rejectLeaveRequestAction } from '../app/admin/(authenticated)/leave-requests/actions';
import {
  approveEmployeeLeaveRequest,
  getEmployeeLeaveRequestByIdForAdmin,
  rejectEmployeeLeaveRequest,
} from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';

jest.mock('@repo/database', () => ({
  approveEmployeeLeaveRequest: jest.fn(),
  rejectEmployeeLeaveRequest: jest.fn(),
  getEmployeeLeaveRequestByIdForAdmin: jest.fn(),
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
    });

    (resolveLeaveRequestAccessContext as jest.Mock).mockResolvedValue({
      isEmployeeVisible: () => true,
    });

    (getEmployeeLeaveRequestByIdForAdmin as jest.Mock).mockResolvedValue({
      id: 'leave-1',
      employee: {
        id: 'employee-1',
        role: 'office',
        department: 'ops',
        officeId: 'office-1',
      },
    });
  });

  test('approves leave request when owned', async () => {
    const result = await approveLeaveRequestAction('leave-1', 'approved');

    expect(result).toEqual({ success: true });
    expect(approveEmployeeLeaveRequest).toHaveBeenCalledWith({
      requestId: 'leave-1',
      adminId: 'admin-1',
      adminNote: 'approved',
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
});
