import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getTicketById } from '@repo/database';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';

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
