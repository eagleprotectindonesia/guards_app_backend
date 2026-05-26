import { Prisma, TicketHistoryAction, TicketPriority, TicketStatus } from '@prisma/client';
import { db as prisma } from '../prisma/client';

type TxLike = Prisma.TransactionClient | typeof prisma;

export const TICKET_OPERATIONAL_EDITOR_PERMISSION = 'tickets:edit';

export type TicketAttachmentInput = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  s3Bucket?: string;
  publicUrl?: string | null;
  messageId?: string | null;
};

export type CreateTicketInput = {
  title: string;
  description: string;
  priority: TicketPriority;
  submitterAdminId: string;
  departmentRoleId: string;
  clientName: string;
  clientContact: string;
  clientLocation: string;
};

export type TicketListParams = {
  search?: string;
  statuses?: TicketStatus[];
  priorities?: TicketPriority[];
  assignedRoleIds?: string[];
  submitterAdminId?: string;
  unassignedOnly?: boolean;
  cursor?: string;
  limit?: number;
};

export type TicketListCursor = {
  createdAt: string;
  id: string;
};

const OPERATIONAL_STATUSES: TicketStatus[] = ['ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED', 'CANNOT_RESOLVE'];
const TERMINAL_STATUSES = new Set<TicketStatus>(['CLOSED', 'CANNOT_RESOLVE']);

function isITRole(roleName?: string | null) {
  return roleName?.trim().toLowerCase() === 'it';
}

function isOperationalActor(input: { roleName?: string | null; isSuperAdmin?: boolean; permissions?: string[] }) {
  return Boolean(input.isSuperAdmin || isITRole(input.roleName) || input.permissions?.includes(TICKET_OPERATIONAL_EDITOR_PERMISSION));
}

function encodeCursor(value: TicketListCursor) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function decodeCursor(cursor: string): TicketListCursor {
  const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as TicketListCursor;
  if (!parsed.createdAt || !parsed.id) {
    throw new Error('Invalid cursor');
  }
  return parsed;
}

function toDepartmentCode(roleName: string) {
  const words = roleName
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'TKT';
  if (words.length === 1) return words[0]!.slice(0, 6);
  return words.map(word => word[0]).join('').slice(0, 6);
}

