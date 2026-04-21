import { NextResponse } from 'next/server';
import { listEmployeeLeaveRequestsForAdmin } from '@repo/database';
import { LeaveRequestStatus } from '@prisma/client';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getEmployeeRoleFilter } from '@/lib/auth/admin-visibility';

const ALLOWED_STATUSES = new Set<LeaveRequestStatus>(['pending', 'approved', 'rejected', 'cancelled']);

export async function GET(req: Request) {
  const session = await requirePermission(PERMISSIONS.LEAVE_REQUESTS.VIEW);

  try {
    const { searchParams } = new URL(req.url);

    const statusesParam = searchParams.get('statuses');
    const statuses = statusesParam
      ? statusesParam
          .split(',')
          .map(s => s.trim())
          .filter((status): status is LeaveRequestStatus => ALLOWED_STATUSES.has(status as LeaveRequestStatus))
      : undefined;

    const employeeId = searchParams.get('employeeId') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const employeeRoleFilter = getEmployeeRoleFilter(session.rolePolicy);

    const leaveRequests = await listEmployeeLeaveRequestsForAdmin({
      statuses,
      employeeId,
      startDate,
      endDate,
      employeeRoleFilter,
    });

    return NextResponse.json({ leaveRequests });
  } catch (error) {
    console.error('Error listing leave requests:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
