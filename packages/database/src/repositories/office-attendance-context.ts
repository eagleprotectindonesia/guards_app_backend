import { db as prisma } from '../prisma/client';
import {
  getScheduledPaidMinutesForFixedOfficeScheduleAttendance,
  resolveOfficeWorkScheduleContextForEmployee,
} from './office-work-schedules';
import { resolveOfficeDayOverrideAnchorsForEmployee } from './office-day-overrides';
import {
  getScheduledPaidMinutesForOfficeShiftAttendance,
  resolveOfficeShiftContextForEmployee,
} from './office-shifts';

export async function resolveOfficeAttendanceContextForEmployee(employeeId: string, at = new Date()) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      role: true,
    },
  });

  if (!employee || employee.role !== 'office') {
    throw new Error('Only office employees have office attendance context');
  }

  const overrideAnchors = await resolveOfficeDayOverrideAnchorsForEmployee(employeeId, at);
  const offDateKeys = new Set<string>();
  const shiftOverrideDateKeys = new Set<string>();

  if (overrideAnchors.currentOverride?.overrideType === 'off') {
    offDateKeys.add(overrideAnchors.currentDateKey);
  } else if (overrideAnchors.currentOverride?.overrideType === 'shift_override') {
    shiftOverrideDateKeys.add(overrideAnchors.currentDateKey);
  }

  if (overrideAnchors.previousOverride?.overrideType === 'off') {
    offDateKeys.add(overrideAnchors.previousDateKey);
  } else if (overrideAnchors.previousOverride?.overrideType === 'shift_override') {
    shiftOverrideDateKeys.add(overrideAnchors.previousDateKey);
  }

  const shiftContext = await resolveOfficeShiftContextForEmployee(employeeId, at, {
    allowedDateKeys: shiftOverrideDateKeys,
  });
  if (shiftContext.shift) {
    return shiftContext;
  }

  if (overrideAnchors.currentOverride?.overrideType === 'off') {
    return {
      source: 'office_day_override_off' as const,
      shift: null,
      businessDay: overrideAnchors.businessDay,
      startMinutes: null,
      endMinutes: null,
      windowStart: null,
      windowEnd: null,
      isWorkingDay: false,
      isLate: false,
      isAfterEnd: false,
    };
  }

  if (overrideAnchors.currentOverride?.overrideType === 'shift_override') {
    return shiftContext;
  }

  const scheduleContext = await resolveOfficeWorkScheduleContextForEmployee(employeeId, at, {
    offDateKeys,
  });
  return {
    ...scheduleContext,
    source: 'office_work_schedule' as const,
    shift: null,
  };
}

export async function getScheduledPaidMinutesForOfficeAttendance(employeeId: string, at = new Date()) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      role: true,
    },
  });

  if (!employee || employee.role !== 'office') {
    return 0;
  }

  const attendanceContext = await resolveOfficeAttendanceContextForEmployee(employeeId, at);

  if (attendanceContext.source === 'office_day_override_off') {
    return 0;
  }

  if (attendanceContext.source === 'office_shift' && attendanceContext.shift) {
    return getScheduledPaidMinutesForOfficeShiftAttendance(employeeId, at);
  }

  const offDateKeys = new Set<string>();
  const overrideAnchors = await resolveOfficeDayOverrideAnchorsForEmployee(employeeId, at);
  if (overrideAnchors.currentOverride?.overrideType === 'off') {
    offDateKeys.add(overrideAnchors.currentDateKey);
  }
  if (overrideAnchors.previousOverride?.overrideType === 'off') {
    offDateKeys.add(overrideAnchors.previousDateKey);
  }

  return getScheduledPaidMinutesForFixedOfficeScheduleAttendance(employeeId, at, {
    offDateKeys,
  });
}
