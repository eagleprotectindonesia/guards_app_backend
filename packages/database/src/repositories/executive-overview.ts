import { db as prisma } from '../prisma/client';
import { redis } from '../redis/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';
import { isSecurityStandbyTitle } from './employees';
import { summarizeTicketSlaStatus } from './tickets';
import { AttendanceStatus, ShiftStatus, TicketStatus } from '@prisma/client';
import { getLatestSystemChangelogs, type ChangelogFeedItem } from './changelogs';

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
  controlCompletion: {
    expected: number;
    completed: number;
    missed: number;
  };
  communicationSummary: {
    newMemos: number;
    guardReports: number;
    ticketsReported: number;
    unreadMessages: number;
  };
  highlights: ChangelogFeedItem[];
  openAlerts: {
    byReason: {
      missedCheckin: number;
      missedAttendance: number;
    };
    total: number;
    deltaVsYesterday: number;
    topSite: { siteId: string; siteName: string; total: number } | null;
  };
  ticketSla: {
    open: number;
    inProgress: number;
    acknowledged: number;
    slaBreached: number;
    resolvedToday: number;
  };
};

export async function getExecutiveOverviewMetrics(now: Date = new Date()): Promise<ExecutiveOverviewMetrics> {
  const { start, end } = getBusinessDayRange(now, BUSINESS_TIMEZONE);
  const yesterdayStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);

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
    newMemos,
    guardReports,
    ticketsReported,
    unreadMessagesAgg,
    highlights,
    unresolvedAlertsByReason,
    todayNewAlerts,
    yesterdayNewAlerts,
    topSiteAlerts,
    slaQueryTickets,
    resolvedToday,
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
    prisma.officeMemo.count({
      where: { createdAt: { gte: start, lt: end } },
    }),
    prisma.shiftPhotoReport.count({
      where: { createdAt: { gte: start, lt: end } },
    }),
    prisma.ticket.count({
      where: { createdAt: { gte: start, lt: end } },
    }),
    prisma.chatConversation.aggregate({
      _sum: { unreadCount: true },
    }),
    getLatestSystemChangelogs(5, start, end),
    prisma.alert.groupBy({
      by: ['reason'],
      where: { resolvedAt: null },
      _count: { _all: true },
    }),
    prisma.alert.count({
      where: { createdAt: { gte: start, lt: end } },
    }),
    prisma.alert.count({
      where: { createdAt: { gte: yesterdayStart, lt: start } },
    }),
    prisma.alert.groupBy({
      by: ['siteId'],
      where: { resolvedAt: null },
      _count: { _all: true },
    }),
    prisma.ticket.findMany({
      select: {
        status: true,
        createdAt: true,
        updatedAt: true,
        resolutionTargetHours: true,
        solvedAt: true,
        closedAt: true,
        cannotResolveAt: true,
        cancelledAt: true,
      },
    }),
    prisma.ticket.count({
      where: {
        OR: [
          { solvedAt: { gte: start, lt: end } },
          { closedAt: { gte: start, lt: end } },
        ],
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

  let controlExpected = 0;
  let controlCompleted = 0;
  let controlMissed = 0;
  for (const shift of onSiteShifts) {
    if (isSecurityStandbyTitle(shift.employee?.jobTitle)) continue;
    controlExpected++;
    if (shift.status === 'completed') controlCompleted++;
    if (shift.status === 'missed') controlMissed++;
  }

  // Open alerts by reason
  const alertByReason: Record<string, number> = {
    missed_checkin: 0,
    missed_attendance: 0,
  };
  for (const row of unresolvedAlertsByReason) {
    alertByReason[row.reason] = (row._count as unknown as { _all: number })._all;
  }
  const totalUnresolvedAlerts = alertByReason.missed_checkin + alertByReason.missed_attendance;
  const deltaAlerts = todayNewAlerts - yesterdayNewAlerts;

  // Top affected site
  let topSite: { siteId: string; siteName: string; total: number } | null = null;
  const sortedSites = topSiteAlerts
    .map(r => ({ siteId: r.siteId, total: (r._count as unknown as { _all: number })._all }))
    .sort((a, b) => b.total - a.total);
  if (sortedSites.length > 0) {
    const site = await prisma.site.findUnique({
      where: { id: sortedSites[0].siteId },
      select: { name: true },
    });
    if (site) {
      topSite = { siteId: sortedSites[0].siteId, siteName: site.name, total: sortedSites[0].total };
    }
  }

  // Ticket SLA
  const slaResult = summarizeTicketSlaStatus(slaQueryTickets, now);

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
    controlCompletion: {
      expected: controlExpected,
      completed: controlCompleted,
      missed: controlMissed,
    },
    communicationSummary: {
      newMemos,
      guardReports,
      ticketsReported,
      unreadMessages: unreadMessagesAgg._sum.unreadCount ?? 0,
    },
    highlights,
    openAlerts: {
      byReason: {
        missedCheckin: alertByReason.missed_checkin,
        missedAttendance: alertByReason.missed_attendance,
      },
      total: totalUnresolvedAlerts,
      deltaVsYesterday: deltaAlerts,
      topSite,
    },
    ticketSla: {
      open: openTicketsTotal,
      inProgress: inProgressTickets,
      acknowledged: acknowledgedTickets,
      slaBreached: slaResult.breached,
      resolvedToday,
    },
  };
}
