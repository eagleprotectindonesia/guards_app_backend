import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getTodayOfficeAttendance, resolveOfficeWorkScheduleContextForEmployee } from '@repo/database';

function formatMinutesAsTime(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return null;

  const normalized = Math.max(0, Math.trunc(minutes));
  const hours = Math.floor(normalized / 60) % 24;
  const mins = normalized % 60;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export async function GET() {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (employee.role !== 'office') {
    return NextResponse.json({ error: 'Only office employees can use this endpoint' }, { status: 403 });
  }

  try {
    const now = new Date();
    const [attendances, scheduleContext] = await Promise.all([
      getTodayOfficeAttendance(employee.id),
      resolveOfficeWorkScheduleContextForEmployee(employee.id, now),
    ]);

    return NextResponse.json({
      attendances,
      scheduleContext: {
        ...scheduleContext,
        businessDateStr: scheduleContext.businessDay?.dateKey ?? null,
        scheduledStartStr: formatMinutesAsTime(scheduleContext.startMinutes),
        scheduledEndStr: formatMinutesAsTime(scheduleContext.endMinutes),
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching today office attendance:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
