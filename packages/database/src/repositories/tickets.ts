import { Prisma, TicketHistoryAction, TicketPriority, TicketStatus } from '@prisma/client';
import { db as prisma } from '../prisma/client';

type TxLike = Prisma.TransactionClient | typeof prisma;
type TxCallback<T> = (tx: TxLike) => Promise<T>;

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

export type TicketMessageWithAttachmentsInput = {
  ticketId: string;
  adminId: string;
  body: string;
  attachments?: TicketAttachmentInput[];
};

export type CreateTicketInput = {
  title: string;
  description: string;
  resolutionTargetHours: number;
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
  claimedByAdminId?: string;
  claimedByType?: 'ADMIN' | 'EMPLOYEE';
  unclaimedOnly?: boolean;
  cursor?: string;
  limit?: number;
};

export type ClaimTicketInput = {
  ticketId: string;
  actorAdminId?: string;
  actorEmployeeId?: string;
  actorRoleId?: string | null;
  actorIsSuperAdmin?: boolean;
};

export type TicketListCursor = {
  createdAt: string;
  id: string;
};

export type TicketDashboardCategoryStat = {
  value: string;
  label: string;
  count: number;
  percentage: number;
};

export type TicketDashboardSidebarStats = {
  shortcuts: {
    myOpenSubmitted: number;
    unassigned: number;
    slaBreached: number;
    resolvedToday: number;
  };
  categories: TicketDashboardCategoryStat[];
  slaStatus: {
    met: number;
    pending: number;
    breached: number;
    total: number;
    metPercentage: number;
    pendingPercentage: number;
    breachedPercentage: number;
  };
};

export type TicketDashboardComparisonStats = {
  yesterdayTotal: number;
  yesterdayResolved: number;
};

const OPERATIONAL_STATUSES: TicketStatus[] = [
  'ACKNOWLEDGED',
  'WAITING_INFORMATION',
  'IN_PROGRESS',
  'SOLVED',
  'CANNOT_RESOLVE',
];
const TERMINAL_STATUSES = new Set<TicketStatus>(['CLOSED', 'CANNOT_RESOLVE']);
const CLOSED_VIEW_STATUSES: TicketStatus[] = ['CLOSED'];
const ACTIVE_VIEW_EXCLUDED_STATUSES: TicketStatus[] = ['CLOSED', 'CANNOT_RESOLVE'];
const ACTIVE_VIEW_STATUSES: TicketStatus[] = ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED'];
const SUBMITTED_OPEN_STATUSES: TicketStatus[] = ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED'];
const SLA_ACTIVE_STATUSES: TicketStatus[] = ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS'];
const SLA_TERMINAL_STATUSES = new Set<TicketStatus>(['SOLVED', 'CLOSED', 'CANNOT_RESOLVE']);

function isITRole(roleName?: string | null) {
  return roleName?.trim().toLowerCase() === 'it';
}

function isOperationalActor(input: { roleName?: string | null; isSuperAdmin?: boolean; permissions?: string[] }) {
  return Boolean(
    input.isSuperAdmin || isITRole(input.roleName) || input.permissions?.includes(TICKET_OPERATIONAL_EDITOR_PERMISSION)
  );
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
  return words
    .map(word => word[0])
    .join('')
    .slice(0, 6);
}

function toTicketDepartmentCode(departmentName: string) {
  const normalized = departmentName.toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return normalized.slice(0, 6) || 'TKT';
}

function resolveTicketCodePrefix(role: { name: string; policy?: Prisma.JsonValue | null }) {
  const policy = role.policy;
  if (policy && typeof policy === 'object' && !Array.isArray(policy)) {
    const ticketDepartment = (policy as Prisma.JsonObject).ticketDepartment;
    if (typeof ticketDepartment === 'string' && ticketDepartment.trim().length > 0) {
      return toTicketDepartmentCode(ticketDepartment);
    }
  }
  return toDepartmentCode(role.name);
}

