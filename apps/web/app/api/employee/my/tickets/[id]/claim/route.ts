import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getTicketById, claimTicket } from '@repo/database';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const ticketId = resolvedParams.id;
    const ticket = await getTicketById(ticketId);

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Verify employee assignment
    const isAssigned = ticket.assignedEmployees.some(ae => ae.employeeId === employee.id);
    if (!isAssigned) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await claimTicket({
      ticketId,
      actorEmployeeId: employee.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error claiming ticket:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
