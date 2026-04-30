'use server';

import {
  approveEmployeeLeaveRequest,
  getEmployeeLeaveRequestByIdForAdmin,
  isHrApprovalRequiredForLeaveRequest,
  rejectEmployeeLeaveRequest,
} from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';
import { isHrAnnualApprover } from '@/lib/auth/admin-visibility';
import { revalidatePath } from 'next/cache';

type LeaveReviewActionResult = {
  success: boolean;
  message?: string;
};

async function assertOwnedLeaveRequestOrThrow(requestId: string) {
  const session = await requirePermission(PERMISSIONS.LEAVE_REQUESTS.EDIT);
  const leaveRequest = await getEmployeeLeaveRequestByIdForAdmin(requestId);
  const isHrApprover = isHrAnnualApprover(session.rolePolicy);

  if (!leaveRequest) {
    throw new Error('Leave request not found');
  }

  if (session.isSuperAdmin) {
    return { session, leaveRequest, approvalMode: 'superadmin' as const };
  }

  const requiresHrApproval = await isHrApprovalRequiredForLeaveRequest({
    reason: leaveRequest.reason,
    startDate: leaveRequest.startDate,
    endDate: leaveRequest.endDate,
  });

  if (requiresHrApproval && isHrApprover) {
    return { session, leaveRequest, approvalMode: 'hr' as const };
  }

  const accessContext = await resolveLeaveRequestAccessContext(session);
  if (
    !accessContext.isEmployeeVisible({
      id: leaveRequest.employee.id,
      role: leaveRequest.employee.role,
      department: leaveRequest.employee.department,
      officeId: leaveRequest.employee.officeId,
    })
  ) {
    throw new Error('Leave request not found');
  }

  return { session, leaveRequest, approvalMode: 'manager' as const };
}

export async function approveLeaveRequestAction(requestId: string, adminNote?: string): Promise<LeaveReviewActionResult> {
  try {
    const { session, approvalMode } = await assertOwnedLeaveRequestOrThrow(requestId);

    await approveEmployeeLeaveRequest({
      requestId,
      adminId: session.id,
      adminNote: adminNote?.trim() || undefined,
      approvalMode,
    });

    revalidatePath('/admin/leave-requests');
    revalidatePath(`/admin/leave-requests/${requestId}`);

    return { success: true };
  } catch (error) {
    console.error('approveLeaveRequestAction failed:', error);
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
    return { success: false, message: 'Failed to approve leave request' };
  }
}

export async function rejectLeaveRequestAction(requestId: string, adminNote: string): Promise<LeaveReviewActionResult> {
  const trimmedNote = adminNote.trim();

  if (!trimmedNote) {
    return { success: false, message: 'Rejection note is required' };
  }

  try {
    const { session } = await assertOwnedLeaveRequestOrThrow(requestId);

    await rejectEmployeeLeaveRequest({
      requestId,
      adminId: session.id,
      adminNote: trimmedNote,
    });

    revalidatePath('/admin/leave-requests');
    revalidatePath(`/admin/leave-requests/${requestId}`);

    return { success: true };
  } catch (error) {
    console.error('rejectLeaveRequestAction failed:', error);
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
    return { success: false, message: 'Failed to reject leave request' };
  }
}
