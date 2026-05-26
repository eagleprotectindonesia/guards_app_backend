import { redirect } from 'next/navigation';
import { getAllSites } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import AdminDashboard from '../../dashboard/dashboard-client';
import { isAdminTabSlug } from '@/lib/admin-tab-routing';
import { TicketDashboardView } from '../../ticket/components/ticket-dashboard-view';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listClosedTickets, listMyTickets, listTickets, listUnassignedTickets } from '@repo/database';
import { TicketPriority, TicketStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ tab: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function normalizeArrayParam(value: string | string[] | undefined) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : value.split(',');
  return list.map(item => item.trim()).filter(Boolean);
}

function asStatusList(value: string | string[] | undefined): TicketStatus[] {
  const allowed: TicketStatus[] = ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED', 'CLOSED', 'CANNOT_RESOLVE'];
  return normalizeArrayParam(value).filter((item): item is TicketStatus => allowed.includes(item as TicketStatus));
}

function asPriorityList(value: string | string[] | undefined): TicketPriority[] {
  const allowed: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
  return normalizeArrayParam(value).filter((item): item is TicketPriority => allowed.includes(item as TicketPriority));
}

export default async function TabDashboardPage({ params, searchParams }: PageProps) {
  const { tab } = await params;
  const query = await searchParams;

  if (!isAdminTabSlug(tab)) {
    redirect('/admin/live/dashboard');
  }

  if (tab === 'ticket') {
    const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
    const view = typeof query.view === 'string' ? query.view : 'all';
    const ticketId = typeof query.ticket === 'string' ? query.ticket : undefined;
    const search = typeof query.q === 'string' ? query.q : undefined;
    const statuses = asStatusList(query.statuses);
    const priorities = asPriorityList(query.priorities);
    const assignedRoleIds = normalizeArrayParam(query.assignedRoleIds);

    const listParams = {
      search,
      statuses: statuses.length > 0 ? statuses : undefined,
      priorities: priorities.length > 0 ? priorities : undefined,
      assignedRoleIds: assignedRoleIds.length > 0 ? assignedRoleIds : undefined,
      limit: 50,
    };

    const listResult =
      view === 'my'
        ? await listMyTickets(session.id, listParams)
        : view === 'unassigned'
          ? await listUnassignedTickets(listParams)
          : view === 'closed'
            ? await listClosedTickets(listParams)
            : await listTickets(listParams);

    return (
      <TicketDashboardView
        initialView={view}
        initialSearch={search ?? ''}
        requestedTicketId={ticketId}
        initialItems={serialize(listResult.items)}
        initialHasMore={listResult.hasMore}
      />
    );
  }

  const sites = await getAllSites();
  return <AdminDashboard initialSites={serialize(sites)} />;
}
