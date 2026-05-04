import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import {
  getSystemSetting,
  getLatestOfficeAttendanceInRange,
  getLatestOfficeAttendanceForDay,
  getTodayOfficeAttendance,
  resolveOfficeAttendanceContextForEmployee,
} from '@repo/database';
import type { OfficeAttendance, OfficeAttendanceState } from '@repo/types';
import { ENABLE_OFFICE_ATTENDANCE_LEAVE_EFFECTS_SETTING } from '@repo/shared';
import { addDays, startOfDay } from 'date-fns';

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
      const displayDate = startOfDay(addDays(now, i));
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
      });

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
        attendances,
        attendanceState,
      });
    }

    return NextResponse.json({ days });
  } catch (error: unknown) {
    console.error('Error fetching weekly office attendance:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
