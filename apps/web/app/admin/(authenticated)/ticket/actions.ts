'use server';

import { revalidatePath } from 'next/cache';
import {
  addTicketAttachments,
  addTicketMessage,
  addTicketMessageWithAttachments,
  createAdminNotifications,
  createTicket,
  claimTicket,
  db,
  getTicketById,
  getTicketHistory,
  getTicketSidebarCounts,
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
  ticketMessageWithAttachmentsCreateSchema,
  ticketPriorityUpdateSchema,
  ticketStatusUpdateSchema,
} from '@repo/validations';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getCachedPresignedDownloadUrl, getPresignedUploadPostPolicy } from '@/lib/s3';
import { redis } from '@repo/database/redis';
import { TicketStatus } from '@prisma/client';
import { sendTicketCreatedPushNotification } from '@/lib/fcm';

const SUBMITTER_STATUS_ACTIONS: TicketStatus[] = ['CLOSED', 'CANCELLED'];
const CLAIMANT_STATUS_ACTIONS: TicketStatus[] = ['WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED', 'CANNOT_RESOLVE', 'CANCELLED'];

function revalidateTicketPaths(ticketId?: string) {
  revalidatePath('/admin/ticket/dashboard');
  revalidatePath('/admin/ticket/all');
  revalidatePath('/admin/ticket/my');
  revalidatePath('/admin/ticket/unassigned');
  revalidatePath('/admin/ticket/closed');
  revalidatePath('/admin/ticket/create');
  if (ticketId) {
    revalidatePath(`/admin/ticket/${ticketId}`);
  }
}

async function publishAdminNotifications(notifications: { adminId: string }[]) {
  await Promise.all(
    notifications.map(notification =>
      redis.publish(
        `admin-notifications:admin:${notification.adminId}`,
        JSON.stringify({
          type: 'admin_notification_created',
          notification,
        })
      )
    )
  );
}

async function notifyAssignedRoles(input: {
  roleIds: string[];
  actorAdminId: string;
  type: 'ticket_assigned_role' | 'ticket_message_added';
  title: string;
  body: string;
  targetPath: string;
  ticketId: string;
}) {
  if (input.roleIds.length === 0) return;
  const admins = await db.admin.findMany({
    where: {
      deletedAt: null,
      roleId: { in: input.roleIds },
      id: { not: input.actorAdminId },
    },
    select: { id: true },
  });
  const adminIds = Array.from(new Set(admins.map(item => item.id)));
  if (adminIds.length === 0) return;
  const notifications = await createAdminNotifications({
    adminIds,
    type: input.type,
    title: input.title,
    body: input.body,
    payload: {
      ticketId: input.ticketId,
      targetPath: input.targetPath,
    },
  });
  await publishAdminNotifications(notifications);
}

async function notifySubmitterOnStatusChange(input: {
  actorAdminId: string;
  ticketId: string;
  status: TicketStatus;
}) {
  const ticket = await db.ticket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, code: true, submitterAdminId: true },
  });
  if (!ticket || ticket.submitterAdminId === input.actorAdminId) return;

  const notifications = await createAdminNotifications({
    adminIds: [ticket.submitterAdminId],
    type: 'ticket_status_updated',
    title: `Ticket ${ticket.code} updated`,
    body:
      input.status === 'WAITING_INFORMATION'
        ? 'IT team requested more information on your ticket.'
        : `Ticket status changed to ${input.status}.`,
    payload: {
      ticketId: ticket.id,
      targetPath: `/admin/ticket/all?ticket=${ticket.id}`,
      status: input.status,
    },
  });
  await publishAdminNotifications(notifications);
}

