import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getTicketById, updateTicketStatusByEmployee } from '@repo/database';
import { TicketStatus } from '@prisma/client';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';
import { z } from 'zod';

export async function GET(
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

    const enrichAttachmentUrl = async <T extends { publicUrl: string | null; s3Key: string }>(attachment: T) => {
      if (attachment.publicUrl) return attachment;
      try {
        const publicUrl = await getCachedPresignedDownloadUrl(attachment.s3Key);
        return { ...attachment, publicUrl };
      } catch {
        return attachment;
      }
    };

    const [attachments, messages] = await Promise.all([
      Promise.all(ticket.attachments.map(enrichAttachmentUrl)),
      Promise.all(
        ticket.messages.map(async message => ({
          ...message,
          attachments: await Promise.all(message.attachments.map(enrichAttachmentUrl)),
        }))
      ),
    ]);

    return NextResponse.json({
      ticket: {
        ...ticket,
        attachments,
        messages,
      },
    });
  } catch (error) {
    console.error('Error fetching ticket details:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
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
    const body = await req.json();

    const statusSchema = z.object({
      status: z.enum(['IN_PROGRESS', 'SOLVED', 'CANNOT_RESOLVE']),
    });
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid status request' }, { status: 400 });
    }

    const { status } = parsed.data;

    const ticket = await getTicketById(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const isAssigned = ticket.assignedEmployees.some(ae => ae.employeeId === employee.id);
    if (!isAssigned) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (ticket.claimedByEmployeeId !== employee.id) {
      return NextResponse.json(
        { error: 'Only the employee who claimed the ticket can change its status' },
        { status: 400 }
      );
    }

    const updated = await updateTicketStatusByEmployee({
      ticketId,
      nextStatus: status as TicketStatus,
      actorEmployeeId: employee.id,
    });

    return NextResponse.json({ success: true, ticket: updated });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

