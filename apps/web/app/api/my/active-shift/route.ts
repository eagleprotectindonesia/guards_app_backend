import { NextResponse } from 'next/server';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { calculateCheckInWindow } from '@/lib/scheduling';
import { getGuardActiveAndUpcomingShifts } from '@/lib/data-access/shifts';

export async function GET() {
  const guard = await getAuthenticatedGuard();

  if (!guard) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guardId = guard.id;
  const now = new Date();

  try {
    const { activeShift, nextShifts } = await getGuardActiveAndUpcomingShifts(guardId, now);

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

    return NextResponse.json({ activeShift: activeShiftWithWindow, nextShifts });
  } catch (error) {
    console.error('Error fetching shifts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
