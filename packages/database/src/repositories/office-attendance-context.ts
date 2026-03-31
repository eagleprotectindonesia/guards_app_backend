import { db as prisma } from '../prisma/client';
import {
  getScheduledPaidMinutesForFixedOfficeScheduleAttendance,
  resolveOfficeWorkScheduleContextForEmployee,
} from './office-work-schedules';
import {
  getScheduledPaidMinutesForOfficeShiftAttendance,
  resolveOfficeShiftContextForEmployee,
} from './office-shifts';

export async function resolveOfficeAttendanceContextForEmployee(employeeId: string, at = new Date()) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      role: true,
      officeAttendanceMode: true,
    },
  });

  if (!employee || employee.role !== 'office') {
    throw new Error('Only office employees have office attendance context');
  }

  const mode = employee.officeAttendanceMode ?? 'shift_based';

  if (mode === 'fixed_schedule') {
    const context = await resolveOfficeWorkScheduleContextForEmployee(employeeId, at);
    return {
      ...context,
      mode,
      source: 'office_work_schedule' as const,
      shift: null,
    };
  }

  return resolveOfficeShiftContextForEmployee(employeeId, at);
}

export async function getScheduledPaidMinutesForOfficeAttendance(employeeId: string, at = new Date()) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      role: true,
      officeAttendanceMode: true,
    },
  });

  if (!employee || employee.role !== 'office') {
    return 0;
  }

  const mode = employee.officeAttendanceMode ?? 'shift_based';
  if (mode === 'shift_based') {
    return getScheduledPaidMinutesForOfficeShiftAttendance(employeeId, at);
  }

  return getScheduledPaidMinutesForFixedOfficeScheduleAttendance(employeeId, at);
}
