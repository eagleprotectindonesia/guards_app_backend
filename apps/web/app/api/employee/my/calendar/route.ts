import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { calendarListSchema } from '@repo/validations';
import { KIND_COLORS } from '@repo/shared';
import { startOfDay, endOfDay, eachDayOfInterval, parseISO } from 'date-fns';

function expandToDays(
  startDate: Date,
  endDate: Date,
  from: Date,
  to: Date
): Date[] {
  const rangeStart = startDate > from ? startDate : from;
  const rangeEnd = endDate < to ? endDate : to;
  return eachDayOfInterval({ start: rangeStart, end: rangeEnd });
}

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

    const fromDate = startOfDay(parseISO(parsed.data.from));
    const toDate = endOfDay(parseISO(parsed.data.to));

    const [holidays, memos, leaves, events] = await Promise.all([
      prisma.holidayCalendarEntry.findMany({
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
      }),

      prisma.officeMemo.findMany({
        where: {
          isActive: true,
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
      }),

      prisma.employeeLeaveRequest.findMany({
        where: {
          employeeId: employee.id,
          startDate: { lte: toDate },
          endDate: { gte: fromDate },
        },
        orderBy: [{ startDate: 'asc' }],
      }),

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
          tags: {
            include: {
              employee: { select: { id: true, fullName: true, employeeNumber: true } },
              admin: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
    ]);

    type Kind = 'holiday' | 'office_memo' | 'leave' | 'meeting' | 'client_meeting' | 'reminder' | 'task' | 'deadline' | 'follow_up' | 'training' | 'personal_event' | 'other';

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
      status: string | null;
      colorHint: string | null;
      isOwner: boolean;
      taggedUsers: Array<{ id: string; type: 'employee' | 'admin'; name: string; email?: string }>;
    }> = [];

    for (const h of holidays) {
      const days = expandToDays(h.startDate, h.endDate, fromDate, toDate);
      for (const day of days) {
        items.push({
          id: `holiday:${h.id}:${day.toISOString().slice(0, 10)}`,
          originalId: h.id,
          kind: 'holiday',
          title: h.title,
          date: day.toISOString().slice(0, 10),
          startsAt: null,
          endsAt: null,
          allDay: true,
          priority: null,
          location: null,
          status: h.type,
          colorHint: '#FF9500',
          isOwner: false,
          taggedUsers: [],
        });
      }
    }

    for (const m of memos) {
      const days = expandToDays(m.startDate, m.endDate, fromDate, toDate);
      for (const day of days) {
        items.push({
          id: `office_memo:${m.id}:${day.toISOString().slice(0, 10)}`,
          originalId: m.id,
          kind: 'office_memo',
          title: m.title,
          date: day.toISOString().slice(0, 10),
          startsAt: null,
          endsAt: null,
          allDay: true,
          priority: null,
          location: null,
          status: null,
          colorHint: '#AF52DE',
          isOwner: false,
          taggedUsers: [],
        });
      }
    }

    for (const l of leaves) {
      const days = expandToDays(l.startDate, l.endDate, fromDate, toDate);
      for (const day of days) {
        items.push({
          id: `leave:${l.id}:${day.toISOString().slice(0, 10)}`,
          originalId: l.id,
          kind: 'leave',
          title: l.reason,
          date: day.toISOString().slice(0, 10),
          startsAt: null,
          endsAt: null,
          allDay: true,
          priority: null,
          location: null,
          status: l.status,
          isOwner: true,
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

    const defaultColors = KIND_COLORS;

    for (const e of events) {
      const days = expandToDays(e.startDate, e.endDate, fromDate, toDate);
      for (const day of days) {
        const kind = e.kind as Kind;
        const taggedUsers = (e.tags ?? []).map((t) => {
          if (t.participantType === 'employee' && t.employee) {
            return { id: t.employee.id, type: 'employee' as const, name: t.employee.fullName };
          }
          if (t.participantType === 'admin' && t.admin) {
            return { id: t.admin.id, type: 'admin' as const, name: t.admin.name, email: t.admin.email };
          }
          return null;
        }).filter(Boolean) as Array<{ id: string; type: 'employee' | 'admin'; name: string; email?: string }>;
        items.push({
          id: `${kind}:${e.id}:${day.toISOString().slice(0, 10)}`,
          originalId: e.id,
          kind,
          title: e.title,
          date: day.toISOString().slice(0, 10),
          startsAt: e.startTime ? `${day.toISOString().slice(0, 10)}T${e.startTime}:00` : null,
          endsAt: e.endTime ? `${day.toISOString().slice(0, 10)}T${e.endTime}:00` : null,
          allDay: e.allDay,
          priority: (e.priority as 'urgent' | 'high' | 'normal' | 'low') ?? null,
          location: e.location ?? null,
          status: null,
          colorHint: e.color ?? defaultColors[kind] ?? '#8E8E93',
          isOwner: e.employeeId === employee.id,
          taggedUsers,
        });
      }
    }

    items.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ items });
  } catch (error: unknown) {
    console.error('Error fetching calendar events:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