export async function createTicketAction(input: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.CREATE);
  const parsed = ticketCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid ticket payload');
  }

  const departmentRoles = await db.role.findMany({
    where: {
      policy: {
        path: ['ticketDepartment'],
        equals: parsed.data.department,
      },
    },
    select: { id: true, name: true },
  });

  if (departmentRoles.length === 0) {
    throw new Error(
      `Department role for '${parsed.data.department}' is not configured. Create or update a role and set ticket department to '${parsed.data.department}'.`
    );
  }

  if (departmentRoles.length > 1) {
    throw new Error(
      `Multiple roles are configured for '${parsed.data.department}'. Keep exactly one role per ticket department.`
    );
  }

  const ticket = await createTicket({
    title: parsed.data.title,
    description: parsed.data.description,
    resolutionTargetHours: parsed.data.resolutionTargetHours,
    priority: parsed.data.priority,
    departmentRoleId: departmentRoles[0]!.id,
    clientName: parsed.data.clientName,
    clientContact: parsed.data.clientContact,
    clientLocation: parsed.data.clientLocation,
    submitterAdminId: session.id,
  });

  const assignedEmployees = await db.ticketAssignedEmployee.findMany({
    where: { ticketId: ticket.id },
    select: { employeeId: true },
  });

  assignedEmployees.forEach(ae => {
    void sendTicketCreatedPushNotification({
      employeeId: ae.employeeId,
      ticketId: ticket.id,
      ticketCode: ticket.code,
      title: ticket.title,
    }).catch(err => {
      console.error(
        `[Push Notification] Failed to send to employee ${ae.employeeId} for ticket ${ticket.code}:`,
        err
      );
    });
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

export async function getTicketSidebarCountsAction() {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  return getTicketSidebarCounts(session.id);
}

export async function getTicketDetailAction(ticketId: string) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const ticket = await getTicketById(ticketId);
  if (!ticket) throw new Error('Ticket not found');
  const history = await getTicketHistory(ticketId);
  const actor = await db.admin.findUnique({
    where: { id: session.id },
    select: { roleId: true },
  });
  const canClaim = Boolean(
    session.isSuperAdmin || (ticket.departmentRoleId && actor?.roleId && actor.roleId === ticket.departmentRoleId)
  );
  const isSubmitter = ticket.submitterAdminId === session.id;
  const isClaimant = ticket.claimedByType === 'ADMIN' && ticket.claimedByAdminId === session.id;
  const isClaimedByCurrentUser = ticket.claimedByType === 'ADMIN' && ticket.claimedByAdminId === session.id;
  const allowedStatusActions = isSubmitter ? SUBMITTER_STATUS_ACTIONS : isClaimant ? CLAIMANT_STATUS_ACTIONS : [];
  const canEdit = isSubmitter;
  const canUseMore = allowedStatusActions.length > 0;

  const enrichAttachmentUrl = async <T extends { publicUrl: string | null; s3Key: string }>(attachment: T) => {
    if (attachment.publicUrl) return attachment;
    try {
      const publicUrl = await getCachedPresignedDownloadUrl(attachment.s3Key);
      return { ...attachment, publicUrl };
    } catch {
      return attachment;
    }
  };

  const [attachments, messages] = await Promise.all([
    Promise.all(ticket.attachments.map(enrichAttachmentUrl)),
    Promise.all(
      ticket.messages.map(async message => ({
        ...message,
        attachments: await Promise.all(message.attachments.map(enrichAttachmentUrl)),
      }))
    ),
  ]);

  return {
    ticket: {
      ...ticket,
      assignedAdmin: ticket.claimedByType === 'ADMIN' ? ticket.claimedByAdmin : null,
      assignedEmployee: ticket.claimedByType === 'EMPLOYEE' ? ticket.claimedByEmployee : null,
      attachments,
      messages,
    },
    history,
    canClaim: canClaim && !isClaimedByCurrentUser,
    isClaimedByCurrentUser,
    isSubmitter,
    isClaimant,
    canEdit,
    canUseMore,
    allowedStatusActions,
  };
}

export async function claimTicketAction(ticketId: string) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const actor = await db.admin.findUnique({
    where: { id: session.id },
    select: { roleId: true },
  });

  const ticket = await claimTicket({
    ticketId,
    actorAdminId: session.id,
    actorRoleId: actor?.roleId ?? null,
    actorIsSuperAdmin: session.isSuperAdmin,
  });

  revalidateTicketPaths(ticketId);
  return ticket;
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
  const ticket = await getTicketById(parsed.data.ticketId);
  const roleIds = ticket?.assignedRoles.map(item => item.roleId) ?? [];
  await notifyAssignedRoles({
    roleIds,
    actorAdminId: session.id,
    type: 'ticket_message_added',
    title: `New message on ${ticket?.code ?? 'ticket'}`,
    body: parsed.data.body.slice(0, 120),
    targetPath: `/admin/ticket/all?ticket=${parsed.data.ticketId}`,
    ticketId: parsed.data.ticketId,
  });
  revalidateTicketPaths(parsed.data.ticketId);
  return message;
}

