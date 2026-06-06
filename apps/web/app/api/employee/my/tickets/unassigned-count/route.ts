import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { db } from '@repo/database';

export async function GET() {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const count = await db.ticket.count({
      where: {
        assignedEmployees: {
          some: { employeeId: employee.id },
        },
        claimedByEmployeeId: null,
        status: { notIn: ['CLOSED', 'SOLVED', 'CANNOT_RESOLVE'] },
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error fetching unassigned tickets count:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
