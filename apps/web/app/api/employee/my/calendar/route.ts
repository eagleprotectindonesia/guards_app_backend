import { NextResponse } from 'next/server';
import { prisma, listCalendarEventsForDepartmentMembers } from '@repo/database';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { calendarListSchema } from '@repo/validations';
import { colorHintForEvent, formatDateKeyInTimeZone, BUSINESS_TIMEZONE } from '@repo/shared';
function expandToDays(startDate: Date, endDate: Date, from: Date, to: Date): Date[] {
  const rangeStart = startDate > from ? startDate : from;
  const rangeEnd = endDate < to ? endDate : to;
  if (rangeStart > rangeEnd) return [];
  const days: Date[] = [];
  const current = new Date(rangeStart);
  current.setUTCHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  end.setUTCHours(0, 0, 0, 0);
  while (current <= end) {
    days.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

const ymd = (d: Date) => formatDateKeyInTimeZone(d, BUSINESS_TIMEZONE);

export async function GET(req: Request) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const parsed = calendarListSchema.safeParse({ from: fromParam, to: toParam });
    if (!parsed.success) {
      return NextResponse.json({ error: 'from and to query parameters are required (YYYY-MM-DD)' }, { status: 400 });
    }

    // Use UTC-midnight dates to match Prisma @db.Date normalization
    // Prisma returns DATE values as midnight UTC, so queries must use UTC bounds
    const fromDate = new Date(parsed.data.from + 'T00:00:00Z');
    const toDate = new Date(parsed.data.to + 'T23:59:59.999Z');

    const showSystemItems = searchParams.get('showSystemItems') === 'true';

    const holidaysPromise = showSystemItems
      ? prisma.holidayCalendarEntry.findMany({
          where: {
            endDate: { gte: fromDate },
            startDate: { lte: toDate },
            OR: [
              { scope: 'all' },
              ...(employee.department
                ? [{ scope: 'department' as const, departmentKeys: { has: employee.department } }]
                : []),
            ],
          },
          orderBy: [{ startDate: 'asc' }],
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof prisma.holidayCalendarEntry.findMany>>);

    const leavesPromise = showSystemItems
      ? prisma.employeeLeaveRequest.findMany({
          where: {
            employeeId: employee.id,
            startDate: { lte: toDate },
            endDate: { gte: fromDate },
          },
          orderBy: [{ startDate: 'asc' }],
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof prisma.employeeLeaveRequest.findMany>>);

    const [holidays, leaves, events, departmentEvents] = await Promise.all([
      holidaysPromise,
      leavesPromise,
      prisma.calendarEvent.findMany({
        where: {
          deletedAt: null,
          endDate: { gte: fromDate },
          startDate: { lte: toDate },
          OR: [
            { employeeId: employee.id },
            { tags: { some: { employeeId: employee.id, participantType: 'employee' } } },
          ],
        },
        orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
        include: {
          employee: { select: { id: true, fullName: true } },
          admin: { select: { id: true, name: true } },
          tags: {
            include: {
              employee: { select: { id: true, fullName: true, employeeNumber: true } },
              admin: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      employee.department
        ? listCalendarEventsForDepartmentMembers([employee.department], fromDate, toDate)
        : Promise.resolve([]),
    ]);

    // Merge department-tagged events, deduping by ID with user's own events
    const ownEventIds = new Set(events.map(e => e.id));
    const mergedEvents = [
      ...events,
      ...departmentEvents.filter(de => !ownEventIds.has(de.id)),
    ];

    type Kind =
      | 'holiday'
      | 'leave'
      | 'meeting'
      | 'client_meeting'
      | 'reminder'
      | 'task'
      | 'deadline'
      | 'follow_up'
      | 'training'
      | 'personal_event'
      | 'other';

    const items: Array<{
      id: string;
      originalId: string;
      kind: Kind;
      title: string;
      date: string;
      startsAt: string | null;
      endsAt: string | null;
      allDay: boolean;
      priority: 'urgent' | 'high' | 'normal' | 'low' | null;
      location: string | null;
      latitude: number | null;
      longitude: number | null;
      status: string | null;
      colorHint: string | null;
      isOwner: boolean;
      ownerId: string;
      ownerType: 'employee' | 'admin';
      ownerName: string;
      taggedUsers: Array<{ id: string; type: 'employee' | 'admin'; name: string; email?: string }>;
    }> = [];

    for (const h of holidays) {
      const days = expandToDays(h.startDate, h.endDate, fromDate, toDate);
      for (const day of days) {
        items.push({
          id: `holiday:${h.id}:${ymd(day)}`,
          originalId: h.id,
          kind: 'holiday',
          title: h.title,
          date: ymd(day),
          startsAt: null,
          endsAt: null,
          allDay: true,
          priority: null,
          location: null,
          latitude: null,
          longitude: null,
          status: h.type,
          colorHint: '#FF9500',
          isOwner: false,
          ownerId: '',
          ownerType: 'admin',
          ownerName: 'System',
          taggedUsers: [],
        });
      }
    }

    for (const l of leaves) {
      const days = expandToDays(l.startDate, l.endDate, fromDate, toDate);
      for (const day of days) {
        items.push({
          id: `leave:${l.id}:${ymd(day)}`,
          originalId: l.id,
          kind: 'leave',
          title: l.reason,
          date: ymd(day),
          startsAt: null,
          endsAt: null,
          allDay: true,
          priority: null,
          location: null,
          latitude: null,
          longitude: null,
          status: l.status,
          isOwner: true,
          ownerId: employee.id,
          ownerType: 'employee',
          ownerName: employee.fullName,
          taggedUsers: [],
          colorHint:
            l.status === 'approved'
              ? '#34C759'
              : l.status === 'pending' || l.status === 'pending_hr' || l.status === 'pending_manager'
                ? '#FFEB3B'
                : '#FF3B30',
        });
      }
    }

    for (const e of mergedEvents) {
      const days = expandToDays(e.startDate, e.endDate, fromDate, toDate);
      for (const day of days) {
        const kind = e.kind as Kind;
        const taggedUsers = (e.tags ?? [])
          .map(t => {
            if (t.participantType === 'employee' && t.employee) {
              return { id: t.employee.id, type: 'employee' as const, name: t.employee.fullName };
            }
            if (t.participantType === 'admin' && t.admin) {
              return { id: t.admin.id, type: 'admin' as const, name: t.admin.name, email: t.admin.email };
            }
            return null;
          })
          .filter(Boolean) as Array<{ id: string; type: 'employee' | 'admin'; name: string; email?: string }>;
        const itemDate = ymd(day);
        const item = {
          id: `${kind}:${e.id}:${itemDate}`,
          originalId: e.id,
          kind,
          title: e.title,
          date: itemDate,
          startsAt: e.startTime ? `${itemDate}T${e.startTime}:00` : null,
          endsAt: e.endTime ? `${itemDate}T${e.endTime}:00` : null,
          allDay: e.allDay,
          priority: e.priority as 'urgent' | 'high' | 'normal' | 'low' | null,
          location: e.location ?? null,
          latitude: e.latitude ?? null,
          longitude: e.longitude ?? null,
          status: null,
          colorHint: colorHintForEvent(kind, e.priority),
          isOwner: e.employeeId === employee.id,
          ownerId: e.employee?.id ?? e.admin?.id ?? '',
          ownerType: (e.employee ? 'employee' : 'admin') as 'employee' | 'admin',
          ownerName: e.employee?.fullName ?? e.admin?.name ?? 'Unknown',
          taggedUsers,
        };
        items.push(item);
      }
    }

    items.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ items });
  } catch (error: unknown) {
    console.error('Error fetching calendar events:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
