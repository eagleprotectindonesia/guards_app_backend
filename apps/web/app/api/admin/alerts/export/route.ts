import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay, format } from 'date-fns';

const include = {
  site: true,
  shift: { include: { employee: true } },
  ackAdmin: true,
  resolverAdmin: true,
} satisfies Prisma.AlertInclude;

type AlertWithRels = Prisma.AlertGetPayload<{ include: typeof include }>;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');

  const where: Prisma.AlertWhereInput = {};

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
      const headers = [
        'Site',
        'Employee',
        'Reason',
        'Severity',
        'Created At',
        'Window Start',
        'Status',
        'Acknowledged By',
        'Acknowledged At',
        'Resolved By',
        'Resolved At',
        'Resolution Type',
        'Resolution Note',
      ];
      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let cursorId: string | null = null;

      try {
        while (true) {
          const args: Prisma.AlertFindManyArgs = {
            take: BATCH_SIZE,
            where,
            orderBy: { id: 'asc' },
            include,
          };

          // Avoid the spread + union weirdness by assigning conditionally
          if (cursorId !== null) {
            args.skip = 1;
            args.cursor = { id: cursorId };
          }

          const batch = (await prisma.alert.findMany(args)) as AlertWithRels[];

          if (batch.length === 0) {
            break;
          }

          let chunk = '';
          for (const alert of batch) {
            // Helper to escape CSV fields
            const escape = (str: string | null | undefined) => {
              if (!str) return '';
              return `"${str.replace(/"/g, '""')}"`;
            };

            const siteName = alert.site.name;
            const employeeName = alert.shift?.employee?.name || 'Unassigned';

            const createdAt = format(new Date(alert.createdAt), 'yyyy/MM/dd HH:mm');
            const windowStart = format(new Date(alert.windowStart), 'yyyy/MM/dd HH:mm');

            const status = alert.resolvedAt ? 'Resolved' : alert.acknowledgedAt ? 'Acknowledged' : 'Open';

            const ackByName = alert.ackAdmin?.name || '';
            const ackAt = alert.acknowledgedAt ? format(new Date(alert.acknowledgedAt), 'yyyy/MM/dd HH:mm') : '';

            const resByName = alert.resolverAdmin?.name || '';
            const resAt = alert.resolvedAt ? format(new Date(alert.resolvedAt), 'yyyy/MM/dd HH:mm') : '';

            const row = [
              escape(siteName),
              escape(employeeName),
              escape(alert.reason),
              escape(alert.severity),
              escape(createdAt),
              escape(windowStart),
              escape(status),
              escape(ackByName),
              escape(ackAt),
              escape(resByName),
              escape(resAt),
              escape(alert.resolutionType),
              escape(alert.resolutionNote),
            ];

            chunk += row.join(',') + '\n';
          }

          controller.enqueue(encoder.encode(chunk));

          if (batch.length < BATCH_SIZE) {
            break;
          }

          cursorId = batch[batch.length - 1].id;
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
      'Content-Disposition': `attachment; filename="alerts_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
