import { AttendanceStatus, ShiftStatus } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';

export type TotalAttendanceForDashboard = {
  dateKey: string;
  attendanceRate: number;
  attendedCount: number;
  eligibleCount: number;
  yesterdayAttendanceRate: number;
  deltaVsYesterday: number;
  lastUpdatedAt: string;
};

function toRate(attended: number, eligible: number): number {
  if (eligible <= 0) return 0;
  return Math.round((attended / eligible) * 100);
}

export async function getTotalAttendanceForDashboard(now: Date, siteId?: string): Promise<TotalAttendanceForDashboard> {
  const today = getBusinessDayRange(now, BUSINESS_TIMEZONE);
  const yesterdayAnchor = new Date(today.start.getTime() - 1);
  const yesterday = getBusinessDayRange(yesterdayAnchor, BUSINESS_TIMEZONE);
  const todayCutoff = new Date(today.start.getTime() + today.minutesSinceMidnight * 60_000);
  const todayDate = new Date(`${today.dateKey}T00:00:00.000Z`);
  const yesterdayDate = new Date(`${yesterday.dateKey}T00:00:00.000Z`);

  const baseWhere = {
    deletedAt: null,
    employeeId: { not: null },
    status: { not: ShiftStatus.cancelled },
    ...(siteId ? { siteId } : {}),
  };
  const todayDateWhere = {
    ...baseWhere,
    date: todayDate,
  };
  const todayStartedWhere = {
    ...todayDateWhere,
    startsAt: { lte: todayCutoff },
  };
  const yesterdayWhere = {
    ...baseWhere,
    date: yesterdayDate,
  };

  const [todayShifts, yesterdayShifts] = await Promise.all([
    prisma.shift.findMany({
      where: todayStartedWhere,
      select: {
        id: true,
        attendance: {
          select: {
            status: true,
          },
        },
      },
    }),
    prisma.shift.findMany({
      where: yesterdayWhere,
      select: {
        id: true,
        attendance: {
          select: {
            status: true,
          },
        },
      },
    }),
  ]);

  const attendedStatuses = new Set<AttendanceStatus>([
    AttendanceStatus.present,
    AttendanceStatus.late,
    AttendanceStatus.clocked_out,
  ]);

  const attendedCount = todayShifts.reduce((acc, shift) => {
    return acc + (shift.attendance && attendedStatuses.has(shift.attendance.status) ? 1 : 0);
  }, 0);
  const eligibleCount = todayShifts.length;
  const attendanceRate = toRate(attendedCount, eligibleCount);

  const yesterdayAttendedCount = yesterdayShifts.reduce((acc, shift) => {
    return acc + (shift.attendance && attendedStatuses.has(shift.attendance.status) ? 1 : 0);
  }, 0);
  const yesterdayEligibleCount = yesterdayShifts.length;
  const yesterdayAttendanceRate = toRate(yesterdayAttendedCount, yesterdayEligibleCount);

  return {
    dateKey: today.dateKey,
    attendanceRate,
    attendedCount,
    eligibleCount,
    yesterdayAttendanceRate,
    deltaVsYesterday: attendanceRate - yesterdayAttendanceRate,
    lastUpdatedAt: new Date().toISOString(),
  };
}
