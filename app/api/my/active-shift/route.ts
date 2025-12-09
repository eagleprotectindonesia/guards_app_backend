import { NextResponse } from 'next/server';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const guard = await getAuthenticatedGuard();

  if (!guard) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guardId = guard.id;

  const now = new Date();

  try {
    const activeShift = await prisma.shift.findFirst({
      where: {
        guardId,
        status: { in: ['scheduled', 'in_progress'] }, // Shift must be scheduled or in progress
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: { site: true, shiftType: true, guard: true, attendance: true }, // Include new relations
    });

    return NextResponse.json({ activeShift });
  } catch (error) {
    console.error('Error fetching active shift:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
