import { NextResponse } from 'next/server';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { prisma } from '@/lib/prisma';
import { calculateCheckInWindow } from '@/lib/scheduling';

export async function GET() {
  const guard = await getAuthenticatedGuard();

  if (!guard) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guardId = guard.id;

  const now = new Date();

  try {
    // Find shifts that are either currently active or starting within the next 5 minutes
    const activeShift = await prisma.shift.findFirst({
      where: {
        guardId,
        status: { in: ['scheduled', 'in_progress'] }, // Shift must be scheduled or in progress
        startsAt: { lte: new Date(now.getTime() + 5 * 60000) }, // Include shifts starting within 5 minutes
        endsAt: { gte: new Date(now.getTime() - 5 * 60000) },
      },
      include: { site: true, shiftType: true, guard: true, attendance: true }, // Include new relations
    });

    let activeShiftWithWindow = null;
    if (activeShift) {
      const window = calculateCheckInWindow(
        activeShift.startsAt,
        activeShift.endsAt,
        activeShift.requiredCheckinIntervalMins,
        activeShift.graceMinutes,
        now,
        activeShift.lastHeartbeatAt
      );
      activeShiftWithWindow = { ...activeShift, checkInWindow: window };
    }

    // Find the next upcoming shifts (that isn't considered active due to early start)
    const nextShifts = await prisma.shift.findMany({
      where: {
        guardId,
        status: { in: ['scheduled'] }, // Only scheduled shifts
        startsAt: { gt: now },
        NOT: activeShift ? { id: activeShift.id } : {}, // Exclude the active shift
      },
      orderBy: {
        startsAt: 'asc',
      },
      take: 4,
      include: { site: true, shiftType: true, guard: true, attendance: true }, // Include same relations as active shift
    });

    return NextResponse.json({ activeShift: activeShiftWithWindow, nextShifts });
  } catch (error) {
    console.error('Error fetching shifts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
