import { NextResponse } from 'next/server';
import { prisma, getTagsForEvents } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { calendarListSchema } from '@repo/validations';
import { KIND_COLORS } from '@repo/shared';
import { startOfDay, endOfDay, eachDayOfInterval, parseISO } from 'date-fns';

type CalendarItem = {
  id: string;
  originalId: string;
  kind: string;
  title: string;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  priority: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  colorHint: string | null;
  ownerId: string;
  ownerType: 'employee' | 'admin';
  ownerName: string;
  taggedUsers: Array<{ id: string; type: 'employee' | 'admin'; name: string; email?: string }>;
};

function expandToDays(startDate: Date, endDate: Date, from: Date, to: Date): Date[] {
  const rangeStart = startDate > from ? startDate : from;
  const rangeEnd = endDate < to ? endDate : to;
  return eachDayOfInterval({ start: rangeStart, end: rangeEnd });
}

export async function GET(req: Request) {
  const { id: adminId } = await requirePermission('user-calendar:view');

  try {
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const employeeIdFilter = searchParams.get('employeeId');
    const kindFilter = searchParams.get('kind');
    const priorityFilter = searchParams.get('priority');
    const clientNameFilter = searchParams.get('clientName');
    const taggedUserId = searchParams.get('taggedUserId');

    const parsed = calendarListSchema.safeParse({ from: fromParam, to: toParam });
    if (!parsed.success) {
      return NextResponse.json({ error: 'from and to query parameters are required (YYYY-MM-DD)' }, { status: 400 });
    }

    const fromDate = startOfDay(parseISO(parsed.data.from));
    const toDate = endOfDay(parseISO(parsed.data.to));

    const kinds = kindFilter
      ? kindFilter
          .split(',')
          .map(k => k.trim())
          .filter(Boolean)
      : undefined;
    const priorities = priorityFilter
      ? priorityFilter
          .split(',')
          .map(p => p.trim())
          .filter(Boolean)
      : undefined;

    const employeeEventWhere: Record<string, unknown> = {
      deletedAt: null,
      adminId: null,
      endDate: { gte: fromDate },
      startDate: { lte: toDate },
    };

    if (employeeIdFilter) {
      employeeEventWhere.employeeId = employeeIdFilter;
    }
    if (kinds && kinds.length > 0) {
      employeeEventWhere.kind = { in: kinds };
    }
    if (priorities && priorities.length > 0) {
      employeeEventWhere.priority = { in: priorities };
    }
    if (clientNameFilter) {
      employeeEventWhere.clientName = { contains: clientNameFilter, mode: 'insensitive' };
    }

    const employeeTagFilter = taggedUserId
      ? {
          tags: {
            some: {
              OR: [
                { employeeId: taggedUserId, participantType: 'employee' },
                { adminId: taggedUserId, participantType: 'admin' },
              ],
            },
          },
        }
      : {};

    const adminEventWhere: Record<string, unknown> = {
      deletedAt: null,
      adminId,
      endDate: { gte: fromDate },
      startDate: { lte: toDate },
    };
    if (kinds && kinds.length > 0) {
      adminEventWhere.kind = { in: kinds };
    }
    if (priorities && priorities.length > 0) {
      adminEventWhere.priority = { in: priorities };
    }
    if (clientNameFilter) {
      adminEventWhere.clientName = { contains: clientNameFilter, mode: 'insensitive' };
    }

    const [holidays, memos, employeeEvents, adminEvents] = await Promise.all([
      prisma.holidayCalendarEntry.findMany({
        where: { endDate: { gte: fromDate }, startDate: { lte: toDate } },
        orderBy: [{ startDate: 'asc' }],
      }),
      prisma.officeMemo.findMany({
        where: { isActive: true, endDate: { gte: fromDate }, startDate: { lte: toDate } },
        orderBy: [{ startDate: 'asc' }],
      }),
      prisma.calendarEvent.findMany({
        where: { ...employeeEventWhere, ...employeeTagFilter } as Record<string, unknown>,
        orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
        include: {
          employee: { select: { id: true, fullName: true, employeeNumber: true } },
        },
      }),
      prisma.calendarEvent.findMany({
        where: adminEventWhere as Record<string, unknown>,
        orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
        include: {
          admin: { select: { id: true, name: true } },
        },
      }),
    ]);

    const allEventIds = [...employeeEvents.map(e => e.id), ...adminEvents.map(e => e.id)];
    const tagsByEvent = allEventIds.length > 0 ? await getTagsForEvents(allEventIds) : {};

    const items: CalendarItem[] = [];
    const dayCounts: Record<string, number> = {};

    const ymd = (d: Date) => d.toISOString().slice(0, 10);

    for (const h of holidays) {
      const days = expandToDays(h.startDate, h.endDate, fromDate, toDate);
      for (const day of days) {
        const date = ymd(day);
        items.push({
          id: `holiday:${h.id}:${date}`,
          originalId: h.id,
          kind: 'holiday',
          title: h.title,
          date,
          startsAt: null,
          endsAt: null,
          allDay: true,
          priority: null,
          location: null,
          latitude: null,
          longitude: null,
          status: h.type,
          colorHint: '#FF9500',
          ownerId: '',
          ownerType: 'admin',
          ownerName: 'System',
          taggedUsers: [],
        });
        dayCounts[date] = (dayCounts[date] ?? 0) + 1;
      }
    }

    for (const m of memos) {
      const days = expandToDays(m.startDate, m.endDate, fromDate, toDate);
      for (const day of days) {
        const date = ymd(day);
        items.push({
          id: `office_memo:${m.id}:${date}`,
          originalId: m.id,
          kind: 'office_memo',
          title: m.title,
          date,
          startsAt: null,
          endsAt: null,
          allDay: true,
          priority: null,
          location: null,
          latitude: null,
          longitude: null,
          status: null,
          colorHint: '#AF52DE',
          ownerId: '',
          ownerType: 'admin',
          ownerName: 'System',
          taggedUsers: [],
        });
        dayCounts[date] = (dayCounts[date] ?? 0) + 1;
      }
    }

    function pushEventItems(
      events: Array<{
        id: string;
        startDate: Date;
        endDate: Date;
        startTime: string | null;
        endTime: string | null;
        allDay: boolean;
        kind: string;
        title: string;
        priority: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        color: string | null;
        ownerId: string;
        ownerType: 'employee' | 'admin';
        ownerName: string;
      }>
    ) {
      for (const e of events) {
        const days = expandToDays(e.startDate, e.endDate, fromDate, toDate);
        for (const day of days) {
          const date = ymd(day);
          const kind = e.kind;
          const colorHint = e.color ?? KIND_COLORS[kind] ?? '#8E8E93';
          items.push({
            id: `${kind}:${e.id}:${date}`,
            originalId: e.id,
            kind,
            title: e.title,
            date,
            startsAt: e.startTime ? `${date}T${e.startTime}:00` : null,
            endsAt: e.endTime ? `${date}T${e.endTime}:00` : null,
            allDay: e.allDay,
            priority: e.priority,
            location: e.location,
            latitude: e.latitude,
            longitude: e.longitude,
            status: null,
            colorHint,
            ownerId: e.ownerId,
            ownerType: e.ownerType,
            ownerName: e.ownerName,
            taggedUsers: tagsByEvent[e.id] ?? [],
          });
          dayCounts[date] = (dayCounts[date] ?? 0) + 1;
        }
      }
    }

    pushEventItems(
      employeeEvents.map(e => ({
        id: e.id,
        startDate: e.startDate,
        endDate: e.endDate,
        startTime: e.startTime,
        endTime: e.endTime,
        allDay: e.allDay,
        kind: e.kind,
        title: e.title,
        priority: e.priority,
        location: e.location,
        latitude: e.latitude,
        longitude: e.longitude,
        color: e.color,
        ownerId: e.employee?.id ?? '',
        ownerType: 'employee' as const,
        ownerName: e.employee?.fullName ?? 'Unknown',
      }))
    );

    pushEventItems(
      adminEvents.map(e => ({
        id: e.id,
        startDate: e.startDate,
        endDate: e.endDate,
        startTime: e.startTime,
        endTime: e.endTime,
        allDay: e.allDay,
        kind: e.kind,
        title: e.title,
        priority: e.priority,
        location: e.location,
        latitude: e.latitude,
        longitude: e.longitude,
        color: e.color,
        ownerId: e.admin?.id ?? '',
        ownerType: 'admin' as const,
        ownerName: e.admin?.name ?? 'Unknown',
      }))
    );

    items.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ items, dayCounts });
  } catch (error: unknown) {
    console.error('Error fetching admin calendar:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
