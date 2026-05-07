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
import { ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING, OFFICE_ATTENDANCE_CLOCK_OUT_GRACE_HOURS } from '@repo/shared';
import { startOfDay } from 'date-fns';

function formatMinutesAsTime(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return null;

  const normalized = Math.max(0, Math.trunc(minutes));
  const hours = Math.floor(normalized / 60) % 24;
  const mins = normalized % 60;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function isClockHistoryStatus(status: OfficeAttendance['status']) {
  return status === 'present' || status === 'clocked_out';
}

function resolveClockOutGraceDeadline(windowEnd: Date | null | undefined) {
  if (!(windowEnd instanceof Date) || Number.isNaN(windowEnd.getTime())) return null;
  return new Date(windowEnd.getTime() + OFFICE_ATTENDANCE_CLOCK_OUT_GRACE_HOURS * 60 * 60 * 1000);
}

function isWithinClockOutGrace(now: Date, windowEnd: Date | null | undefined) {
  const deadline = resolveClockOutGraceDeadline(windowEnd);
  if (!deadline) return false;
  return now.getTime() <= deadline.getTime();
}

function getOfficeAttendanceState(params: {
  scheduleContext: Awaited<ReturnType<typeof resolveOfficeAttendanceContextForEmployee>>;
  latestAttendance: OfficeAttendance | null;
  latestTodayAttendance: OfficeAttendance | null;
  leaveEffectsEnabled: boolean;
  canClockOutOpenAttendance: boolean;
}): OfficeAttendanceState {
  const { scheduleContext, latestAttendance, latestTodayAttendance, leaveEffectsEnabled, canClockOutOpenAttendance } = params;
  const effectiveLatestAttendance = latestAttendance ?? latestTodayAttendance;

  if (effectiveLatestAttendance?.status === 'present' && canClockOutOpenAttendance) {
    return {
      status: 'clocked_in',
      canClockIn: false,
      canClockOut: true,
      windowClosed: false,
      messageCode: scheduleContext.isLate ? 'already_clocked_in' : null,
      latestAttendance: effectiveLatestAttendance,
    };
  }

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
    if (scheduleContext.source !== 'office_shift') {
      return latestAttendanceForDay;
    }

    if (scheduleContext.shift && latestAttendanceForDay.officeShiftId === scheduleContext.shift.id) {
      return latestAttendanceForDay;
    }
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
    const displayDate = startOfDay(now);
    const [attendances, displayScheduleContext, stateScheduleContext, latestAttendanceForDay, latestAttendanceForEmployee, leaveEffectsSetting] =
      await Promise.all([
      getTodayOfficeAttendance(employee.id, displayDate),
      resolveOfficeAttendanceContextForEmployee(employee.id, displayDate),
      resolveOfficeAttendanceContextForEmployee(employee.id, now),
      getLatestOfficeAttendanceForDay(employee.id, displayDate),
      getLatestOfficeAttendanceForEmployee(employee.id),
      getSystemSetting(ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING),
    ]);
    const leaveEffectsEnabled = leaveEffectsSetting?.value === '1';
    const latestAttendanceInWindow =
      stateScheduleContext.windowStart && stateScheduleContext.windowEnd
        ? await getLatestOfficeAttendanceInRange(employee.id, stateScheduleContext.windowStart, stateScheduleContext.windowEnd)
        : null;
    const windowAttendances =
      stateScheduleContext.windowStart && stateScheduleContext.windowEnd
        ? await getOfficeAttendanceInRange(employee.id, stateScheduleContext.windowStart, stateScheduleContext.windowEnd)
        : [];
    const latestAttendance = resolveLatestAttendanceForState({
      scheduleContext: stateScheduleContext,
      latestAttendanceInWindow,
      latestAttendanceForDay,
    });
    const shouldUseOpenAttendanceFallback =
      !latestAttendance &&
      stateScheduleContext.source === 'office_shift' &&
      latestAttendanceForEmployee?.status === 'present' &&
      !stateScheduleContext.shift;
    const fallbackOpenAttendance = shouldUseOpenAttendanceFallback ? latestAttendanceForEmployee : null;
    const effectiveOpenAttendance = latestAttendance ?? fallbackOpenAttendance;
    const canClockOutOpenAttendance =
      effectiveOpenAttendance?.status === 'present' && isWithinClockOutGrace(now, stateScheduleContext.windowEnd);
    const attendanceState = getOfficeAttendanceState({
      scheduleContext: stateScheduleContext,
      latestAttendance: effectiveOpenAttendance,
      latestTodayAttendance: attendances[0] ?? null,
      leaveEffectsEnabled,
      canClockOutOpenAttendance,
    });
    const filteredAttendances = attendances.filter(attendance => isClockHistoryStatus(attendance.status));

    return NextResponse.json({
      attendances: filteredAttendances,
      displayAttendances: attendances.length > 0 ? attendances : fallbackOpenAttendance ? [fallbackOpenAttendance] : windowAttendances,
      attendanceState,
      scheduleContext: {
        ...displayScheduleContext,
        holidayPolicy: displayScheduleContext.holidayPolicy ?? null,
        businessDateStr: displayScheduleContext.businessDay?.dateKey ?? null,
        scheduledStartStr: formatMinutesAsTime(displayScheduleContext.startMinutes),
        scheduledEndStr: formatMinutesAsTime(displayScheduleContext.endMinutes),
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching today office attendance:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
