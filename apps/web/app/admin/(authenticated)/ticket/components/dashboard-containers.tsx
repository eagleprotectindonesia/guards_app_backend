import { db, getTicketDashboardComparisonStats, getTicketDashboardSidebarStats, listTicketsForSlaFilter, Prisma } from '@repo/database';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { TICKET_DEPARTMENT_OPTIONS, type TicketDepartment } from '@/lib/ticket-department-roles';
import { TicketOverviewMetrics } from './ticket-overview-dashboard-metrics';
import { TicketOverviewFilters } from './ticket-overview-dashboard-filters';
import { TicketOverviewTable } from './ticket-overview-dashboard-table';
import { TicketOverviewSidebarPanel } from './ticket-overview-dashboard-sidebar';
import type { OverviewMetric, TicketOverviewSidebar } from './ticket-overview-dashboard.types';

// Helper functions copied from page.tsx for collocation

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDelta(delta: number) {
  if (delta > 0) return `+${delta} vs yesterday`;
  if (delta < 0) return `${delta} vs yesterday`;
  return 'No change vs yesterday';
}

function getOpenTicketHint(openTickets: number): { hint: string; hintTone: OverviewMetric['hintTone'] } {
  if (openTickets >= 10) {
    return { hint: 'Queue requires immediate action', hintTone: 'critical' };
  }
  if (openTickets >= 5) {
    return { hint: 'Queue needs attention', hintTone: 'warning' };
  }
  return { hint: 'Queue under control', hintTone: 'positive' };
}

function getResolvedTodayHint(delta: number): { hint: string; hintTone: OverviewMetric['hintTone'] } {
  if (delta > 0) return { hint: `+${delta} vs yesterday`, hintTone: 'positive' };
  if (delta < 0) return { hint: `${delta} vs yesterday`, hintTone: 'warning' };
  return { hint: 'Same as yesterday', hintTone: 'neutral' };
}

