import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import {
  getLatestOfficeAttendanceInRange,
  getTodayOfficeAttendance,
  resolveOfficeWorkScheduleContextForEmployee,
} from '@repo/database';
import type { OfficeAttendance, OfficeAttendanceState } from '@repo/types';

function formatMinutesAsTime(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return null;

  const normalized = Math.max(0, Math.trunc(minutes));
  const hours = Math.floor(normalized / 60) % 24;
  const mins = normalized % 60;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function getOfficeAttendanceState(params: {
  scheduleContext: Awaited<ReturnType<typeof resolveOfficeWorkScheduleContextForEmployee>>;
  latestAttendance: OfficeAttendance | null;
}): OfficeAttendanceState {
  const { scheduleContext, latestAttendance } = params;

  if (!scheduleContext.isWorkingDay) {
    return {
      status: 'non_working_day',
      canClockIn: false,
      canClockOut: false,
      windowClosed: false,
      messageCode: 'not_working_day',
      latestAttendance,
    };
  }

  if (latestAttendance?.status === 'clocked_out') {
    return {
      status: 'completed',
      canClockIn: false,
      canClockOut: false,
      windowClosed: true,
      messageCode: 'attendance_completed',
      latestAttendance,
    };
  }

  if (latestAttendance?.status === 'present') {
    return {
      status: 'clocked_in',
      canClockIn: false,
      canClockOut: true,
      windowClosed: false,
      messageCode: scheduleContext.isLate ? 'already_clocked_in' : null,
      latestAttendance,
    };
  }

  if (scheduleContext.isAfterEnd) {
    return {
      status: 'missed',
      canClockIn: false,
      canClockOut: false,
      windowClosed: true,
      messageCode: 'office_hours_ended',
      latestAttendance,
    };
  }

  return {
    status: 'available',
    canClockIn: true,
    canClockOut: false,
    windowClosed: false,
    messageCode: scheduleContext.isLate ? 'late_window_open' : null,
    latestAttendance,
  };
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
    const latestAttendance =
      scheduleContext.windowStart && scheduleContext.windowEnd
        ? await getLatestOfficeAttendanceInRange(employee.id, scheduleContext.windowStart, scheduleContext.windowEnd)
        : null;
    const attendanceState = getOfficeAttendanceState({ scheduleContext, latestAttendance });

    return NextResponse.json({
      attendances,
      attendanceState,
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