async function nextTicketCode(roleId: string, tx: TxLike) {
  const role = await tx.role.findUnique({
    where: { id: roleId },
    select: { name: true, policy: true },
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
  const prefix = resolveTicketCodePrefix(role);

  return `${prefix}_${year}_${month}_${serial}`;
}

function statusTimestampPatch(status: TicketStatus) {
  if (status === 'SOLVED') return { solvedAt: new Date() };
  if (status === 'CLOSED') return { closedAt: new Date() };
  if (status === 'CANNOT_RESOLVE') return { cannotResolveAt: new Date() };
  return {};
}

function reopenTimestampPatch() {
  return {
    solvedAt: null,
    closedAt: null,
    cannotResolveAt: null,
  };
}

function getTicketSlaDeadline(createdAt: Date, resolutionTargetHours: number) {
  return new Date(createdAt.getTime() + resolutionTargetHours * 60 * 60 * 1000);
}

function getTicketCompletionAt(ticket: {
  status: TicketStatus;
  solvedAt: Date | null;
  closedAt: Date | null;
  cannotResolveAt: Date | null;
  updatedAt: Date;
}) {
  if (ticket.status === 'SOLVED') return ticket.solvedAt ?? ticket.updatedAt;
  if (ticket.status === 'CLOSED') return ticket.closedAt ?? ticket.updatedAt;
  if (ticket.status === 'CANNOT_RESOLVE') return ticket.cannotResolveAt ?? ticket.updatedAt;
  return null;
}

function summarizeTicketSlaStatus(
  tickets: Array<{
    status: TicketStatus;
    createdAt: Date;
    updatedAt: Date;
    resolutionTargetHours: number;
    solvedAt: Date | null;
    closedAt: Date | null;
    cannotResolveAt: Date | null;
  }>,
  now: Date = new Date()
) {
  let met = 0;
  let pending = 0;
  let breached = 0;

  for (const ticket of tickets) {
    const deadline = getTicketSlaDeadline(ticket.createdAt, ticket.resolutionTargetHours);

    if (SLA_ACTIVE_STATUSES.includes(ticket.status)) {
      if (deadline.getTime() < now.getTime()) {
        breached += 1;
      } else {
        pending += 1;
      }
      continue;
    }

    if (SLA_TERMINAL_STATUSES.has(ticket.status)) {
      const completionAt = getTicketCompletionAt(ticket);
      if (completionAt && completionAt.getTime() <= deadline.getTime()) {
        met += 1;
      } else {
        breached += 1;
      }
    }
  }

  const total = met + pending + breached;
  return {
    met,
    pending,
    breached,
    total,
    metPercentage: total > 0 ? Math.round((met / total) * 100) : 0,
    pendingPercentage: total > 0 ? Math.round((pending / total) * 100) : 0,
    breachedPercentage: total > 0 ? Math.round((breached / total) * 100) : 0,
  };
}

async function resolveDepartmentTargetEmployees(
  roleName: string,
  ticketDepartment: string | null | undefined,
  tx: TxLike
) {
  let queryDepts: string[] = [];
  let keyword = '';

  if (ticketDepartment) {
    keyword = ticketDepartment;
    if (ticketDepartment === 'HR') {
      queryDepts = ['HR', 'Human Resources'];
    } else if (ticketDepartment === 'IT') {
      queryDepts = ['IT', 'IT Department', 'Information Technology'];
    } else if (ticketDepartment === 'CS') {
      queryDepts = ['CS', 'Customer Service', 'Customer Support'];
    } else {
      queryDepts = [ticketDepartment];
    }
  } else {
    keyword = roleName.trim();
    if (keyword) {
      queryDepts = [keyword];
    }
  }

  if (queryDepts.length === 0) {
    return { keyword: '', employees: [] as Array<{ id: string }> };
  }

  const employees = await tx.employee.findMany({
    where: {
      deletedAt: null,
      status: true,
      OR: queryDepts.map(dept => ({
        department: { contains: dept, mode: 'insensitive' },
      })),
    },
    select: { id: true },
  });

  return { keyword, employees };
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
    if (
      isSubmitter &&
      ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED'].includes(currentStatus)
    ) {
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
    actorEmployeeId?: string | null;
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
      actorEmployeeId: input.actorEmployeeId ?? null,
      action: input.action,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue ?? null,
      metadata: input.metadata,
    },
  });
}

