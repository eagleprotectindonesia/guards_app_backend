import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getTicketById, addEmployeeTicketMessage, addEmployeeTicketMessageWithAttachments } from '@repo/database';
import { ticketMessageWithAttachmentsCreateSchema } from '@repo/validations';

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
    const parsed = ticketMessageWithAttachmentsCreateSchema.safeParse({
      ticketId,
      body: bodyData.body,
      attachments: bodyData.attachments || [],
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid message payload' },
        { status: 400 }
      );
    }

    // Validate key prefix for attachments
    const env = process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV || 'development';
    const keyPrefix = `tickets/env=${env}/ticket_${ticketId}/`;
    const invalidKey = parsed.data.attachments.find(attachment => !attachment.s3Key.startsWith(keyPrefix));
    if (invalidKey) {
      return NextResponse.json(
        { error: 'Attachment key is outside allowed upload prefix' },
        { status: 400 }
      );
    }

    let message;
    if (parsed.data.attachments.length === 0) {
      message = await addEmployeeTicketMessage({
        ticketId,
        employeeId: employee.id,
        body: parsed.data.body,
      });
    } else {
      const result = await addEmployeeTicketMessageWithAttachments({
        ticketId,
        employeeId: employee.id,
        body: parsed.data.body,
        attachments: parsed.data.attachments,
      });
      message = result.message;
    }

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('Error adding ticket message:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
