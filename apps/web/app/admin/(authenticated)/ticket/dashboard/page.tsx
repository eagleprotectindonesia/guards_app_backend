import { db, Prisma } from '@repo/database';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { TicketOverviewDashboard, type OverviewMetric } from '../components/ticket-overview-dashboard';

export const dynamic = 'force-dynamic';

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asStatus(value: string | string[] | undefined): TicketStatus | undefined {
  const candidate = firstParam(value);
  const allowed: TicketStatus[] = ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED', 'CLOSED', 'CANNOT_RESOLVE'];
  return allowed.includes(candidate as TicketStatus) ? (candidate as TicketStatus) : undefined;
}

function asPriority(value: string | string[] | undefined): TicketPriority | undefined {
  const candidate = firstParam(value);
  const allowed: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
  return allowed.includes(candidate as TicketPriority) ? (candidate as TicketPriority) : undefined;
}

function parseAssignee(value: string | string[] | undefined) {
  const candidate = firstParam(value);
  if (!candidate) return null;
  if (candidate === 'unassigned') return { type: 'UNASSIGNED' as const };
  if (candidate.startsWith('admin:')) return { type: 'ADMIN' as const, id: candidate.slice('admin:'.length) };
  if (candidate.startsWith('employee:')) return { type: 'EMPLOYEE' as const, id: candidate.slice('employee:'.length) };
  return null;
}

export default async function TicketDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const query = await searchParams;

  const today = startOfToday();
  const activeStatuses = ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS'] as const;
  const search = firstParam(query.q)?.trim() || undefined;
  const departmentRoleId = firstParam(query.departmentRoleId) || undefined;
  const status = asStatus(query.status);
  const priority = asPriority(query.priority);
  const assignee = parseAssignee(query.assignee);

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
    ...(departmentRoleId ? { departmentRoleId } : {}),
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

  const [totalTickets, openTickets, inProgressTickets, resolvedToday, slaBreachedRows, filteredCount, recentTickets, departmentRows, claimedAdmins, claimedEmployees] = await Promise.all([
    db.ticket.count(),
    db.ticket.count({
      where: {
        status: { in: ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION'] },
      },
    }),
    db.ticket.count({
      where: {
        status: 'IN_PROGRESS',
      },
    }),
    db.ticket.count({
      where: {
        OR: [
          { solvedAt: { gte: today } },
          { closedAt: { gte: today } },
        ],
      },
    }),
    db.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM tickets
      WHERE status IN (${Prisma.join(activeStatuses)})
        AND created_at + (resolution_target_hours * INTERVAL '1 hour') < NOW()
    `),
    db.ticket.count({ where }),
    db.ticket.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 8,
      include: {
        departmentRole: { select: { id: true, name: true } },
        claimedByAdmin: { select: { name: true } },
        claimedByEmployee: { select: { fullName: true } },
      },
    }),
    db.ticket.findMany({
      where: { departmentRoleId: { not: null } },
      distinct: ['departmentRoleId'],
      select: {
        departmentRoleId: true,
        departmentRole: { select: { name: true } },
      },
    }),
    db.admin.findMany({
      where: {
        claimedTickets: { some: {} },
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.employee.findMany({
      where: {
        claimedTickets: { some: {} },
      },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true },
    }),
  ]);

  const departmentOptions = departmentRows
    .filter(item => item.departmentRoleId && item.departmentRole?.name)
    .map(item => ({
      value: item.departmentRoleId as string,
      label: item.departmentRole?.name as string,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const assigneeOptions = [
    ...claimedAdmins.map(item => ({ value: `admin:${item.id}`, label: item.name })),
    ...claimedEmployees.map(item => ({ value: `employee:${item.id}`, label: item.fullName })),
    { value: 'unassigned', label: 'Unassigned' },
  ];
  const slaBreachedTickets = Number(slaBreachedRows[0]?.count ?? 0);

  const rows = recentTickets.map(ticket => ({
    id: ticket.id,
    code: ticket.code,
    title: ticket.title,
    category: ticket.departmentRole?.name ?? 'General',
    clientName: ticket.clientName,
    clientLocation: ticket.clientLocation,
    priority: ticket.priority,
    status: ticket.status,
    assignedTo: ticket.claimedByAdmin?.name ?? ticket.claimedByEmployee?.fullName ?? 'Unassigned',
    createdAt: ticket.createdAt.toISOString(),
  }));

  const metrics: OverviewMetric[] = [
    {
      label: 'Total Tickets',
      value: totalTickets,
      hint: 'All recorded tickets',
      icon: 'ticket',
      accentClass: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
    },
    {
      label: 'Open Tickets',
      value: openTickets,
      hint: 'Awaiting active handling',
      icon: 'shield',
      accentClass: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
    },
    {
      label: 'In Progress',
      value: inProgressTickets,
      hint: 'Currently being worked',
      icon: 'progress',
      accentClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    },
    {
      label: 'Resolved Today',
      value: resolvedToday,
      hint: 'Solved or closed since midnight',
      icon: 'resolved',
      accentClass: 'border-violet-500/20 bg-violet-500/10 text-violet-400',
    },
    {
      label: 'SLA Breach',
      value: slaBreachedTickets,
      hint: 'Overdue unresolved tickets',
      icon: 'breach',
      accentClass: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
    },
  ];

  return (
    <TicketOverviewDashboard
      metrics={metrics}
      rows={rows}
      totalCount={filteredCount}
      filters={{
        q: search ?? '',
        departmentRoleId: departmentRoleId ?? '',
        status: status ?? '',
        priority: priority ?? '',
        assignee: firstParam(query.assignee) ?? '',
      }}
      options={{
        departments: departmentOptions,
        assignees: assigneeOptions,
      }}
    />
  );
}
