import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const guardId = req.headers.get('x-mock-guard-id'); // TODO: Replace with real Auth

  if (!guardId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  try {
    const activeShift = await prisma.shift.findFirst({
      where: {
        guardId,
        status: { in: ['scheduled', 'in_progress'] }, // Shift must be scheduled or in progress
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: { site: true, shiftType: true, guard: true }, // Include new relations
    });

    return NextResponse.json({ activeShift });
  } catch (error) {
    console.error('Error fetching active shift:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
