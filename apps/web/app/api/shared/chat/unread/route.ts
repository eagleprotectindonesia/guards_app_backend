import { NextResponse } from 'next/server';
import { getUnreadCount } from '@/lib/data-access/chat';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getCurrentAdmin, requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  const employee = await getAuthenticatedEmployee();

  if (!admin && !employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedRole = searchParams.get('role');

  try {
    if (admin) {
      await requirePermission(PERMISSIONS.CHAT.VIEW);
    }

    // If role is specified, prioritize that role if authenticated
    const isAdmin = requestedRole === 'admin' ? !!admin : requestedRole === 'employee' ? false : !!admin;
    const targetEmployeeId = requestedRole === 'employee' && employee ? employee.id : admin ? undefined : employee?.id;

    const count = await getUnreadCount({
      employeeId: targetEmployeeId,
      isAdmin: isAdmin,
      adminId: isAdmin ? admin?.id : undefined,
    });
    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
