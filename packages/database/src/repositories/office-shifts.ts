import { Prisma, ShiftStatus } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';

type TxLike = Prisma.TransactionClient | typeof prisma;

function getOfficeShiftWindowQuery(at: Date) {
  const businessDay = getBusinessDayRange(at, BUSINESS_TIMEZONE);

  return {
    businessDay,
    where: {
      deletedAt: null,
      startsAt: {
        lt: businessDay.end,
      },
      endsAt: {
        gt: businessDay.start,
      },
      status: {
        not: 'cancelled' as ShiftStatus,
      },
    },
  };
}

function getMinutesSinceMidnight(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? '0');

  return hour * 60 + minute;
}

export async function findRelevantOfficeShiftForEmployee(employeeId: string, at = new Date()) {
  const { businessDay, where } = getOfficeShiftWindowQuery(at);

  const shifts = await prisma.officeShift.findMany({
    where: {
      employeeId,
      ...where,
    },
    include: {
      officeShiftType: true,
    },
    orderBy: {
      startsAt: 'asc',
    },
  });

  const activeShift =
    shifts.find(shift => shift.startsAt.getTime() <= at.getTime() && shift.endsAt.getTime() >= at.getTime()) ?? null;
  if (activeShift) {
    return { shift: activeShift, businessDay };
  }

  const upcomingShift = shifts.find(shift => shift.startsAt.getTime() > at.getTime()) ?? null;
  if (upcomingShift) {
    return { shift: upcomingShift, businessDay };
  }

  const pastShift = [...shifts].reverse().find(shift => shift.endsAt.getTime() <= at.getTime()) ?? null;
  return { shift: pastShift, businessDay };
}

export async function resolveOfficeShiftContextForEmployee(employeeId: string, at = new Date()) {
  const { shift, businessDay } = await findRelevantOfficeShiftForEmployee(employeeId, at);

  if (!shift) {
    return {
      source: 'office_shift' as const,
      mode: 'shift_based' as const,
      shift: null,
      businessDay,
      startMinutes: null,
      endMinutes: null,
      windowStart: null,
      windowEnd: null,
      isWorkingDay: false,
      isLate: false,
      isAfterEnd: false,
    };
  }

  return {
    source: 'office_shift' as const,
    mode: 'shift_based' as const,
    shift,
    businessDay,
    startMinutes: getMinutesSinceMidnight(shift.startsAt, BUSINESS_TIMEZONE),
    endMinutes: getMinutesSinceMidnight(shift.endsAt, BUSINESS_TIMEZONE),
    windowStart: shift.startsAt,
    windowEnd: shift.endsAt,
    isWorkingDay: true,
    isLate: at.getTime() > shift.startsAt.getTime(),
    isAfterEnd: at.getTime() > shift.endsAt.getTime(),
  };
}

export async function getScheduledPaidMinutesForOfficeShiftAttendance(employeeId: string, at = new Date()) {
  const context = await resolveOfficeShiftContextForEmployee(employeeId, at);

  if (!context.shift || !context.windowStart || !context.windowEnd) {
    return 0;
  }

  return Math.max(0, Math.floor((context.windowEnd.getTime() - context.windowStart.getTime()) / 60_000));
}

export async function checkOverlappingOfficeShift(params: {
  employeeId: string;
  startsAt: Date;
  endsAt: Date;
  excludeOfficeShiftId?: string;
}) {
  const { employeeId, startsAt, endsAt, excludeOfficeShiftId } = params;

  return prisma.officeShift.findFirst({
    where: {
      employeeId,
      deletedAt: null,
      id: excludeOfficeShiftId ? { not: excludeOfficeShiftId } : undefined,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
}

export async function deleteFutureOfficeShiftsByEmployee(employeeId: string, tx: TxLike) {
  const now = new Date();
  const futureShifts = await tx.officeShift.findMany({
    where: {
      employeeId,
      deletedAt: null,
      startsAt: {
        gte: now,
      },
    },
    select: {
      id: true,
    },
  });

  if (futureShifts.length === 0) return 0;

  const shiftIds = futureShifts.map(shift => shift.id);
  await tx.officeShift.updateMany({
    where: {
      id: {
        in: shiftIds,
      },
    },
    data: {
      deletedAt: now,
      status: 'cancelled',
    },
  });

  await tx.changelog.create({
    data: {
      action: 'BULK_DELETE',
      entityType: 'OfficeShift',
      entityId: `employee:${employeeId}`,
      actor: 'system',
      details: {
        reason: 'OFFICE_ATTENDANCE_MODE_CHANGE',
        count: shiftIds.length,
        officeShiftIds: shiftIds,
      },
    },
  });

  return shiftIds.length;
}