function getSlaBreachHint(slaBreachedTickets: number): { hint: string; hintTone: OverviewMetric['hintTone'] } {
  if (slaBreachedTickets >= 4) {
    return { hint: 'SLA breach critical', hintTone: 'critical' };
  }
  if (slaBreachedTickets >= 1) {
    return { hint: 'SLA risk emerging', hintTone: 'warning' };
  }
  return { hint: 'All tickets within SLA', hintTone: 'positive' };
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asStatus(value: string | string[] | undefined): TicketStatus | undefined {
  const candidate = firstParam(value);
  const allowed: TicketStatus[] = [
    'NEW',
    'ACKNOWLEDGED',
    'WAITING_INFORMATION',
    'IN_PROGRESS',
    'SOLVED',
    'CLOSED',
    'CANNOT_RESOLVE',
  ];
  return allowed.includes(candidate as TicketStatus) ? (candidate as TicketStatus) : undefined;
}

function asPriority(value: string | string[] | undefined): TicketPriority | undefined {
  const candidate = firstParam(value);
  const allowed: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
  return allowed.includes(candidate as TicketPriority) ? (candidate as TicketPriority) : undefined;
}

function asDepartment(value: string | string[] | undefined): TicketDepartment | undefined {
  const candidate = firstParam(value);
  return TICKET_DEPARTMENT_OPTIONS.includes(candidate as TicketDepartment)
    ? (candidate as TicketDepartment)
    : undefined;
}

function getTicketDepartmentFromPolicy(policy: Prisma.JsonValue | null | undefined): TicketDepartment | undefined {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return undefined;
  const raw = (policy as Prisma.JsonObject).ticketDepartment;
  if (typeof raw !== 'string') return undefined;
  return TICKET_DEPARTMENT_OPTIONS.includes(raw as TicketDepartment) ? (raw as TicketDepartment) : undefined;
}

function parseAssignee(value: string | string[] | undefined) {
  const candidate = firstParam(value);
  if (!candidate) return null;
  if (candidate === 'unassigned') return { type: 'UNASSIGNED' as const };
  if (candidate.startsWith('admin:')) return { type: 'ADMIN' as const, id: candidate.slice('admin:'.length) };
  if (candidate.startsWith('employee:')) return { type: 'EMPLOYEE' as const, id: candidate.slice('employee:'.length) };
  return null;
}

// Containers Implementation

export async function DashboardMetricsContainer() {
  const today = startOfToday();

  const [
    totalTickets,
    openTickets,
    inProgressTickets,
    resolvedToday,
    comparisonStats,
    sidebarStats, // Needed for SLA breach metric
  ] = await Promise.all([
    db.ticket.count(),
    db.ticket.count({
      where: { status: { in: ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION'] } },
    }),
    db.ticket.count({
      where: { status: 'IN_PROGRESS' },
    }),
    db.ticket.count({
      where: { OR: [{ solvedAt: { gte: today } }, { closedAt: { gte: today } }] },
    }),
    getTicketDashboardComparisonStats({ startOfToday: today }),
    getTicketDashboardSidebarStats({
      adminId: '', // Dummy adminId since we just need global SLA stats which don't filter by admin
      categories: TICKET_DEPARTMENT_OPTIONS,
      startOfToday: today,
    }),
  ]);

  const slaBreachedTickets = sidebarStats.slaStatus.breached;
  const totalTicketDelta = totalTickets - comparisonStats.yesterdayTotal;
  const resolvedTodayDelta = resolvedToday - comparisonStats.yesterdayResolved;
  const openTicketHint = getOpenTicketHint(openTickets);
  const resolvedTodayHint = getResolvedTodayHint(resolvedTodayDelta);
  const slaBreachHint = getSlaBreachHint(slaBreachedTickets);

  const metrics: OverviewMetric[] = [
    {
      label: 'Total Tickets',
      value: totalTickets,
      hint: formatDelta(totalTicketDelta),
      hintTone: totalTicketDelta > 0 ? 'warning' : totalTicketDelta < 0 ? 'positive' : 'neutral',
      icon: 'ticket',
      accentClass: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Open Tickets',
      value: openTickets,
      hint: openTicketHint.hint,
      hintTone: openTicketHint.hintTone,
      icon: 'shield',
      accentClass: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    {
      label: 'In Progress',
      value: inProgressTickets,
      hint:
        inProgressTickets === 0
          ? 'No tickets being worked'
          : inProgressTickets === 1
            ? '1 ticket actively handled'
            : `${inProgressTickets} tickets actively handled`,
      hintTone: 'neutral',
      icon: 'progress',
      accentClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Resolved Today',
      value: resolvedToday,
      hint: resolvedTodayHint.hint,
      hintTone: resolvedTodayHint.hintTone,
      icon: 'resolved',
      accentClass: 'border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400',
    },
    {
      label: 'SLA Breach',
      value: slaBreachedTickets,
      hint: slaBreachHint.hint,
      hintTone: slaBreachHint.hintTone,
      icon: 'breach',
      accentClass: 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400',
    },
  ];

  return <TicketOverviewMetrics metrics={metrics} />;
}

export async function DashboardFiltersContainer() {
  const [claimedAdmins, claimedEmployees] = await Promise.all([
    db.admin.findMany({
      where: { claimedTickets: { some: {} } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.employee.findMany({
      where: { claimedTickets: { some: {} } },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true },
    }),
  ]);

  const departmentOptions = TICKET_DEPARTMENT_OPTIONS.map(item => ({
    value: item,
    label: item,
  }));

  const assigneeOptions = [
    ...claimedAdmins.map(item => ({ value: `admin:${item.id}`, label: item.name })),
    ...claimedEmployees.map(item => ({ value: `employee:${item.id}`, label: item.fullName })),
    { value: 'unassigned', label: 'Unassigned' },
  ];

  const options = {
    departments: departmentOptions,
    assignees: assigneeOptions,
  };

  return <TicketOverviewFilters options={options} />;
}

type DashboardSearchParams = { [key: string]: string | string[] | undefined };

export async function DashboardTableContainer({ searchParams }: { searchParams: DashboardSearchParams }) {
  const query = searchParams;
  const search = firstParam(query.q)?.trim() || undefined;
  const department = asDepartment(query.department);
  const status = asStatus(query.status);
  const priority = asPriority(query.priority);
  const assignee = parseAssignee(query.assignee);
  const sla = firstParam(query.sla);

  const where: Prisma.TicketWhereInput = {
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { title: { contains: search, mode: 'insensitive' } },
            { clientName: { contains: search, mode: 'insensitive' } },
            { clientContact: { contains: search, mode: 'insensitive' } },
            { clientLocation: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(department
      ? {
          departmentRole: {
            is: {
              policy: {
                path: ['ticketDepartment'],
                equals: department,
              },
            },
          },
        }
      : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(assignee?.type === 'UNASSIGNED'
      ? { claimedByType: null }
      : assignee?.type === 'ADMIN'
        ? { claimedByType: 'ADMIN', claimedByAdminId: assignee.id }
        : assignee?.type === 'EMPLOYEE'
          ? { claimedByType: 'EMPLOYEE', claimedByEmployeeId: assignee.id }
          : {}),
  };

  const ticketsAndCount = await (async () => {
    if (sla === 'met' || sla === 'pending' || sla === 'breached') {
      return listTicketsForSlaFilter({
        search,
        status,
        priority,
        department,
        assignee: assignee ?? undefined,
        slaStatus: sla,
        limit: 8,
      });
    } else {
      const [count, tickets] = await Promise.all([
        db.ticket.count({ where }),
        db.ticket.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 8,
          include: {
            departmentRole: { select: { id: true, name: true, policy: true } },
            claimedByAdmin: { select: { name: true } },
            claimedByEmployee: { select: { fullName: true } },
          },
        }),
      ]);
      return { count, tickets };
    }
  })();

  const rows = ticketsAndCount.tickets.map(ticket => {
    const ticketDepartment = getTicketDepartmentFromPolicy(ticket.departmentRole?.policy);

    return {
      id: ticket.id,
      code: ticket.code,
      title: ticket.title,
      category: ticketDepartment ?? ticket.departmentRole?.name ?? 'General',
      clientName: ticket.clientName,
      clientLocation: ticket.clientLocation,
      priority: ticket.priority,
      status: ticket.status,
      assignedTo: ticket.claimedByAdmin?.name ?? ticket.claimedByEmployee?.fullName ?? 'Unassigned',
      createdAt: ticket.createdAt.toISOString(),
      resolutionTargetHours: ticket.resolutionTargetHours,
      solvedAt: ticket.solvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      cannotResolveAt: ticket.cannotResolveAt?.toISOString() ?? null,
    };
  });

  return <TicketOverviewTable rows={rows} totalCount={ticketsAndCount.count} />;
}

export async function DashboardSidebarContainer({ adminId }: { adminId: string }) {
  const today = startOfToday();

  const sidebar = await getTicketDashboardSidebarStats({
    adminId,
    categories: TICKET_DEPARTMENT_OPTIONS,
    startOfToday: today,
  });

  const sidebarProps: TicketOverviewSidebar = {
    shortcuts: sidebar.shortcuts,
    categories: sidebar.categories,
    slaStatus: sidebar.slaStatus,
  };

  return <TicketOverviewSidebarPanel sidebar={sidebarProps} />;
}
