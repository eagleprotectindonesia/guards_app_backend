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

type OpenAttendanceLike = Pick<OfficeAttendance, 'status' | 'officeShiftId'> & {
  officeShift?: {
    startsAt?: string | Date | null;
    endsAt?: string | Date | null;
  } | null;
  businessDate?: string | Date | null;
};

function resolveOpenAttendanceWindowEnd(
  attendance: OpenAttendanceLike | null | undefined,
  scheduleContext: Awaited<ReturnType<typeof resolveOfficeAttendanceContextForEmployee>>
) {
  if (!attendance || attendance.status !== 'present') return null;
  if (attendance.officeShift?.endsAt) {
    const shiftEnd = new Date(attendance.officeShift.endsAt);
    if (!Number.isNaN(shiftEnd.getTime())) return shiftEnd;
  }

  if (scheduleContext.source !== 'office_shift') {
    return scheduleContext.windowEnd ?? null;
  }

  if (attendance.officeShiftId && scheduleContext.shift?.id && attendance.officeShiftId === scheduleContext.shift.id) {
    return scheduleContext.windowEnd ?? null;
  }

  return null;
}

function resolveDisplayContext(params: {
  displayScheduleContext: Awaited<ReturnType<typeof resolveOfficeAttendanceContextForEmployee>>;
  prioritizedOpenAttendance: OpenAttendanceLike | null;
}) {
  const { displayScheduleContext, prioritizedOpenAttendance } = params;
  const shiftStartsAt = prioritizedOpenAttendance?.officeShift?.startsAt
    ? new Date(prioritizedOpenAttendance.officeShift.startsAt)
    : null;
  const shiftEndsAt = prioritizedOpenAttendance?.officeShift?.endsAt
    ? new Date(prioritizedOpenAttendance.officeShift.endsAt)
    : null;

  if (
    !prioritizedOpenAttendance?.officeShift ||
    !shiftStartsAt ||
    !shiftEndsAt ||
    Number.isNaN(shiftStartsAt.getTime()) ||
    Number.isNaN(shiftEndsAt.getTime())
  ) {
    return {
      ...displayScheduleContext,
      holidayPolicy: displayScheduleContext.holidayPolicy ?? null,
      businessDateStr: displayScheduleContext.businessDay?.dateKey ?? null,
      scheduledStartStr: formatMinutesAsTime(displayScheduleContext.startMinutes),
      scheduledEndStr: formatMinutesAsTime(displayScheduleContext.endMinutes),
    };
  }

  const attendanceBusinessDate =
    prioritizedOpenAttendance.businessDate != null ? new Date(prioritizedOpenAttendance.businessDate) : null;
  const businessDateStr =
    attendanceBusinessDate && !Number.isNaN(attendanceBusinessDate.getTime())
      ? attendanceBusinessDate.toISOString().slice(0, 10)
      : shiftStartsAt.toISOString().slice(0, 10);

  return {
    ...displayScheduleContext,
    holidayPolicy: displayScheduleContext.holidayPolicy ?? null,
    businessDateStr,
    scheduledStartStr: formatMinutesAsTime(shiftStartsAt.getUTCHours() * 60 + shiftStartsAt.getUTCMinutes()),
    scheduledEndStr: formatMinutesAsTime(shiftEndsAt.getUTCHours() * 60 + shiftEndsAt.getUTCMinutes()),
  };
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
    const previousOpenAttendanceCandidate =
      stateScheduleContext.source === 'office_shift' &&
      latestAttendanceForEmployee?.status === 'present' &&
      latestAttendanceForEmployee.officeShiftId &&
      stateScheduleContext.shift?.id &&
      latestAttendanceForEmployee.officeShiftId !== stateScheduleContext.shift.id
        ? latestAttendanceForEmployee
        : null;
    const previousOpenAttendanceWindowEnd = resolveOpenAttendanceWindowEnd(
      previousOpenAttendanceCandidate,
      stateScheduleContext
    );
    const shouldPrioritizePreviousOpenAttendance =
      previousOpenAttendanceCandidate != null && isWithinClockOutGrace(now, previousOpenAttendanceWindowEnd);
    const prioritizedOpenAttendance = shouldPrioritizePreviousOpenAttendance ? previousOpenAttendanceCandidate : null;
    const effectiveOpenAttendance = prioritizedOpenAttendance ?? latestAttendance ?? fallbackOpenAttendance;
    const effectiveOpenAttendanceWindowEnd = resolveOpenAttendanceWindowEnd(
      effectiveOpenAttendance,
      stateScheduleContext
    );
    const canClockOutOpenAttendance =
      effectiveOpenAttendance?.status === 'present' && isWithinClockOutGrace(now, effectiveOpenAttendanceWindowEnd);
    const attendanceState = getOfficeAttendanceState({
      scheduleContext: stateScheduleContext,
      latestAttendance: effectiveOpenAttendance,
      latestTodayAttendance: attendances[0] ?? null,
      leaveEffectsEnabled,
      canClockOutOpenAttendance,
    });
    const filteredAttendances = attendances.filter(attendance => isClockHistoryStatus(attendance.status));
    const scheduleContext = resolveDisplayContext({
      displayScheduleContext,
      prioritizedOpenAttendance,
    });

    return NextResponse.json({
      attendances: filteredAttendances,
      displayAttendances:
        attendances.length > 0
          ? attendances
          : prioritizedOpenAttendance
            ? [prioritizedOpenAttendance]
            : fallbackOpenAttendance
              ? [fallbackOpenAttendance]
              : windowAttendances,
      attendanceState,
      scheduleContext,
    });
  } catch (error: unknown) {
    console.error('Error fetching today office attendance:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
