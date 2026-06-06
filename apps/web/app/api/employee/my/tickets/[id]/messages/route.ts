import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getTicketById, addEmployeeTicketMessage } from '@repo/database';

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

    const bodyData = await req.json();
    const messageBody = bodyData.body?.trim();

    if (!messageBody) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
    }

    const message = await addEmployeeTicketMessage({
      ticketId,
      employeeId: employee.id,
      body: messageBody,
    });

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('Error adding ticket message:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
