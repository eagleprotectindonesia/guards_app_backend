import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
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

    if (!fromParam || !toParam) {
      return NextResponse.json({ error: 'from and to query parameters are required' }, { status: 400 });
    }

    const fromDate = startOfDay(parseISO(fromParam));
    const toDate = endOfDay(parseISO(toParam));

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    const [holidays, memos, leaves] = await Promise.all([
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
    ]);

    const items: Array<{
      id: string;
      originalId: string;
      kind: 'holiday' | 'office_memo' | 'leave';
      title: string;
      date: string;
      startsAt: string | null;
      endsAt: string | null;
      allDay: boolean;
      priority: 'urgent' | 'high' | 'normal' | 'low' | null;
      location: string | null;
      status: string | null;
      colorHint: string | null;
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
          colorHint:
            l.status === 'approved'
              ? '#34C759'
              : l.status === 'pending' || l.status === 'pending_hr' || l.status === 'pending_manager'
                ? '#FFEB3B'
                : '#FF3B30',
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
