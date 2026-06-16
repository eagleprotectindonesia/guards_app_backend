import { listAcknowledgedTickets, listClosedTickets, listTickets, listUnassignedTickets } from '@repo/database';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { serialize } from '@/lib/server-utils';
import { TicketWorkspaceView } from './ticket-workspace-view';
import { getTicketDetailAction } from '../actions';

type WorkspaceView = 'all' | 'acknowledged' | 'unassigned' | 'closed';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function normalizeArrayParam(value: string | string[] | undefined) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : value.split(',');
  return list.map(item => item.trim()).filter(Boolean);
}

function asStatusList(value: string | string[] | undefined): TicketStatus[] {
  const allowed: TicketStatus[] = ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED', 'CLOSED', 'CANNOT_RESOLVE', 'CANCELLED'];
  return normalizeArrayParam(value).filter((item): item is TicketStatus => allowed.includes(item as TicketStatus));
}

function asPriorityList(value: string | string[] | undefined): TicketPriority[] {
  const allowed: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
  return normalizeArrayParam(value).filter((item): item is TicketPriority => allowed.includes(item as TicketPriority));
}

export async function renderTicketWorkspacePage(view: WorkspaceView, searchParams: SearchParams) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const query = await searchParams;
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
    view === 'acknowledged'
      ? await listAcknowledgedTickets(session.id, listParams)
      : view === 'unassigned'
        ? await listUnassignedTickets(listParams)
        : view === 'closed'
          ? await listClosedTickets(listParams)
          : await listTickets(listParams);

  const targetTicketId = ticketId ?? listResult.items[0]?.id ?? undefined;
  let initialDetail = null;
  if (targetTicketId) {
    try {
      initialDetail = await getTicketDetailAction(targetTicketId);
    } catch (e) {
      console.error('Failed to prefetch ticket detail on server', e);
    }
  }

  return (
    <TicketWorkspaceView
      key={view}
      initialView={view}
      initialSearch={search ?? ''}
      requestedTicketId={ticketId}
      initialItems={serialize(listResult.items)}
      initialHasMore={listResult.hasMore}
      initialCursor={listResult.nextCursor}
      initialDetail={initialDetail ? serialize(initialDetail) : null}
    />
  );
}
