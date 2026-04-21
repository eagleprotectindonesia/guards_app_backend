import { NextResponse } from 'next/server';
import { approveEmployeeLeaveRequest, prisma } from '@repo/database';
import { reviewEmployeeLeaveRequestSchema } from '@repo/validations';
import { ZodError } from 'zod';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getEmployeeRoleFilter } from '@/lib/auth/admin-visibility';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(PERMISSIONS.LEAVE_REQUESTS.EDIT);
  const { id } = await params;

  try {
    const body = reviewEmployeeLeaveRequestSchema.parse(await req.json());

    const employeeRoleFilter = getEmployeeRoleFilter(session.rolePolicy);
    if (employeeRoleFilter) {
      const request = await prisma.employeeLeaveRequest.findUnique({
        where: { id },
        include: { employee: { select: { role: true } } },
      });

      if (!request || request.employee.role !== employeeRoleFilter) {
        return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
      }
    }

    const leaveRequest = await approveEmployeeLeaveRequest({
      requestId: id,
      adminId: session.id,
      reviewNote: body.reviewNote,
    });

    return NextResponse.json({ leaveRequest });
  } catch (error) {
    console.error('Error approving leave request:', error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof Error) {
      const status = error.message.includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
