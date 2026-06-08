import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getTicketById } from '@repo/database';
import { ticketAttachmentUploadRequestSchema } from '@repo/validations';
import { getPresignedUploadPostPolicy } from '@/lib/s3';

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
    const parsed = ticketAttachmentUploadRequestSchema.safeParse({
      ...bodyData,
      ticketId,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid upload payload' },
        { status: 400 }
      );
    }

    const uploadPolicy = await getPresignedUploadPostPolicy(
      parsed.data.fileName,
      parsed.data.contentType,
      parsed.data.fileSize,
      {
        folder: 'tickets',
        ticketId,
      }
    );

    return NextResponse.json({
      ...uploadPolicy,
      uploadMethod: 'POST',
    });
  } catch (error) {
    console.error('Error generating presigned upload url:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
