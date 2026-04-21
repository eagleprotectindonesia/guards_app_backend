import { NextResponse } from 'next/server';
import { listEmployeeLeaveRequestsForAdmin } from '@repo/database';
import { LeaveRequestStatus } from '@prisma/client';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';

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
    const accessContext = await resolveLeaveRequestAccessContext(session);

    const leaveRequests = await listEmployeeLeaveRequestsForAdmin({
      statuses,
      employeeId,
      startDate,
      endDate,
      employeeRoleFilter: accessContext.employeeRoleFilter,
    });

    const visibleLeaveRequests = leaveRequests
      .filter(request =>
        accessContext.isEmployeeVisible({
          id: request.employee.id,
          role: request.employee.role,
          department: request.employee.department,
          officeId: request.employee.officeId,
        })
      )
      .map(({ employee, ...request }) => ({
        ...request,
        employee: {
          id: employee.id,
          fullName: employee.fullName,
          employeeNumber: employee.employeeNumber,
          role: employee.role,
        },
      }));

    return NextResponse.json({ leaveRequests: visibleLeaveRequests });
  } catch (error) {
    console.error('Error listing leave requests:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
