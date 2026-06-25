import { db as prisma } from '../prisma/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';
import { TicketStatus } from '@prisma/client';

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
  ]);

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
  };
}
