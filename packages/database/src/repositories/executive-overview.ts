import { db as prisma } from '../prisma/client';
import { redis } from '../redis/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';
import { isSecurityStandbyTitle } from './employees';
import { AttendanceStatus, ShiftStatus, TicketStatus } from '@prisma/client';

const OPEN_VIEW_EXCLUDED_STATUSES: TicketStatus[] = ['CLOSED', 'CANNOT_RESOLVE', 'CANCELLED'];

export type ExecutiveOverviewMetrics = {
  totalEmployees: number;
  activeSites: number;
  totalSites: number;
  activeGuardsOnDuty: number;
  scheduledShiftsToday: number;
  openTickets: {
    total: number;
    unassigned: number;
    inProgress: number;
    acknowledged: number;
  };
  workforceBreakdown: {
    onsite: number;
    control: number;
    office: number;
    total: number;
  };
  guardActivityToday: {
    scheduled: number;
    checkedIn: number;
    missedCheckIn: number;
    sosEmergencies: number;
  };
  todayOperationsSummary: {
    guardsOnDuty: number;
    activeSites: number;
    totalCheckins: number;
    lateGuards: number;
  };
  patrolCompletion: {
    expected: number;
    completed: number;
    missed: number;
  };
};

export async function getExecutiveOverviewMetrics(now: Date = new Date()): Promise<ExecutiveOverviewMetrics> {
  const { start, end } = getBusinessDayRange(now, BUSINESS_TIMEZONE);

  const [
    totalEmployees,
    totalSites,
    activeSites,
    activeGuardsOnDuty,
    scheduledShiftsToday,
    openTicketsTotal,
    unassignedTickets,
    inProgressTickets,
    acknowledgedTickets,
    onSiteEmployees,
    officeCount,
    checkedInAttendanceCount,
    totalCheckinsCount,
    lateGuardAttendanceCount,
    unresolvedPanicsStr,
    onSiteShifts,
  ] = await Promise.all([
    prisma.employee.count({
      where: { status: true, deletedAt: null },
    }),
    prisma.site.count({
      where: { deletedAt: null },
    }),
    prisma.site.count({
      where: { status: true, deletedAt: null },
    }),
    prisma.shift.count({
      where: { status: 'in_progress', deletedAt: null },
    }),
    prisma.shift.count({
      where: {
        status: { in: ['scheduled', 'in_progress'] },
        deletedAt: null,
        startsAt: { lt: end },
        endsAt: { gt: start },
      },
    }),
    prisma.ticket.count({
      where: { status: { notIn: OPEN_VIEW_EXCLUDED_STATUSES } },
    }),
    prisma.ticket.count({
      where: {
        status: { notIn: OPEN_VIEW_EXCLUDED_STATUSES },
        claimedByType: null,
      },
    }),
    prisma.ticket.count({
      where: { status: 'IN_PROGRESS' },
    }),
    prisma.ticket.count({
      where: { status: 'ACKNOWLEDGED' },
    }),
    prisma.employee.findMany({
      where: { status: true, deletedAt: null, role: 'on_site' },
      select: { jobTitle: true },
    }),
    prisma.employee.count({
      where: { status: true, deletedAt: null, role: 'office' },
    }),
    prisma.attendance.count({
      where: {
        recordedAt: { gte: start, lt: end },
        status: { in: ['present', 'late', 'clocked_out'] as AttendanceStatus[] },
      },
    }),
    prisma.checkin.count({
      where: {
        at: { gte: start, lt: end },
      },
    }),
    prisma.attendance.count({
      where: {
        recordedAt: { gte: start, lt: end },
        status: 'late' as AttendanceStatus,
        employee: { role: 'on_site' },
      },
    }),
    redis.get('webhooks:unresolved_panics'),
    prisma.shift.findMany({
      where: {
        deletedAt: null,
        status: { not: ShiftStatus.cancelled },
        startsAt: { lt: end },
        endsAt: { gt: start },
        employeeId: { not: null },
        employee: { role: 'on_site' },
      },
      select: {
        status: true,
        employee: { select: { jobTitle: true } },
      },
    }),
  ]);

  let onsite = 0;
  let control = 0;
  for (const emp of onSiteEmployees) {
    if (isSecurityStandbyTitle(emp.jobTitle)) {
      onsite++;
    } else {
      control++;
    }
  }
  const workforceTotal = onsite + control + officeCount;

  const missedCheckIn = Math.max(0, scheduledShiftsToday - checkedInAttendanceCount);

  let sosEmergencies = 0;
  if (unresolvedPanicsStr) {
    try {
      const unresolvedPanics = JSON.parse(unresolvedPanicsStr);
      if (Array.isArray(unresolvedPanics)) {
        sosEmergencies = unresolvedPanics.filter((p: any) => p.status === 'unresolved').length;
      }
    } catch {
      // Ignore parse errors
    }
  }

  let patrolExpected = 0;
  let patrolCompleted = 0;
  let patrolMissed = 0;
  for (const shift of onSiteShifts) {
    if (isSecurityStandbyTitle(shift.employee?.jobTitle)) continue;
    patrolExpected++;
    if (shift.status === 'completed') patrolCompleted++;
    if (shift.status === 'missed') patrolMissed++;
  }

  return {
    totalEmployees,
    totalSites,
    activeSites,
    activeGuardsOnDuty,
    scheduledShiftsToday,
    openTickets: {
      total: openTicketsTotal,
      unassigned: unassignedTickets,
      inProgress: inProgressTickets,
      acknowledged: acknowledgedTickets,
    },
    workforceBreakdown: {
      onsite,
      control,
      office: officeCount,
      total: workforceTotal,
    },
    guardActivityToday: {
      scheduled: scheduledShiftsToday,
      checkedIn: checkedInAttendanceCount,
      missedCheckIn,
      sosEmergencies,
    },
    todayOperationsSummary: {
      guardsOnDuty: activeGuardsOnDuty,
      activeSites,
      totalCheckins: totalCheckinsCount,
      lateGuards: lateGuardAttendanceCount,
    },
    patrolCompletion: {
      expected: patrolExpected,
      completed: patrolCompleted,
      missed: patrolMissed,
    },
  };
}