export async function createTicket(input: CreateTicketInput, tx: TxLike = prisma) {
  return withTransaction(tx, async trx => {
    const departmentRole = await trx.role.findUnique({
      where: { id: input.departmentRoleId },
      select: { name: true, policy: true },
    });
    if (!departmentRole) {
      throw new Error('Department role not found');
    }

    const policyObj = departmentRole.policy as { ticketDepartment?: string } | null;
    const ticketDepartment = policyObj?.ticketDepartment;
    const targetEmployees = await resolveDepartmentTargetEmployees(departmentRole.name, ticketDepartment, trx);
    const code = await nextTicketCode(input.departmentRoleId, trx);

    const ticket = await trx.ticket.create({
      data: {
        code,
        title: input.title,
        description: input.description,
        resolutionTargetHours: input.resolutionTargetHours,
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

    if (targetEmployees.employees.length > 0) {
      await trx.ticketAssignedEmployee.createMany({
        data: targetEmployees.employees.map(employee => ({
          ticketId: ticket.id,
          employeeId: employee.id,
          matchKeyword: targetEmployees.keyword,
        })),
      });
    }

    await createHistory(trx, {
      ticketId: ticket.id,
      actorAdminId: input.submitterAdminId,
      action: 'CREATED',
      toValue: ticket.status,
      metadata: {
        code,
        priority: ticket.priority,
        resolutionTargetHours: input.resolutionTargetHours,
        departmentRoleId: input.departmentRoleId,
        employeeDepartmentKeyword: targetEmployees.keyword,
        assignedEmployeeCount: targetEmployees.employees.length,
      },
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
      claimedByAdmin: { select: { id: true, name: true, roleId: true } },
      claimedByEmployee: { select: { id: true, fullName: true, department: true } },
      departmentRole: { select: { id: true, name: true, policy: true } },
      assignedRoles: { include: { role: { select: { id: true, name: true } } } },
      assignedEmployees: {
        include: {
          employee: {
            select: { id: true, fullName: true, department: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
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
    ...(params.claimedByType ? { claimedByType: params.claimedByType } : {}),
    ...(params.claimedByAdminId ? { claimedByAdminId: params.claimedByAdminId } : {}),
    ...(params.assignedRoleIds?.length ? { assignedRoles: { some: { roleId: { in: params.assignedRoleIds } } } } : {}),
    ...(params.unclaimedOnly ? { claimedByType: null } : {}),
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
      claimedByAdmin: { select: { id: true, name: true } },
      claimedByEmployee: { select: { id: true, fullName: true } },
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

export async function listMyTickets(
  adminId: string,
  params: Omit<TicketListParams, 'submitterAdminId'> = {},
  tx: TxLike = prisma
) {
  return listTickets(
    {
      ...params,
      claimedByType: 'ADMIN',
      claimedByAdminId: adminId,
      statuses: params.statuses?.length
        ? params.statuses.filter(status => !ACTIVE_VIEW_EXCLUDED_STATUSES.includes(status))
        : ACTIVE_VIEW_STATUSES,
    },
    tx
  );
}

export async function listUnassignedTickets(params: Omit<TicketListParams, 'unclaimedOnly'> = {}, tx: TxLike = prisma) {
  return listTickets(
    {
      ...params,
      unclaimedOnly: true,
      statuses: params.statuses?.length
        ? params.statuses.filter(status => !ACTIVE_VIEW_EXCLUDED_STATUSES.includes(status))
        : ACTIVE_VIEW_STATUSES,
    },
    tx
  );
}

export async function listClosedTickets(params: Omit<TicketListParams, 'statuses'> = {}, tx: TxLike = prisma) {
  return listTickets({ ...params, statuses: CLOSED_VIEW_STATUSES }, tx);
}

export async function getTicketSidebarCounts(adminId: string, tx: TxLike = prisma) {
  const activeStatusFilter: Prisma.TicketWhereInput = {
    status: { notIn: CLOSED_VIEW_STATUSES },
  };

  const [all, my, unassigned, closed] = await Promise.all([
    tx.ticket.count({ where: activeStatusFilter }),
    tx.ticket.count({
      where: {
        ...activeStatusFilter,
        status: { notIn: ACTIVE_VIEW_EXCLUDED_STATUSES },
        claimedByType: 'ADMIN',
        claimedByAdminId: adminId,
      },
    }),
    tx.ticket.count({
      where: {
        ...activeStatusFilter,
        status: { notIn: ACTIVE_VIEW_EXCLUDED_STATUSES },
        claimedByType: null,
      },
    }),
    tx.ticket.count({ where: { status: { in: CLOSED_VIEW_STATUSES } } }),
  ]);

  return { all, my, unassigned, closed };
}

export async function getTicketDashboardSidebarStats(
  input: {
    adminId: string;
    categories: readonly string[];
    startOfToday?: Date;
    now?: Date;
  },
  tx: TxLike = prisma
): Promise<TicketDashboardSidebarStats> {
  const today = input.startOfToday ?? new Date(new Date().setHours(0, 0, 0, 0));

  const [myOpenSubmitted, unassigned, resolvedToday, categoryCounts, slaTickets] = await Promise.all([
    tx.ticket.count({
      where: {
        submitterAdminId: input.adminId,
        status: { in: SUBMITTED_OPEN_STATUSES },
      },
    }),
    tx.ticket.count({
      where: {
        claimedByType: null,
        status: { notIn: ACTIVE_VIEW_EXCLUDED_STATUSES },
      },
    }),
    tx.ticket.count({
      where: {
        OR: [{ solvedAt: { gte: today } }, { closedAt: { gte: today } }],
      },
    }),
    Promise.all(
      input.categories.map(category =>
        tx.ticket.count({
          where: {
            departmentRole: {
              is: {
                policy: {
                  path: ['ticketDepartment'],
                  equals: category,
                },
              },
            },
          },
        })
      )
    ),
    tx.ticket.findMany({
      select: {
        status: true,
        createdAt: true,
        updatedAt: true,
        resolutionTargetHours: true,
        solvedAt: true,
        closedAt: true,
        cannotResolveAt: true,
      },
    }),
  ]);

  const slaStatus = summarizeTicketSlaStatus(slaTickets, input.now);

  const categories = input.categories.map((category, index) => {
    const count = categoryCounts[index] ?? 0;
    return {
      value: category,
      label: category,
      count,
      percentage: slaStatus.total > 0 ? Math.round((count / slaStatus.total) * 100) : 0,
    };
  });

  return {
    shortcuts: {
      myOpenSubmitted,
      unassigned,
      slaBreached: slaStatus.breached,
      resolvedToday,
    },
    categories,
    slaStatus,
  };
}

export async function getTicketDashboardComparisonStats(
  input: {
    startOfToday?: Date;
  } = {},
  tx: TxLike = prisma
): Promise<TicketDashboardComparisonStats> {
  const startOfToday = input.startOfToday ?? new Date(new Date().setHours(0, 0, 0, 0));
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const [yesterdayTotal, yesterdayResolved] = await Promise.all([
    tx.ticket.count({
      where: {
        createdAt: {
          gte: startOfYesterday,
          lt: startOfToday,
        },
      },
    }),
    tx.ticket.count({
      where: {
        OR: [
          {
            solvedAt: {
              gte: startOfYesterday,
              lt: startOfToday,
            },
          },
          {
            closedAt: {
              gte: startOfYesterday,
              lt: startOfToday,
            },
          },
        ],
      },
    }),
  ]);

  return {
    yesterdayTotal,
    yesterdayResolved,
  };
}

export async function updateTicketStatus(
  input: {
    ticketId: string;
    nextStatus: TicketStatus;
    actorAdminId: string;
    actorRoleName?: string | null;
    actorIsSuperAdmin?: boolean;
    actorPermissions?: string[];
  },
  tx: TxLike = prisma
) {
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
        ...((ticket.status === 'CLOSED' || ticket.status === 'CANNOT_RESOLVE') && input.nextStatus === 'ACKNOWLEDGED'
          ? reopenTimestampPatch()
          : {}),
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

export async function updateTicketPriority(
  input: {
    ticketId: string;
    priority: TicketPriority;
    actorAdminId: string;
  },
  tx: TxLike = prisma
) {
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

export async function updateTicketAssignedRoles(
  input: {
    ticketId: string;
    roleIds: string[];
    actorAdminId: string;
  },
  tx: TxLike = prisma
) {
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

export async function listTicketAssignedEmployees(ticketId: string, tx: TxLike = prisma) {
  return tx.ticketAssignedEmployee.findMany({
    where: { ticketId },
    include: {
      employee: {
        select: { id: true, fullName: true, department: true },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

export async function refreshTicketAssignedEmployees(ticketId: string, tx: TxLike = prisma) {
  return withTransaction(tx, async trx => {
    const ticket = await trx.ticket.findUnique({
      where: { id: ticketId },
      include: {
        departmentRole: { select: { name: true, policy: true } },
      },
    });
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    if (!ticket.departmentRole?.name) {
      throw new Error('Ticket department role not found');
    }

    const policyObj = ticket.departmentRole.policy as { ticketDepartment?: string } | null;
    const ticketDepartment = policyObj?.ticketDepartment;

    const targetEmployees = await resolveDepartmentTargetEmployees(ticket.departmentRole.name, ticketDepartment, trx);

    await trx.ticketAssignedEmployee.deleteMany({ where: { ticketId } });
    if (targetEmployees.employees.length > 0) {
      await trx.ticketAssignedEmployee.createMany({
        data: targetEmployees.employees.map(employee => ({
          ticketId,
          employeeId: employee.id,
          matchKeyword: targetEmployees.keyword,
        })),
      });
    }

    await createHistory(trx, {
      ticketId,
      action: 'ASSIGNMENT_CHANGED',
      metadata: {
        assignmentType: 'employee_department_refresh',
        employeeDepartmentKeyword: targetEmployees.keyword,
        assignedEmployeeCount: targetEmployees.employees.length,
      },
    });

    return listTicketAssignedEmployees(ticketId, trx);
  });
}

export async function claimTicket(input: ClaimTicketInput, tx: TxLike = prisma) {
  return withTransaction(tx, async trx => {
    const isAdminClaim = Boolean(input.actorAdminId);
    const isEmployeeClaim = Boolean(input.actorEmployeeId);
    if (isAdminClaim === isEmployeeClaim) {
      throw new Error('Claim actor must be exactly one of admin or employee');
    }

    const ticket = await trx.ticket.findUnique({
      where: { id: input.ticketId },
      select: {
        id: true,
        status: true,
        claimedByType: true,
        claimedByAdminId: true,
        claimedByEmployeeId: true,
        departmentRoleId: true,
        assignedEmployees: {
          select: { employeeId: true },
        },
      },
    });
    if (!ticket) throw new Error('Ticket not found');

    if (isAdminClaim) {
      if (!ticket.departmentRoleId) throw new Error('Ticket department is not set');
      const canClaim = Boolean(input.actorRoleId === ticket.departmentRoleId);
      if (!canClaim) {
        throw new Error('Only admins in the ticket department can claim this ticket');
      }
    } else {
      const canClaim = ticket.assignedEmployees.some(item => item.employeeId === input.actorEmployeeId);
      if (!canClaim) {
        throw new Error('Only targeted employees can claim this ticket');
      }
    }

    const nextClaimKey = isAdminClaim ? `ADMIN:${input.actorAdminId}` : `EMPLOYEE:${input.actorEmployeeId}`;
    const prevClaimKey =
      ticket.claimedByType === 'ADMIN'
        ? `ADMIN:${ticket.claimedByAdminId}`
        : ticket.claimedByType === 'EMPLOYEE'
          ? `EMPLOYEE:${ticket.claimedByEmployeeId}`
          : null;
    if (prevClaimKey === nextClaimKey) {
      throw new Error('Ticket is already claimed by you');
    }

    const updated = await trx.ticket.update({
      where: { id: input.ticketId },
      data: isAdminClaim
        ? {
            claimedByType: 'ADMIN',
            claimedByAdminId: input.actorAdminId,
            claimedByEmployeeId: null,
            claimedAt: new Date(),
          }
        : {
            claimedByType: 'EMPLOYEE',
            claimedByEmployeeId: input.actorEmployeeId,
            claimedByAdminId: null,
            claimedAt: new Date(),
          },
      include: {
        claimedByAdmin: { select: { id: true, name: true, roleId: true } },
        claimedByEmployee: { select: { id: true, fullName: true, department: true } },
      },
    });

    await createHistory(trx, {
      ticketId: input.ticketId,
      actorAdminId: input.actorAdminId ?? null,
      actorEmployeeId: input.actorEmployeeId ?? null,
      action: 'ASSIGNMENT_CHANGED',
      fromValue: prevClaimKey,
      toValue: nextClaimKey,
      metadata: {
        claimType: isAdminClaim ? 'ADMIN' : 'EMPLOYEE',
        previousClaim: prevClaimKey,
        nextClaim: nextClaimKey,
      },
    });

    if (ticket.status === 'NEW') {
      await trx.ticket.update({
        where: { id: input.ticketId },
        data: { status: 'ACKNOWLEDGED' },
      });
      await createHistory(trx, {
        ticketId: input.ticketId,
        actorAdminId: input.actorAdminId ?? null,
        actorEmployeeId: input.actorEmployeeId ?? null,
        action: 'STATUS_CHANGED',
        fromValue: 'NEW',
        toValue: 'ACKNOWLEDGED',
        metadata: { reason: 'auto_ack_on_claim' },
      });
    }

    return updated;
  });
}

export async function addTicketMessage(
  input: {
    ticketId: string;
    adminId: string;
    body: string;
  },
  tx: TxLike = prisma
) {
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

export async function addTicketAttachments(
  input: {
    ticketId: string;
    uploadedByAdminId: string;
    attachments: TicketAttachmentInput[];
  },
  tx: TxLike = prisma
) {
  return withTransaction(tx, async trx => {
    if (input.attachments.length === 0) return [];

    const messageIds = Array.from(
      new Set(
        input.attachments.map(attachment => attachment.messageId).filter((value): value is string => Boolean(value))
      )
    );
    if (messageIds.length > 0) {
      const ownedMessages = await trx.ticketMessage.findMany({
        where: {
          id: { in: messageIds },
          ticketId: input.ticketId,
        },
        select: { id: true },
      });
      const ownedMessageIdSet = new Set(ownedMessages.map(message => message.id));
      const invalidMessageId = messageIds.find(messageId => !ownedMessageIdSet.has(messageId));
      if (invalidMessageId) {
        throw new Error('Attachment messageId does not belong to the ticket');
      }
    }

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

export async function addTicketMessageWithAttachments(input: TicketMessageWithAttachmentsInput, tx: TxLike = prisma) {
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

    const attachments = input.attachments?.length
      ? await addTicketAttachments(
          {
            ticketId: input.ticketId,
            uploadedByAdminId: input.adminId,
            attachments: input.attachments.map(attachment => ({
              ...attachment,
              messageId: message.id,
            })),
          },
          trx
        )
      : [];

    return { message, attachments };
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
async function withTransaction<T>(tx: TxLike, callback: TxCallback<T>) {
  if ('$transaction' in tx) {
    return tx.$transaction(trx => callback(trx as TxLike));
  }
  return callback(tx);
}
