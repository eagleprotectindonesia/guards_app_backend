import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { createEmployeeLeaveRequestSchema } from '@repo/validations';
import {
  BUSINESS_TIMEZONE,
  createEmployeeLeaveRequest,
  getEmployeeAnnualLeaveBalanceForYear,
  listEmployeeLeaveRequestsByEmployee,
  OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR,
} from '@repo/database';
import { ZodError } from 'zod';

function getCurrentBusinessYear(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIMEZONE,
      year: 'numeric',
    }).format(now)
  );
}

export async function GET() {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const year = getCurrentBusinessYear();
    const [leaveRequests, annualLeaveBalance] = await Promise.all([
      listEmployeeLeaveRequestsByEmployee(employee.id),
      getEmployeeAnnualLeaveBalanceForYear(employee.id, year),
    ]);
    return NextResponse.json({ leaveRequests, annualLeaveBalance });
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
      employeeNote: body.employeeNote,
      attachments: body.attachments,
    });

    return NextResponse.json({ leaveRequest }, { status: 201 });
  } catch (error) {
    console.error('Error creating employee leave request:', error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof Error) {
      if (error.message === OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR) {
        return NextResponse.json({ error: OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
