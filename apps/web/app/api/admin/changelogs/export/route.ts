import { NextRequest, NextResponse } from 'next/server';
import {
  EMPLOYEE_TRACKED_FIELDS,
  prisma,
  SHIFT_TRACKED_FIELDS,
  SHIFT_TYPE_TRACKED_FIELDS,
  SITE_TRACKED_FIELDS,
} from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay, format } from 'date-fns';

const include = {
  admin: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.ChangelogInclude;

type ChangelogWithAdmin = Prisma.ChangelogGetPayload<{ include: typeof include }>;

const getTrackedFields = (entityType: string | null) => {
  switch (entityType) {
    case 'Shift':
      return [...SHIFT_TRACKED_FIELDS];
    case 'Employee':
      return [...EMPLOYEE_TRACKED_FIELDS];
    case 'Site':
      return [...SITE_TRACKED_FIELDS];
    case 'ShiftType':
      return [...SHIFT_TYPE_TRACKED_FIELDS];
    default:
      // Union of all tracked fields if type is unknown or mixed
      return Array.from(
        new Set([
          ...SHIFT_TRACKED_FIELDS,
          ...EMPLOYEE_TRACKED_FIELDS,
          ...SITE_TRACKED_FIELDS,
          ...SHIFT_TYPE_TRACKED_FIELDS,
        ])
      );
  }
};

const labelize = (key: string) => {
  const specialCases: Record<string, string> = {
    requiredCheckinIntervalMins: 'Check-in Interval',
    graceMinutes: 'Grace Period',
    startsAt: 'Start Time',
    endsAt: 'End Time',
    employeeId: 'Employee ID',
    siteId: 'Site ID',
    shiftTypeId: 'Shift Type ID',
    employeeName: 'Employee',
    siteName: 'Site',
    shiftTypeName: 'Shift Type',
  };

  if (specialCases[key]) return specialCases[key];

  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .replace(/Id$/, '')
    .replace(/Mins$/, '')
    .trim();
};

const formatCSVValue = (key: string, value: string | boolean) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  // Check if it's a date string (ISO format usually stored in JSON)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    try {
      const date = new Date(value);
      if (key.toLowerCase().includes('date') && !key.toLowerCase().includes('at')) {
        return format(date, 'PPP');
      }
      return format(date, 'PPP p');
    } catch {
      return value;
    }
  }

  return String(value);
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');
  const action = searchParams.get('action');

  const where: Prisma.ChangelogWhereInput = {};

  if (entityType) {
    where.entityType = entityType;
  }
  if (entityId) {
    where.entityId = entityId;
  }
  if (action) {
    where.action = action;
  }

  if (startDateStr || endDateStr) {
    where.createdAt = {};
    if (startDateStr) {
      where.createdAt.gte = startOfDay(new Date(startDateStr));
    }
    if (endDateStr) {
      where.createdAt.lte = endOfDay(new Date(endDateStr));
    }
  }

  const trackedFields = getTrackedFields(entityType);

  const BATCH_SIZE = 1000;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Write Header
      const headers = ['Date', 'Actor', 'Action', 'Entity Type', 'Entity ID', ...trackedFields.map(f => labelize(f))];
      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let cursorId: string | null = null;

      try {
        while (true) {
          const args: Prisma.ChangelogFindManyArgs = {
            take: BATCH_SIZE,
            where,
            orderBy: { id: 'asc' },
            include,
          };

          if (cursorId !== null) {
            args.skip = 1;
            args.cursor = { id: cursorId };
          }

          const batch = (await prisma.changelog.findMany(args)) as ChangelogWithAdmin[];

          if (batch.length === 0) {
            break;
          }

          let chunk = '';
          for (const log of batch) {
            const escape = (str: string | null | undefined) => {
              if (!str) return '';
              return `"${str.toString().replace(/"/g, '""')}"`;
            };

            const date = format(new Date(log.createdAt), 'yyyy/MM/dd HH:mm:ss');
            let actorName = 'Unknown';
            if (log.actor === 'system') {
              actorName = 'System';
            } else if (log.actor === 'admin') {
              actorName = log.admin?.name || 'Administrator';
            }

            // Parse details and changes
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const details = (log.details as any) || {};
            type keys = ReturnType<typeof getTrackedFields>[number];
            const changes = details.changes as { [key in keys]: { from: string | boolean; to: string | boolean } };

            const fieldValues = trackedFields.map(field => {
              if (changes[field]) {
                const from = formatCSVValue(field, changes[field].from);
                const to = formatCSVValue(field, changes[field].to);
                return `${from} -> ${to}`;
              }
              return formatCSVValue(field, details[field]);
            });

            const row = [
              escape(date),
              escape(actorName),
              escape(log.action),
              // escape(log.entityType),
              // escape(log.entityId),
              ...fieldValues.map(v => escape(v)),
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

  const filename = `changelog_export_${entityType || 'all'}_${new Date().toISOString().split('T')[0]}.csv`;

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
