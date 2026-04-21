import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { createEmployeeLeaveRequestSchema } from '@repo/validations';
import { createEmployeeLeaveRequest, listEmployeeLeaveRequestsByEmployee } from '@repo/database';
import { ZodError } from 'zod';

export async function GET() {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const leaveRequests = await listEmployeeLeaveRequestsByEmployee(employee.id);
    return NextResponse.json({ leaveRequests });
  } catch (error) {
    console.error('Error fetching employee leave requests:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = createEmployeeLeaveRequestSchema.parse(await req.json());
    const leaveRequest = await createEmployeeLeaveRequest({
      employeeId: employee.id,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
    });

    return NextResponse.json({ leaveRequest }, { status: 201 });
  } catch (error) {
    console.error('Error creating employee leave request:', error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
