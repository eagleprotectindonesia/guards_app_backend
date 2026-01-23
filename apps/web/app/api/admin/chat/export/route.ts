import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay, format } from 'date-fns';
import { getChatExportBatch } from '@/lib/data-access/chat';
import { getCurrentAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const employeeId = searchParams.get('employeeId');

  if (!employeeId) {
    return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
  }

  const where: Prisma.ChatMessageWhereInput = {
    employeeId,
  };

  if (startDateStr || endDateStr) {
    where.createdAt = {};
    if (startDateStr) {
      where.createdAt.gte = startOfDay(new Date(startDateStr));
    }
    if (endDateStr) {
      where.createdAt.lte = endOfDay(new Date(endDateStr));
    }
  }

  const BATCH_SIZE = 1000;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Write Header
      const headers = ['Date', 'Time', 'Sender', 'Content', 'Attachments'];
      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let cursor: string | undefined = undefined;

      try {
        while (true) {
          const batch = await getChatExportBatch({
            take: BATCH_SIZE,
            where,
            cursor,
          });

          if (batch.length === 0) {
            break;
          }

          let chunk = '';
          for (const msg of batch) {
            const date = format(new Date(msg.createdAt), 'yyyy/MM/dd');
            const time = format(new Date(msg.createdAt), 'HH:mm:ss');
            const senderName = msg.sender === 'admin' 
              ? `Admin (${msg.admin?.name || 'Unknown'})` 
              : msg.employee.fullName;
            
            const attachments = (msg.attachments || []).join('; ');

            // Escape quotes in CSV fields: " -> ""
            const escape = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;

            chunk += 
              [
                escape(date),
                escape(time),
                escape(senderName),
                escape(msg.content),
                escape(attachments),
              ].join(',') + '\n';
          }

          controller.enqueue(encoder.encode(chunk));

          if (batch.length < BATCH_SIZE) {
            break;
          }

          cursor = batch[batch.length - 1].id;
        }
      } catch (error) {
        console.error('Export stream error:', error);
        controller.error(error);
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="chat_export_${employeeId}_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
