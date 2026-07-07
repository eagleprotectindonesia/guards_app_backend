import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { calendarListSchema } from '@repo/validations';
import { startOfDay, endOfDay, parseISO } from 'date-fns';

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

    const where: Record<string, unknown> = {
      deletedAt: null,
      endDate: { gte: fromDate },
      startDate: { lte: toDate },
    };

    if (employeeIdFilter) {
      where.employeeId = employeeIdFilter;
    }

    const rows = await prisma.calendarEvent.groupBy({
      by: ['startDate'],
      where: where as Record<string, unknown>,
      _count: { id: true },
      orderBy: { startDate: 'asc' },
    });

    const days = rows.map((r) => ({
      date: r.startDate.toISOString().slice(0, 10),
      count: r._count.id,
    }));

    return NextResponse.json({ days });
  } catch (error: unknown) {
    console.error('Error fetching calendar day summary:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