export async function addTicketMessageWithAttachmentsAction(input: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const parsed = ticketMessageWithAttachmentsCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid message payload');
  }

  const existingTicket = await getTicketById(parsed.data.ticketId);
  if (!existingTicket) {
    throw new Error('Ticket not found');
  }

  const env = process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV || 'development';
  const keyPrefix = `tickets/env=${env}/ticket_${parsed.data.ticketId}/`;
  const invalidKey = parsed.data.attachments.find(attachment => !attachment.s3Key.startsWith(keyPrefix));
  if (invalidKey) {
    throw new Error('Attachment key is outside allowed upload prefix');
  }

  const result = await addTicketMessageWithAttachments({
    ticketId: parsed.data.ticketId,
    adminId: session.id,
    body: parsed.data.body,
    attachments: parsed.data.attachments.map(attachment => ({
      ...attachment,
      messageId: undefined,
    })),
  });
  const ticket = await getTicketById(parsed.data.ticketId);
  const roleIds = ticket?.assignedRoles.map(item => item.roleId) ?? [];
  await notifyAssignedRoles({
    roleIds,
    actorAdminId: session.id,
    type: 'ticket_message_added',
    title: `New message on ${ticket?.code ?? 'ticket'}`,
    body: parsed.data.body.slice(0, 120),
    targetPath: `/admin/ticket/all?ticket=${parsed.data.ticketId}`,
    ticketId: parsed.data.ticketId,
  });
  revalidateTicketPaths(parsed.data.ticketId);
  return result;
}

export async function updateTicketStatusAction(input: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const parsed = ticketStatusUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid status payload');
  }
  const currentTicket = await db.ticket.findUnique({
    where: { id: parsed.data.ticketId },
    select: {
      id: true,
      submitterAdminId: true,
      claimedByType: true,
      claimedByAdminId: true,
    },
  });
  if (!currentTicket) {
    throw new Error('Ticket not found');
  }

  const isSubmitter = currentTicket.submitterAdminId === session.id;
  const isClaimant = currentTicket.claimedByType === 'ADMIN' && currentTicket.claimedByAdminId === session.id;
  const allowedStatusActions = isSubmitter ? SUBMITTER_STATUS_ACTIONS : isClaimant ? CLAIMANT_STATUS_ACTIONS : [];
  if (!allowedStatusActions.includes(parsed.data.status)) {
    throw new Error('You are not allowed to perform this status action');
  }

  const ticket = await updateTicketStatus({
    ticketId: parsed.data.ticketId,
    nextStatus: parsed.data.status,
    actorAdminId: session.id,
    actorRoleName: session.roleName,
    actorIsSuperAdmin: session.isSuperAdmin,
    actorPermissions: session.permissions,
    cancellationNote: parsed.data.cancellationNote,
  });
  await notifySubmitterOnStatusChange({
    actorAdminId: session.id,
    ticketId: parsed.data.ticketId,
    status: parsed.data.status,
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
  const ticket = await getTicketById(parsed.data.ticketId);
  await notifyAssignedRoles({
    roleIds: assignedRoles.map(item => item.roleId),
    actorAdminId: session.id,
    type: 'ticket_assigned_role',
    title: `Assigned to ticket ${ticket?.code ?? ''}`.trim(),
    body: ticket?.title ?? 'A ticket has been assigned to your role.',
    targetPath: `/admin/ticket/all?ticket=${parsed.data.ticketId}`,
    ticketId: parsed.data.ticketId,
  });
  revalidateTicketPaths(parsed.data.ticketId);
  return assignedRoles;
}

export async function createTicketAttachmentUploadUrlAction(input: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const parsed = ticketAttachmentUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid upload payload');
  }

  const ticket = await getTicketById(parsed.data.ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  return getPresignedUploadPostPolicy(parsed.data.fileName, parsed.data.contentType, parsed.data.fileSize, {
    folder: 'tickets',
    ticketId: parsed.data.ticketId,
  }).then(result => ({
    ...result,
    uploadMethod: 'POST' as const,
  }));
}

export async function attachUploadedFilesToTicketAction(ticketId: string, files: unknown) {
  const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  const parsed = ticketAttachmentMetadataSchema.array().safeParse(files);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Invalid attachment payload');
  }

  if (parsed.data.some(file => file.messageId)) {
    throw new Error('Use message attachment action for reply files');
  }

  const env = process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV || 'development';
  const keyPrefix = `tickets/env=${env}/ticket_${ticketId}/`;
  const invalidKey = parsed.data.find(file => !file.s3Key.startsWith(keyPrefix));
  if (invalidKey) {
    throw new Error('Attachment key is outside allowed upload prefix');
  }

  const attachments = await addTicketAttachments({
    ticketId,
    uploadedByAdminId: session.id,
    attachments: parsed.data,
  });
  revalidateTicketPaths(ticketId);
  return attachments;
}
