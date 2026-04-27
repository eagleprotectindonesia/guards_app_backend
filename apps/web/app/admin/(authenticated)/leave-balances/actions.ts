'use server';

import { adjustEmployeeAnnualLeaveBalance, db } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';
import { revalidatePath } from 'next/cache';

type LeaveBalanceActionResult = {
  success: boolean;
  message?: string;
};

async function assertOwnedEmployeeOrThrow(employeeId: string) {
  const session = await requirePermission(PERMISSIONS.LEAVE_REQUESTS.EDIT);
  const accessContext = await resolveLeaveRequestAccessContext(session);
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      role: true,
      department: true,
      officeId: true,
    },
  });

  if (
    !employee ||
    !accessContext.isEmployeeVisible({
      id: employee.id,
      role: employee.role,
      department: employee.department,
      officeId: employee.officeId,
    })
  ) {
    throw new Error('Employee not found');
  }

  return session;
}

export async function adjustAnnualLeaveBalanceAction(params: {
  employeeId: string;
  year: number;
  days: number;
  note: string;
}): Promise<LeaveBalanceActionResult> {
  try {
    const session = await assertOwnedEmployeeOrThrow(params.employeeId);

    await adjustEmployeeAnnualLeaveBalance({
      employeeId: params.employeeId,
      year: params.year,
      days: params.days,
      note: params.note,
      adminId: session.id,
    });

    revalidatePath('/admin/leave-balances');
    revalidatePath(`/admin/employees/${params.employeeId}/edit`);

    return {
      success: true,
      message: 'Annual leave balance adjusted successfully.',
    };
  } catch (error) {
    console.error('adjustAnnualLeaveBalanceAction failed:', error);
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
    return { success: false, message: 'Failed to adjust annual leave balance' };
  }
}
