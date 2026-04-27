import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { cancelEmployeeLeaveRequestByEmployee } from '@repo/database';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const leaveRequest = await cancelEmployeeLeaveRequestByEmployee({
      requestId: id,
      employeeId: employee.id,
    });

    return NextResponse.json({ leaveRequest });
  } catch (error) {
    console.error('Error cancelling employee leave request:', error);
    if (error instanceof Error) {
      const status = error.message.includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
