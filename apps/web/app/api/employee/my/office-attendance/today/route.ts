import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import {
  getOfficeAttendanceInRange,
  getSystemSetting,
  getLatestOfficeAttendanceForEmployee,
  getLatestOfficeAttendanceInRange,
  getLatestOfficeAttendanceForDay,
  getTodayOfficeAttendance,
  resolveOfficeAttendanceContextForEmployee,
} from '@repo/database';
import type { OfficeAttendance, OfficeAttendanceState } from '@repo/types';
import { ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING } from '@repo/shared';

function formatMinutesAsTime(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return null;

  const normalized = Math.max(0, Math.trunc(minutes));
  const hours = Math.floor(normalized / 60) % 24;
  const mins = normalized % 60;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function getOfficeAttendanceState(params: {
  scheduleContext: Awaited<ReturnType<typeof resolveOfficeAttendanceContextForEmployee>>;
  latestAttendance: OfficeAttendance | null;
  latestTodayAttendance: OfficeAttendance | null;
  leaveEffectsEnabled: boolean;
}): OfficeAttendanceState {
  const { scheduleContext, latestAttendance, latestTodayAttendance, leaveEffectsEnabled } = params;
  const effectiveLatestAttendance = latestAttendance ?? latestTodayAttendance;

  if (!scheduleContext.isWorkingDay) {
    return {
      status: 'non_working_day',
      canClockIn: false,
      canClockOut: false,
      windowClosed: false,
      messageCode: 'not_working_day',
      latestAttendance: effectiveLatestAttendance,
    };
  }

  if (leaveEffectsEnabled && effectiveLatestAttendance?.status === 'leave') {
    return {
      status: 'leave',
      canClockIn: false,
      canClockOut: false,
      windowClosed: true,
      messageCode: 'leave_marked',
      latestAttendance: effectiveLatestAttendance,
    };
  }

  if (effectiveLatestAttendance?.status === 'absent') {
    return {
      status: 'absent',
      canClockIn: false,
      canClockOut: false,
      windowClosed: true,
      messageCode: 'absent_marked',
      latestAttendance: effectiveLatestAttendance,
    };
  }

  if (effectiveLatestAttendance?.status === 'clocked_out') {
    return {
      status: 'completed',
      canClockIn: false,
      canClockOut: false,
      windowClosed: true,
      messageCode: 'attendance_completed',
      latestAttendance: effectiveLatestAttendance,
    };
  }

  if (effectiveLatestAttendance?.status === 'present') {
    return {
      status: 'clocked_in',
      canClockIn: false,
      canClockOut: true,
      windowClosed: false,
      messageCode: scheduleContext.isLate ? 'already_clocked_in' : null,
      latestAttendance: effectiveLatestAttendance,
    };
  }

  if (scheduleContext.isAfterEnd) {
    return {
      status: 'missed',
      canClockIn: false,
      canClockOut: false,
      windowClosed: true,
      messageCode: 'office_hours_ended',
      latestAttendance: effectiveLatestAttendance,
    };
  }

  return {
    status: 'available',
    canClockIn: true,
    canClockOut: false,
    windowClosed: false,
    messageCode: scheduleContext.isLate ? 'late_window_open' : null,
    latestAttendance: effectiveLatestAttendance,
  };
}

function resolveLatestAttendanceForState(params: {
  scheduleContext: Awaited<ReturnType<typeof resolveOfficeAttendanceContextForEmployee>>;
  latestAttendanceInWindow: OfficeAttendance | null;
  latestAttendanceForDay: OfficeAttendance | null;
}): OfficeAttendance | null {
  const { scheduleContext, latestAttendanceInWindow, latestAttendanceForDay } = params;

  if (latestAttendanceInWindow?.status === 'present') {
    return latestAttendanceInWindow;
  }

  if (latestAttendanceForDay?.status === 'present') {
    return latestAttendanceForDay;
  }

  if (latestAttendanceInWindow) {
    return latestAttendanceInWindow;
  }

  if (scheduleContext.source !== 'office_shift') {
    return latestAttendanceForDay;
  }

  // For office shifts, ignore closed attendances from a different shift so card can move to upcoming shift.
  if (!scheduleContext.shift) {
    return null;
  }

  if (latestAttendanceForDay?.officeShiftId === scheduleContext.shift.id) {
    return latestAttendanceForDay;
  }

  return null;
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
    const [attendances, scheduleContext, latestAttendanceForDay, latestAttendanceForEmployee, leaveEffectsSetting] =
      await Promise.all([
      getTodayOfficeAttendance(employee.id),
      resolveOfficeAttendanceContextForEmployee(employee.id, now),
      getLatestOfficeAttendanceForDay(employee.id, now),
      getLatestOfficeAttendanceForEmployee(employee.id),
      getSystemSetting(ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING),
    ]);
    const leaveEffectsEnabled = leaveEffectsSetting?.value === '1';
    const latestAttendanceInWindow =
      scheduleContext.windowStart && scheduleContext.windowEnd
        ? await getLatestOfficeAttendanceInRange(employee.id, scheduleContext.windowStart, scheduleContext.windowEnd)
        : null;
    const windowAttendances =
      scheduleContext.windowStart && scheduleContext.windowEnd
        ? await getOfficeAttendanceInRange(employee.id, scheduleContext.windowStart, scheduleContext.windowEnd)
        : [];
    const latestAttendance = resolveLatestAttendanceForState({
      scheduleContext,
      latestAttendanceInWindow,
      latestAttendanceForDay,
    });
    const fallbackOpenAttendance =
      !latestAttendance && scheduleContext.source === 'office_shift' && !scheduleContext.shift && latestAttendanceForEmployee?.status === 'present'
        ? latestAttendanceForEmployee
        : null;
    const attendanceState = getOfficeAttendanceState({
      scheduleContext,
      latestAttendance: latestAttendance ?? fallbackOpenAttendance,
      latestTodayAttendance: attendances[0] ?? null,
      leaveEffectsEnabled,
    });

    return NextResponse.json({
      attendances,
      displayAttendances: attendances.length > 0 ? attendances : fallbackOpenAttendance ? [fallbackOpenAttendance] : windowAttendances,
      attendanceState,
      scheduleContext: {
        ...scheduleContext,
        holidayPolicy: scheduleContext.holidayPolicy ?? null,
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
