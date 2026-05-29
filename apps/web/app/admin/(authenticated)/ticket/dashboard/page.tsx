import { db } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { TicketOverviewDashboard, type OverviewMetric } from '../components/ticket-overview-dashboard';

export const dynamic = 'force-dynamic';

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default async function TicketDashboardPage() {
  await requirePermission(PERMISSIONS.TICKETS.VIEW);

  const today = startOfToday();

  const [totalTickets, openTickets, inProgressTickets, resolvedToday, recentTickets] = await Promise.all([
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
    db.ticket.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 8,
      include: {
        departmentRole: { select: { name: true } },
        claimedByAdmin: { select: { name: true } },
        assignedRoles: {
          include: {
            role: { select: { name: true } },
          },
        },
      },
    }),
  ]);

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
  ];

  const rows = recentTickets.map(ticket => ({
    id: ticket.id,
    code: ticket.code,
    title: ticket.title,
    category: ticket.departmentRole?.name ?? ticket.assignedRoles[0]?.role.name ?? 'General',
    clientName: ticket.clientName,
    clientLocation: ticket.clientLocation,
    priority: ticket.priority,
    status: ticket.status,
    assignedTo: ticket.claimedByAdmin?.name ?? ticket.departmentRole?.name ?? 'Unassigned',
    createdAt: ticket.createdAt.toISOString(),
  }));

  return <TicketOverviewDashboard metrics={metrics} rows={rows} totalCount={totalTickets} />;
}
