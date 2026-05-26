'use server';

import { revalidatePath } from 'next/cache';
import {
  addTicketAttachments,
  addTicketMessage,
  createTicket,
  getTicketById,
  getTicketHistory,
  listClosedTickets,
  listMyTickets,
  listTickets,
  listUnassignedTickets,
  updateTicketAssignedRoles,
  updateTicketPriority,
  updateTicketStatus,
} from '@repo/database';
import {
  ticketAssignedRolesUpdateSchema,
  ticketAttachmentMetadataSchema,
  ticketAttachmentUploadRequestSchema,
  ticketCreateSchema,
  ticketListSchema,
  ticketMessageCreateSchema,
  ticketPriorityUpdateSchema,
  ticketStatusUpdateSchema,
} from '@repo/validations';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getPresignedUploadUrl } from '@/lib/s3';

function revalidateTicketPaths(ticketId?: string) {
  revalidatePath('/admin/ticket/dashboard');
  revalidatePath('/admin/ticket/create');
  if (ticketId) {
    revalidatePath(`/admin/ticket/${ticketId}`);
  }
}

export async function createTicketAction(input: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.CREATE);
  const parsed = ticketCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid ticket payload');
  }

  const ticket = await createTicket({
    ...parsed.data,
    submitterAdminId: session.id,
  });
  revalidateTicketPaths(ticket.id);
  return ticket;
}

export async function listTicketsAction(input: unknown = {}) {
  await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const parsed = ticketListSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid list query');
  }
  return listTickets(parsed.data);
}

export async function listMyTicketsAction(input: unknown = {}) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const parsed = ticketListSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid list query');
  }
  return listMyTickets(session.id, parsed.data);
}

export async function listUnassignedTicketsAction(input: unknown = {}) {
  await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const parsed = ticketListSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid list query');
  }
  return listUnassignedTickets(parsed.data);
}

export async function listClosedTicketsAction(input: unknown = {}) {
  await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const parsed = ticketListSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid list query');
  }
  return listClosedTickets(parsed.data);
}

export async function getTicketDetailAction(ticketId: string) {
  await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const ticket = await getTicketById(ticketId);
  if (!ticket) throw new Error('Ticket not found');
  const history = await getTicketHistory(ticketId);
  return { ticket, history };
}

export async function addTicketMessageAction(input: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const parsed = ticketMessageCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid message payload');
  }

  const message = await addTicketMessage({
    ticketId: parsed.data.ticketId,
    adminId: session.id,
    body: parsed.data.body,
  });
  revalidateTicketPaths(parsed.data.ticketId);
  return message;
}

export async function updateTicketStatusAction(input: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const parsed = ticketStatusUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid status payload');
  }

  const ticket = await updateTicketStatus({
    ticketId: parsed.data.ticketId,
    nextStatus: parsed.data.status,
    actorAdminId: session.id,
    actorRoleName: session.roleName,
    actorIsSuperAdmin: session.isSuperAdmin,
    actorPermissions: session.permissions,
  });
  revalidateTicketPaths(parsed.data.ticketId);
  return ticket;
}

export async function updateTicketPriorityAction(input: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.EDIT);
  const parsed = ticketPriorityUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid priority payload');
  }

  const ticket = await updateTicketPriority({
    ticketId: parsed.data.ticketId,
    priority: parsed.data.priority,
    actorAdminId: session.id,
  });
  revalidateTicketPaths(parsed.data.ticketId);
  return ticket;
}

export async function updateTicketAssignedRolesAction(input: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.EDIT);
  const parsed = ticketAssignedRolesUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid assignment payload');
  }

  const assignedRoles = await updateTicketAssignedRoles({
    ticketId: parsed.data.ticketId,
    roleIds: parsed.data.roleIds,
    actorAdminId: session.id,
  });
  revalidateTicketPaths(parsed.data.ticketId);
  return assignedRoles;
}

export async function createTicketAttachmentUploadUrlAction(input: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.CREATE);
  const parsed = ticketAttachmentUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid upload payload');
  }

  return getPresignedUploadUrl(parsed.data.fileName, parsed.data.contentType, {
    folder: `tickets/temp/${session.id}`,
  });
}

export async function attachUploadedFilesToTicketAction(ticketId: string, files: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const parsed = ticketAttachmentMetadataSchema.array().safeParse(files);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid attachment payload');
  }

  const attachments = await addTicketAttachments({
    ticketId,
    uploadedByAdminId: session.id,
    attachments: parsed.data,
  });
  revalidateTicketPaths(ticketId);
  return attachments;
}
