import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { calculateCheckInWindow } from '@/lib/scheduling';
import { getEmployeeActiveAndUpcomingShifts } from '@/lib/data-access/shifts';

export async function GET() {
  const employee = await getAuthenticatedEmployee();

  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const employeeId = employee.id;
  const now = new Date();

  try {
    const { activeShift, nextShifts } = await getEmployeeActiveAndUpcomingShifts(employeeId, now);

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