import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  // Note: Auth check (Admin only) is handled by proxy.ts
  try {
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get('siteId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const where = {
      ...(siteId && { siteId }),
      ...(from && to && { date: { gte: new Date(from), lte: new Date(to) } }),
    };

    const shifts = await prisma.shift.findMany({
      where,
      include: { shiftType: true, guard: true },
      orderBy: { startsAt: 'asc' },
    });
    return NextResponse.json(shifts);
  } catch (error) {
    console.error('Error fetching shifts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