async function nextTicketCode(roleId: string, tx: TxLike) {
  const role = await tx.role.findUnique({
    where: { id: roleId },
    select: { name: true },
  });

  if (!role) {
    throw new Error('Department role not found');
  }

  const sequence = await tx.ticketCodeSequence.upsert({
    where: { id: 'global' },
    create: { id: 'global', value: 1 },
    update: { value: { increment: 1 } },
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const serial = String(sequence.value).padStart(4, '0');
  const prefix = toDepartmentCode(role.name);

  return `${prefix}_${year}_${month}_${serial}`;
}

function statusTimestampPatch(status: TicketStatus) {
  if (status === 'SOLVED') return { solvedAt: new Date() };
  if (status === 'CLOSED') return { closedAt: new Date() };
  if (status === 'CANNOT_RESOLVE') return { cannotResolveAt: new Date() };
  return {};
}

export function canTransitionStatus(params: {
  currentStatus: TicketStatus;
  nextStatus: TicketStatus;
  isSubmitter: boolean;
  roleName?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[];
}) {
  const { currentStatus, nextStatus, isSubmitter } = params;
  if (currentStatus === nextStatus) return true;

  const operationalActor = isOperationalActor(params);

  if (TERMINAL_STATUSES.has(currentStatus) && nextStatus === 'ACKNOWLEDGED') {
    return operationalActor;
  }

  if (nextStatus === 'CLOSED') {
    if (isSubmitter && ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED'].includes(currentStatus)) {
      return true;
    }
    return operationalActor && !TERMINAL_STATUSES.has(currentStatus);
  }

  if (!operationalActor) return false;

  const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
    NEW: ['ACKNOWLEDGED'],
    ACKNOWLEDGED: ['IN_PROGRESS', 'WAITING_INFORMATION'],
    WAITING_INFORMATION: ['IN_PROGRESS'],
    IN_PROGRESS: ['WAITING_INFORMATION', 'SOLVED', 'CANNOT_RESOLVE'],
    SOLVED: [],
    CLOSED: ['ACKNOWLEDGED'],
    CANNOT_RESOLVE: ['ACKNOWLEDGED'],
  };

  return allowedTransitions[currentStatus]?.includes(nextStatus) ?? false;
}

async function createHistory(
  tx: TxLike,
  input: {
    ticketId: string;
    actorAdminId?: string | null;
    action: TicketHistoryAction;
    fromValue?: string | null;
    toValue?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return tx.ticketHistory.create({
    data: {
      ticketId: input.ticketId,
      actorAdminId: input.actorAdminId ?? null,
      action: input.action,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue ?? null,
      metadata: input.metadata,
    },
  });
}

export async function createTicket(input: CreateTicketInput, tx: TxLike = prisma) {
  return withTransaction(tx, async trx => {
    const code = await nextTicketCode(input.departmentRoleId, trx);

    const ticket = await trx.ticket.create({
      data: {
        code,
        title: input.title,
        description: input.description,
        priority: input.priority,
        submitterAdminId: input.submitterAdminId,
        departmentRoleId: input.departmentRoleId,
        clientName: input.clientName,
        clientContact: input.clientContact,
        clientLocation: input.clientLocation,
      },
    });

    await trx.ticketAssignedRole.create({
      data: {
        ticketId: ticket.id,
        roleId: input.departmentRoleId,
      },
    });

    await createHistory(trx, {
      ticketId: ticket.id,
      actorAdminId: input.submitterAdminId,
      action: 'CREATED',
      toValue: ticket.status,
      metadata: { code, priority: ticket.priority, departmentRoleId: input.departmentRoleId },
    });

    await createHistory(trx, {
      ticketId: ticket.id,
      actorAdminId: input.submitterAdminId,
      action: 'ASSIGNMENT_CHANGED',
      toValue: input.departmentRoleId,
      metadata: { roleIds: [input.departmentRoleId] },
    });

    return ticket;
  });
}

export async function getTicketById(id: string, tx: TxLike = prisma) {
  return tx.ticket.findUnique({
    where: { id },
    include: {
      submitterAdmin: { select: { id: true, name: true, roleId: true } },
      departmentRole: { select: { id: true, name: true } },
      assignedRoles: { include: { role: { select: { id: true, name: true } } } },
      messages: {
        include: {
          admin: { select: { id: true, name: true, roleId: true } },
          attachments: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      attachments: { where: { messageId: null }, orderBy: { createdAt: 'asc' } },
    },
  });
}

export async function getTicketByCode(code: string, tx: TxLike = prisma) {
  return tx.ticket.findUnique({ where: { code } });
}

export async function listTickets(params: TicketListParams = {}, tx: TxLike = prisma) {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const cursor = params.cursor ? decodeCursor(params.cursor) : null;

  const where: Prisma.TicketWhereInput = {
    ...(params.search
      ? {
          OR: [
            { code: { contains: params.search, mode: 'insensitive' } },
            { title: { contains: params.search, mode: 'insensitive' } },
            { clientName: { contains: params.search, mode: 'insensitive' } },
            { clientContact: { contains: params.search, mode: 'insensitive' } },
            { clientLocation: { contains: params.search, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(params.statuses?.length ? { status: { in: params.statuses } } : {}),
    ...(params.priorities?.length ? { priority: { in: params.priorities } } : {}),
    ...(params.submitterAdminId ? { submitterAdminId: params.submitterAdminId } : {}),
    ...(params.assignedRoleIds?.length ? { assignedRoles: { some: { roleId: { in: params.assignedRoleIds } } } } : {}),
    ...(params.unassignedOnly ? { assignedRoles: { none: {} } } : {}),
    ...(cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
          ],
        }
      : {}),
  };

  const rows = await tx.ticket.findMany({
    where,
    take: limit + 1,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      submitterAdmin: { select: { id: true, name: true } },
      assignedRoles: { include: { role: { select: { id: true, name: true } } } },
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const tail = items[items.length - 1];

  return {
    items,
    nextCursor: hasMore && tail ? encodeCursor({ id: tail.id, createdAt: tail.createdAt.toISOString() }) : null,
    hasMore,
  };
}

export async function listMyTickets(adminId: string, params: Omit<TicketListParams, 'submitterAdminId'> = {}, tx: TxLike = prisma) {
  return listTickets({ ...params, submitterAdminId: adminId }, tx);
}

export async function listUnassignedTickets(params: Omit<TicketListParams, 'unassignedOnly'> = {}, tx: TxLike = prisma) {
  return listTickets({ ...params, unassignedOnly: true }, tx);
}

export async function listClosedTickets(params: Omit<TicketListParams, 'statuses'> = {}, tx: TxLike = prisma) {
  return listTickets({ ...params, statuses: ['CLOSED'] }, tx);
}

export async function updateTicketStatus(input: {
  ticketId: string;
  nextStatus: TicketStatus;
  actorAdminId: string;
  actorRoleName?: string | null;
  actorIsSuperAdmin?: boolean;
  actorPermissions?: string[];
}, tx: TxLike = prisma) {
  return withTransaction(tx, async trx => {
    const ticket = await trx.ticket.findUnique({
      where: { id: input.ticketId },
      select: { id: true, status: true, submitterAdminId: true },
    });
    if (!ticket) throw new Error('Ticket not found');

    const canTransition = canTransitionStatus({
      currentStatus: ticket.status,
      nextStatus: input.nextStatus,
      isSubmitter: ticket.submitterAdminId === input.actorAdminId,
      roleName: input.actorRoleName,
      isSuperAdmin: input.actorIsSuperAdmin,
      permissions: input.actorPermissions,
    });
    if (!canTransition) throw new Error('Status transition is not allowed');

    const updated = await trx.ticket.update({
      where: { id: input.ticketId },
      data: {
        status: input.nextStatus,
        ...statusTimestampPatch(input.nextStatus),
      },
    });

    await createHistory(trx, {
      ticketId: input.ticketId,
      actorAdminId: input.actorAdminId,
      action: ticket.status === 'CLOSED' || ticket.status === 'CANNOT_RESOLVE' ? 'REOPENED' : 'STATUS_CHANGED',
      fromValue: ticket.status,
      toValue: input.nextStatus,
    });

    return updated;
  });
}

export async function updateTicketPriority(input: {
  ticketId: string;
  priority: TicketPriority;
  actorAdminId: string;
}, tx: TxLike = prisma) {
  return withTransaction(tx, async trx => {
    const ticket = await trx.ticket.findUnique({
      where: { id: input.ticketId },
      select: { priority: true },
    });
    if (!ticket) throw new Error('Ticket not found');

    const updated = await trx.ticket.update({
      where: { id: input.ticketId },
      data: { priority: input.priority },
    });

    if (ticket.priority !== input.priority) {
      await createHistory(trx, {
        ticketId: input.ticketId,
        actorAdminId: input.actorAdminId,
        action: 'PRIORITY_CHANGED',
        fromValue: ticket.priority,
        toValue: input.priority,
      });
    }

    return updated;
  });
}

export async function updateTicketAssignedRoles(input: {
  ticketId: string;
  roleIds: string[];
  actorAdminId: string;
}, tx: TxLike = prisma) {
  return withTransaction(tx, async trx => {
    const uniqueRoleIds = Array.from(new Set(input.roleIds));

    const current = await trx.ticketAssignedRole.findMany({
      where: { ticketId: input.ticketId },
      select: { roleId: true },
    });
    const currentRoleIds = current.map(item => item.roleId).sort();
    const nextRoleIds = [...uniqueRoleIds].sort();

    await trx.ticketAssignedRole.deleteMany({ where: { ticketId: input.ticketId } });
    if (uniqueRoleIds.length > 0) {
      await trx.ticketAssignedRole.createMany({
        data: uniqueRoleIds.map(roleId => ({ ticketId: input.ticketId, roleId })),
      });
    }

    if (JSON.stringify(currentRoleIds) !== JSON.stringify(nextRoleIds)) {
      await createHistory(trx, {
        ticketId: input.ticketId,
        actorAdminId: input.actorAdminId,
        action: 'ASSIGNMENT_CHANGED',
        fromValue: currentRoleIds.join(',') || null,
        toValue: nextRoleIds.join(',') || null,
        metadata: { roleIds: uniqueRoleIds },
      });
    }

    return trx.ticketAssignedRole.findMany({
      where: { ticketId: input.ticketId },
      include: { role: { select: { id: true, name: true } } },
    });
  });
}

export async function addTicketMessage(input: {
  ticketId: string;
  adminId: string;
  body: string;
}, tx: TxLike = prisma) {
  return withTransaction(tx, async trx => {
    const message = await trx.ticketMessage.create({
      data: {
        ticketId: input.ticketId,
        adminId: input.adminId,
        body: input.body,
      },
    });

    await createHistory(trx, {
      ticketId: input.ticketId,
      actorAdminId: input.adminId,
      action: 'MESSAGE_ADDED',
      toValue: message.id,
    });

    return message;
  });
}

export async function addTicketAttachments(input: {
  ticketId: string;
  uploadedByAdminId: string;
  attachments: TicketAttachmentInput[];
}, tx: TxLike = prisma) {
  return withTransaction(tx, async trx => {
    if (input.attachments.length === 0) return [];

    await trx.ticketAttachment.createMany({
      data: input.attachments.map(attachment => ({
        ticketId: input.ticketId,
        messageId: attachment.messageId ?? null,
        uploadedByAdminId: input.uploadedByAdminId,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        s3Key: attachment.s3Key,
        s3Bucket: attachment.s3Bucket || 'unknown',
        publicUrl: attachment.publicUrl ?? null,
      })),
    });

    await Promise.all(
      input.attachments.map(attachment =>
        createHistory(trx, {
          ticketId: input.ticketId,
          actorAdminId: input.uploadedByAdminId,
          action: 'ATTACHMENT_ADDED',
          toValue: attachment.s3Key,
          metadata: { fileName: attachment.fileName, messageId: attachment.messageId ?? null },
        })
      )
    );

    return trx.ticketAttachment.findMany({
      where: {
        ticketId: input.ticketId,
        s3Key: { in: input.attachments.map(attachment => attachment.s3Key) },
      },
      orderBy: { createdAt: 'asc' },
    });
  });
}

export async function getTicketHistory(ticketId: string, tx: TxLike = prisma) {
  return tx.ticketHistory.findMany({
    where: { ticketId },
    include: {
      actor: { select: { id: true, name: true, roleId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export { isITRole, isOperationalActor, OPERATIONAL_STATUSES };
async function withTransaction<T>(tx: TxLike, callback: (trx: TxLike) => Promise<T>) {
  if ('$transaction' in tx) {
    return tx.$transaction(trx => callback(trx as TxLike));
  }
  return callback(tx);
}
