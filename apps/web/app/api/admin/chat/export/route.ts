import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';
import { getChatExportBatch, enrichMessageWithUrls } from '@/lib/data-access/chat';
import { getGroupChatExportBatch, enrichGroupMessageWithUrls } from '@/lib/data-access/group-chat';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export async function GET(request: NextRequest) {
  const admin = await requirePermission(PERMISSIONS.CHAT.VIEW);

  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const kind = searchParams.get('kind');
  const id = searchParams.get('id');
  const employeeId = searchParams.get('employeeId');

  const resolvedKind = kind === 'group' ? 'group' : 'direct';
  const resolvedId = id || employeeId;

  if (!resolvedId) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const where: Prisma.ChatMessageWhereInput = {
    employeeId: resolvedId,
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
  type ExportMessage = { id: string; attachments?: string[] };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      let cursor: string | undefined = undefined;

      try {
        while (true) {
          const rawBatch: ExportMessage[] =
            resolvedKind === 'group'
              ? await getGroupChatExportBatch({
                  groupId: resolvedId,
                  actor: { participantType: 'admin', adminId: admin.id },
                  take: BATCH_SIZE,
                  cursor,
                  startDate: startDateStr ? startOfDay(new Date(startDateStr)) : undefined,
                  endDate: endDateStr ? endOfDay(new Date(endDateStr)) : undefined,
                })
              : await getChatExportBatch({
                  take: BATCH_SIZE,
                  where,
                  cursor,
                });

          if (rawBatch.length === 0) {
            break;
          }

          const batch: ExportMessage[] = await Promise.all(
            rawBatch.map((msg: ExportMessage) =>
              resolvedKind === 'group' ? enrichGroupMessageWithUrls(msg) : enrichMessageWithUrls(msg)
            )
          );

          for (const msg of batch) {
            // Send each message as a JSON line (NDJSON)
            controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n'));
          }

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
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
  });
}
