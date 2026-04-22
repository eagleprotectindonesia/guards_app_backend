import { NextResponse } from 'next/server';
import { approveEmployeeLeaveRequest, prisma } from '@repo/database';
import { reviewEmployeeLeaveRequestSchema } from '@repo/validations';
import { ZodError } from 'zod';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(PERMISSIONS.LEAVE_REQUESTS.EDIT);
  const { id } = await params;

  try {
    const body = reviewEmployeeLeaveRequestSchema.parse(await req.json());
    const accessContext = await resolveLeaveRequestAccessContext(session);

    const request = await prisma.employeeLeaveRequest.findUnique({
      where: { id },
      include: { employee: { select: { id: true, role: true, department: true, officeId: true } } },
    });

    if (
      !request ||
      !accessContext.isEmployeeVisible({
        id: request.employee.id,
        role: request.employee.role,
        department: request.employee.department,
        officeId: request.employee.officeId,
      })
    ) {
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
    }

    const leaveRequest = await approveEmployeeLeaveRequest({
      requestId: id,
      adminId: session.id,
      adminNote: body.adminNote,
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
