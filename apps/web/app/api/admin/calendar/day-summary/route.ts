import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { calendarListSchema } from '@repo/validations';
import { startOfDay, endOfDay, eachDayOfInterval, parseISO } from 'date-fns';

function expandToDays(startDate: Date, endDate: Date, from: Date, to: Date): Date[] {
  const rangeStart = startDate > from ? startDate : from;
  const rangeEnd = endDate < to ? endDate : to;
  return eachDayOfInterval({ start: rangeStart, end: rangeEnd });
}

export async function GET(req: Request) {
  await requirePermission('user-calendar:view');

  try {
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const employeeIdFilter = searchParams.get('employeeId');

    const parsed = calendarListSchema.safeParse({ from: fromParam, to: toParam });
    if (!parsed.success) {
      return NextResponse.json({ error: 'from and to query parameters are required (YYYY-MM-DD)' }, { status: 400 });
    }

    const fromDate = startOfDay(parseISO(parsed.data.from));
    const toDate = endOfDay(parseISO(parsed.data.to));

    const eventWhere: Record<string, unknown> = {
      deletedAt: null,
      endDate: { gte: fromDate },
      startDate: { lte: toDate },
    };

    if (employeeIdFilter) {
      eventWhere.OR = [
        { employeeId: employeeIdFilter },
        { tags: { some: { employeeId: employeeIdFilter, participantType: 'employee' } } },
      ];
    }

    const [calendarEvents, holidays, memos] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: eventWhere as Record<string, unknown>,
        select: { startDate: true, endDate: true },
      }),
      prisma.holidayCalendarEntry.findMany({
        where: { startDate: { lte: toDate }, endDate: { gte: fromDate } },
        select: { startDate: true, endDate: true },
      }),
      prisma.officeMemo.findMany({
        where: { isActive: true, startDate: { lte: toDate }, endDate: { gte: fromDate } },
        select: { startDate: true, endDate: true },
      }),
    ]);

    const dayCounts = new Map<string, number>();

    const countRange = (start: Date, end: Date) => {
      const days = expandToDays(start, end, fromDate, toDate);
      for (const day of days) {
        const key = day.toISOString().slice(0, 10);
        dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
      }
    };

    for (const e of calendarEvents) countRange(e.startDate, e.endDate);
    for (const h of holidays) countRange(h.startDate, h.endDate);
    for (const m of memos) countRange(m.startDate, m.endDate);

    const days = Array.from(dayCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ days });
  } catch (error: unknown) {
    console.error('Error fetching calendar day summary:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
