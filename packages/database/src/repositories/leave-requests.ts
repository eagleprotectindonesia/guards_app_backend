import { EmployeeRole, LeaveRequestReason, LeaveRequestStatus, Prisma } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { upsertEmployeeOfficeDayOverride } from './office-day-overrides';
import { redis } from '../redis/client';
import { createLeaveRequestCreatedAdminNotifications } from './admin-notifications';

type TxLike = Prisma.TransactionClient | typeof prisma;
export const OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR = 'Overlapping pending leave request already exists';
type AdminLeaveRequestSortField = 'startDate' | 'status' | 'createdAt';
type AdminLeaveRequestFilterParams = {
  statuses?: LeaveRequestStatus[];
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  employeeRoleFilter?: EmployeeRole;
  employeeWhere?: Prisma.EmployeeWhereInput;
  sortBy?: AdminLeaveRequestSortField;
  sortOrder?: Prisma.SortOrder;
};

const adminLeaveRequestInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
      role: true,
      department: true,
      officeId: true,
    },
  },
  reviewedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.EmployeeLeaveRequestInclude;

function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function dateToDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function listDateKeysInclusive(startDateKey: string, endDateKey: string) {
  const keys: string[] = [];
  const cursor = dateKeyToDate(startDateKey);
  const end = dateKeyToDate(endDateKey);

  while (cursor.getTime() <= end.getTime()) {
    keys.push(dateToDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

function normalizeDateRange(startDateKey: string, endDateKey: string) {
  if (startDateKey > endDateKey) {
    throw new Error('startDate must be before or equal to endDate');
  }

  return {
    startDate: dateKeyToDate(startDateKey),
    endDate: dateKeyToDate(endDateKey),
  };
}

function isOverlapConflictError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2004') {
    return false;
  }

  const databaseError =
    typeof error.meta?.database_error === 'string' ? error.meta.database_error : error.message;
  return databaseError.includes('employee_leave_requests_pending_no_overlap');
}

export async function createEmployeeLeaveRequest(
  params: {
    employeeId: string;
    startDate: string;
    endDate: string;
    reason: LeaveRequestReason;
    employeeNote?: string | null;
    attachments?: string[];
  },
  tx: TxLike = prisma
) {
  const { startDate, endDate } = normalizeDateRange(params.startDate, params.endDate);
  const targetTx = tx as TxLike;

  const overlappingPendingRequest = await targetTx.employeeLeaveRequest.findFirst({
    where: {
      employeeId: params.employeeId,
      status: 'pending',
      endDate: { gte: startDate },
      startDate: { lte: endDate },
    },
    select: {
      id: true,
    },
  });

  if (overlappingPendingRequest) {
    throw new Error(OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR);
  }

  const created = await (async () => {
    try {
      return await targetTx.employeeLeaveRequest.create({
        data: {
          employeeId: params.employeeId,
          startDate,
          endDate,
          reason: params.reason,
          employeeNote: params.employeeNote ?? null,
          attachments: params.attachments ?? [],
          status: 'pending',
        },
      });
    } catch (error) {
      if (isOverlapConflictError(error)) {
        throw new Error(OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR);
      }
      throw error;
    }
  })();

  await targetTx.changelog.create({
    data: {
      action: 'CREATE',
      entityType: 'EmployeeLeaveRequest',
      entityId: created.id,
      actor: 'system',
      details: {
        employeeId: params.employeeId,
        startDate: params.startDate,
        endDate: params.endDate,
        reason: params.reason,
        employeeNote: params.employeeNote ?? null,
        attachments: params.attachments ?? [],
        status: 'pending',
      },
    },
  });

  const createdNotifications = await createLeaveRequestCreatedAdminNotifications(
    {
      leaveRequestId: created.id,
      employeeId: created.employeeId,
      startDate: created.startDate,
      endDate: created.endDate,
      reason: created.reason,
    },
    targetTx
  );

  await Promise.all(
    createdNotifications.map(notification =>
      redis.publish(
        `admin-notifications:admin:${notification.adminId}`,
        JSON.stringify({
          type: 'admin_notification_created',
          notification,
        })
      )
    )
  );

  return created;
}

export async function listEmployeeLeaveRequestsByEmployee(employeeId: string, tx: TxLike = prisma) {
  return (tx as TxLike).employeeLeaveRequest.findMany({
    where: { employeeId },
    orderBy: [{ createdAt: 'desc' }],
  });
}

export async function listEmployeeLeaveRequestsForAdmin(
  params: AdminLeaveRequestFilterParams,
  tx: TxLike = prisma
) {
  const where = buildAdminLeaveRequestWhere(params);
  const orderBy = buildAdminLeaveRequestOrderBy(params);

  return (tx as TxLike).employeeLeaveRequest.findMany({
    where,
    include: adminLeaveRequestInclude,
    orderBy,
  });
}

export async function getPaginatedEmployeeLeaveRequestsForAdmin(
  params: AdminLeaveRequestFilterParams & {
    skip: number;
    take: number;
  },
  tx: TxLike = prisma
) {
  const where = buildAdminLeaveRequestWhere(params);
  const orderBy = buildAdminLeaveRequestOrderBy(params);
  const targetTx = tx as TxLike;

  const [leaveRequests, totalCount] = await Promise.all([
    targetTx.employeeLeaveRequest.findMany({
      where,
      include: adminLeaveRequestInclude,
      orderBy,
      skip: params.skip,
      take: params.take,
    }),
    targetTx.employeeLeaveRequest.count({ where }),
  ]);

  return { leaveRequests, totalCount };
}

export async function getEmployeeLeaveRequestByIdForAdmin(requestId: string, tx: TxLike = prisma) {
  return (tx as TxLike).employeeLeaveRequest.findUnique({
    where: { id: requestId },
    include: adminLeaveRequestInclude,
  });
}

function buildAdminLeaveRequestWhere(params: AdminLeaveRequestFilterParams): Prisma.EmployeeLeaveRequestWhereInput {
  const startDate = params.startDate ? dateKeyToDate(params.startDate) : undefined;
  const endDate = params.endDate ? dateKeyToDate(params.endDate) : undefined;
  const employeeFilters: Prisma.EmployeeWhereInput[] = [];

  if (params.employeeRoleFilter) {
    employeeFilters.push({ role: params.employeeRoleFilter });
  }

  if (params.employeeWhere) {
    employeeFilters.push(params.employeeWhere);
  }

  const employeeFilter =
    employeeFilters.length === 0
      ? undefined
      : employeeFilters.length === 1
        ? employeeFilters[0]
        : { AND: employeeFilters };

  return {
    status: params.statuses && params.statuses.length > 0 ? { in: params.statuses } : undefined,
    employeeId: params.employeeId,
    ...(startDate || endDate
      ? {
          AND: [startDate ? { endDate: { gte: startDate } } : {}, endDate ? { startDate: { lte: endDate } } : {}],
        }
      : {}),
    employee: employeeFilter ? { is: employeeFilter } : undefined,
  };
}

function buildAdminLeaveRequestOrderBy(
  params: Pick<AdminLeaveRequestFilterParams, 'sortBy' | 'sortOrder'>
): Prisma.EmployeeLeaveRequestOrderByWithRelationInput[] {
  const sortOrder: Prisma.SortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';
  const sortBy: AdminLeaveRequestSortField = params.sortBy ?? 'createdAt';

  switch (sortBy) {
    case 'startDate':
      return [{ startDate: sortOrder }, { createdAt: 'desc' }];
    case 'status':
      return [{ status: sortOrder }, { createdAt: 'desc' }];
    default:
      return [{ createdAt: sortOrder }];
  }
}

export async function cancelEmployeeLeaveRequestByEmployee(
  params: {
    requestId: string;
    employeeId: string;
  },
  tx: TxLike = prisma
) {
  const request = await (tx as TxLike).employeeLeaveRequest.findUnique({
    where: { id: params.requestId },
  });

  if (!request || request.employeeId !== params.employeeId) {
    throw new Error('Leave request not found');
  }

  if (request.status !== 'pending') {
    throw new Error('Only pending leave requests can be cancelled');
  }

  const updated = await (tx as TxLike).employeeLeaveRequest.update({
    where: { id: request.id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
    },
  });

  await tx.changelog.create({
    data: {
      action: 'UPDATE',
      entityType: 'EmployeeLeaveRequest',
      entityId: updated.id,
      actor: 'system',
      details: {
        employeeId: updated.employeeId,
        status: 'cancelled',
      },
    },
  });

  return updated;
}

export async function approveEmployeeLeaveRequest(params: {
  requestId: string;
  adminId: string;
  adminNote?: string | null;
}) {
  const now = new Date();

  const result = await prisma.$transaction(async trx => {
    const request = await trx.employeeLeaveRequest.findUnique({
      where: { id: params.requestId },
      include: {
        employee: {
          select: {
            id: true,
            role: true,
          },
        },
      },
    });

    if (!request) {
      throw new Error('Leave request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('Only pending leave requests can be approved');
    }

    const updated = await trx.employeeLeaveRequest.update({
      where: { id: request.id },
      data: {
        status: 'approved',
        reviewedById: params.adminId,
        reviewedAt: now,
        adminNote: params.adminNote ?? null,
      },
    });

    const startDateKey = dateToDateKey(updated.startDate);
    const endDateKey = dateToDateKey(updated.endDate);
    const dateKeys = listDateKeysInclusive(startDateKey, endDateKey);

    let affectedOfficeOverrideCount = 0;
    let affectedOnsiteShiftCount = 0;

    if (request.employee.role === 'office') {
      for (const dateKey of dateKeys) {
        await upsertEmployeeOfficeDayOverride(
          {
            employeeId: request.employee.id,
            date: dateKey,
            overrideType: 'off',
            note: `Leave approved (${updated.id})`,
            adminId: params.adminId,
          },
          trx
        );
      }
      affectedOfficeOverrideCount = dateKeys.length;
    }

    if (request.employee.role === 'on_site') {
      const cancelled = await trx.shift.updateMany({
        where: {
          employeeId: request.employee.id,
          status: 'scheduled',
          deletedAt: null,
          startsAt: { gte: now },
          date: {
            gte: dateKeyToDate(startDateKey),
            lte: dateKeyToDate(endDateKey),
          },
        },
        data: {
          status: 'cancelled',
          lastUpdatedById: params.adminId,
          note: `Cancelled due to approved leave request ${updated.id}`,
        },
      });
      affectedOnsiteShiftCount = cancelled.count;
    }

    await trx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'EmployeeLeaveRequest',
        entityId: updated.id,
        actor: 'admin',
        actorId: params.adminId,
        details: {
          employeeId: updated.employeeId,
          status: 'approved',
          reason: updated.reason,
          employeeNote: updated.employeeNote,
          adminNote: updated.adminNote,
          attachments: updated.attachments,
          affectedOfficeOverrideCount,
          affectedOnsiteShiftCount,
        },
      },
    });

    return { updated, affectedOnsiteShiftCount };
  });

  if (result.affectedOnsiteShiftCount > 0) {
    await redis.publish(
      'events:shifts',
      JSON.stringify({ type: 'SHIFT_UPDATED_FROM_LEAVE', leaveRequestId: params.requestId })
    );
  }

  return result.updated;
}

export async function rejectEmployeeLeaveRequest(
  params: {
    requestId: string;
    adminId: string;
    adminNote?: string | null;
  },
  tx: TxLike = prisma
) {
  const request = await (tx as TxLike).employeeLeaveRequest.findUnique({
    where: { id: params.requestId },
  });

  if (!request) {
    throw new Error('Leave request not found');
  }

  if (request.status !== 'pending') {
    throw new Error('Only pending leave requests can be rejected');
  }

  const updated = await (tx as TxLike).employeeLeaveRequest.update({
    where: { id: request.id },
      data: {
        status: 'rejected',
        reviewedById: params.adminId,
        reviewedAt: new Date(),
        adminNote: params.adminNote ?? null,
      },
  });

  await tx.changelog.create({
    data: {
      action: 'UPDATE',
      entityType: 'EmployeeLeaveRequest',
      entityId: updated.id,
      actor: 'admin',
      actorId: params.adminId,
      details: {
        employeeId: updated.employeeId,
        status: 'rejected',
        reason: updated.reason,
        employeeNote: updated.employeeNote,
        adminNote: updated.adminNote,
        attachments: updated.attachments,
      },
    },
  });

  return updated;
}
