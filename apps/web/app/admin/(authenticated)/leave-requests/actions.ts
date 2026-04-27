'use server';

import { approveEmployeeLeaveRequest, getEmployeeLeaveRequestByIdForAdmin, rejectEmployeeLeaveRequest } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';
import { revalidatePath } from 'next/cache';

type LeaveReviewActionResult = {
  success: boolean;
  message?: string;
};

async function assertOwnedLeaveRequestOrThrow(requestId: string) {
  const session = await requirePermission(PERMISSIONS.LEAVE_REQUESTS.EDIT);
  const accessContext = await resolveLeaveRequestAccessContext(session);
  const leaveRequest = await getEmployeeLeaveRequestByIdForAdmin(requestId);

  if (
    !leaveRequest ||
    !accessContext.isEmployeeVisible({
      id: leaveRequest.employee.id,
      role: leaveRequest.employee.role,
      department: leaveRequest.employee.department,
      officeId: leaveRequest.employee.officeId,
    })
  ) {
    throw new Error('Leave request not found');
  }

  return session;
}

export async function approveLeaveRequestAction(requestId: string, adminNote?: string): Promise<LeaveReviewActionResult> {
  try {
    const session = await assertOwnedLeaveRequestOrThrow(requestId);

    await approveEmployeeLeaveRequest({
      requestId,
      adminId: session.id,
      adminNote: adminNote?.trim() || undefined,
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
    const session = await assertOwnedLeaveRequestOrThrow(requestId);

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

