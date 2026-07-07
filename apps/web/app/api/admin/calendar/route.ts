import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { calendarListSchema } from '@repo/validations';
import { KIND_COLORS } from '@repo/shared';
import { startOfDay, endOfDay, eachDayOfInterval, parseISO } from 'date-fns';

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

    const kinds = kindFilter ? kindFilter.split(',').map((k) => k.trim()).filter(Boolean) : undefined;
    const priorities = priorityFilter ? priorityFilter.split(',').map((p) => p.trim()).filter(Boolean) : undefined;

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

    const [holidays, memos, employeeEvents, adminEvents] = await Promise.all([
      prisma.holidayCalendarEntry.findMany({
        where: {
          endDate: { gte: fromDate },
          startDate: { lte: toDate },
        },
        orderBy: [{ startDate: 'asc' }],
      }),
      prisma.officeMemo.findMany({
        where: {
          isActive: true,
          endDate: { gte: fromDate },
          startDate: { lte: toDate },
        },
        orderBy: [{ startDate: 'asc' }],
      }),
      prisma.calendarEvent.findMany({
        where: { ...employeeEventWhere, ...employeeTagFilter } as Record<string, unknown>,
        orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
        include: {
          employee: { select: { id: true, fullName: true, employeeNumber: true } },
          tags: {
            include: {
              employee: { select: { id: true, fullName: true, employeeNumber: true } },
              admin: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.calendarEvent.findMany({
        where: {
          deletedAt: null,
          adminId,
          endDate: { gte: fromDate },
          startDate: { lte: toDate },
        },
        orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
        include: {
          admin: { select: { id: true, name: true } },
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
      ownerId: string;
      ownerType: 'employee' | 'admin';
      ownerName: string;
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
          ownerId: '',
          ownerType: 'admin',
          ownerName: 'System',
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
          ownerId: '',
          ownerType: 'admin',
          ownerName: 'System',
          taggedUsers: [],
        });
      }
    }

    const defaultColors: Record<string, string> = KIND_COLORS;

    type TagRow = {
      participantType: string;
      employee: { id: string; fullName: string } | null;
      admin: { id: string; name: string; email: string } | null;
    };
    type TaggedUser = { id: string; type: 'employee' | 'admin'; name: string; email?: string };

    for (const e of employeeEvents) {
      const days = expandToDays(e.startDate, e.endDate, fromDate, toDate);
      for (const day of days) {
        const kind = e.kind as Kind;
        const taggedUsers = (e.tags ?? []).map((t: unknown) => {
          const row = t as TagRow;
          if (row.participantType === 'employee' && row.employee) {
            return { id: row.employee.id, type: 'employee' as const, name: row.employee.fullName };
          }
          if (row.participantType === 'admin' && row.admin) {
            return { id: row.admin.id, type: 'admin' as const, name: row.admin.name, email: row.admin.email };
          }
          return null;
        }).filter(Boolean) as TaggedUser[];
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
          ownerId: e.employee?.id ?? '',
          ownerType: 'employee',
          ownerName: e.employee?.fullName ?? 'Unknown',
          taggedUsers,
        });
      }
    }

    for (const e of adminEvents) {
      const days = expandToDays(e.startDate, e.endDate, fromDate, toDate);
      for (const day of days) {
        const kind = e.kind as Kind;
        const taggedUsers = (e.tags ?? []).map((t: unknown) => {
          const row = t as TagRow;
          if (row.participantType === 'employee' && row.employee) {
            return { id: row.employee.id, type: 'employee' as const, name: row.employee.fullName };
          }
          if (row.participantType === 'admin' && row.admin) {
            return { id: row.admin.id, type: 'admin' as const, name: row.admin.name, email: row.admin.email };
          }
          return null;
        }).filter(Boolean) as TaggedUser[];
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
          ownerId: e.admin?.id ?? '',
          ownerType: 'admin',
          ownerName: e.admin?.name ?? 'Unknown',
          taggedUsers,
        });
      }
    }

    items.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ items });
  } catch (error: unknown) {
    console.error('Error fetching admin calendar:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
