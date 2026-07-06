import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import {
  getSystemSetting,
  getLatestOfficeAttendanceInRange,
  getLatestOfficeAttendanceForDay,
  getTodayOfficeAttendance,
  resolveOfficeAttendanceContextForEmployee,
  getBusinessDayRange,
  BUSINESS_TIMEZONE,
} from '@repo/database';
import type { OfficeAttendance, OfficeAttendanceState } from '@repo/types';
import { ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING, OFFICE_ATTENDANCE_CLOCK_OUT_GRACE_HOURS } from '@repo/shared';
import { addDays } from 'date-fns';

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
    const leaveEffectsSetting = await getSystemSetting(ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING);
    const leaveEffectsEnabled = leaveEffectsSetting?.value === '1';
    const days = [];

    // Fetch for the next 7 days (including today)
    for (let i = 0; i < 7; i++) {
      const { start: displayDate } = getBusinessDayRange(addDays(now, i), BUSINESS_TIMEZONE);
      const stateDate = i === 0 ? now : displayDate;

      const [attendances, displayScheduleContext, stateScheduleContext, latestAttendanceForDay] = await Promise.all([
        getTodayOfficeAttendance(employee.id, displayDate),
        resolveOfficeAttendanceContextForEmployee(employee.id, displayDate),
        resolveOfficeAttendanceContextForEmployee(employee.id, stateDate),
        getLatestOfficeAttendanceForDay(employee.id, displayDate),
      ]);

      const latestAttendanceInWindow =
        stateScheduleContext.windowStart && stateScheduleContext.windowEnd
          ? await getLatestOfficeAttendanceInRange(employee.id, stateScheduleContext.windowStart, stateScheduleContext.windowEnd)
          : null;

      const latestAttendance =
        latestAttendanceInWindow?.status === 'present'
          ? latestAttendanceInWindow
          : latestAttendanceForDay?.status === 'present'
            ? latestAttendanceForDay
            : latestAttendanceInWindow;

      const attendanceState = getOfficeAttendanceState({
        scheduleContext: stateScheduleContext,
        latestAttendance,
        latestTodayAttendance: attendances[0] ?? null,
        leaveEffectsEnabled,
        canClockOutOpenAttendance: latestAttendance?.status === 'present' && isWithinClockOutGrace(now, stateScheduleContext.windowEnd),
      });
      const filteredAttendances = attendances.filter(attendance => isClockHistoryStatus(attendance.status));

      days.push({
        date: displayDate.toISOString(),
        dateKey: displayScheduleContext.businessDay?.dateKey ?? null,
        isWorkingDay: displayScheduleContext.isWorkingDay,
        scheduledStartStr: formatMinutesAsTime(displayScheduleContext.startMinutes),
        scheduledEndStr: formatMinutesAsTime(displayScheduleContext.endMinutes),
        holidayPolicy: displayScheduleContext.holidayPolicy ?? null,
        effectiveAttendanceMode:
          displayScheduleContext.effectiveAttendanceMode ??
          (employee.officeId ? (employee.fieldModeEnabled ? 'non_office' : 'office_required') : 'non_office'),
        attendancePolicySource:
          displayScheduleContext.attendancePolicySource ?? (!employee.officeId ? 'no_office_employee' : 'employee_default'),
        attendances: filteredAttendances,
        attendanceState,
      });
    }

    return NextResponse.json({ days });
  } catch (error: unknown) {
    console.error('Error fetching weekly office attendance:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
