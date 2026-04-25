import { AdminNotificationType, Prisma } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { getAllActiveAdminOwnershipAssignments, normalizeDepartmentScopeKey } from './admin-ownership';

type TxLike = Prisma.TransactionClient | typeof prisma;

type LeaveRecipientEmployeeScope = {
  department: string | null;
  officeId: string | null;
};

type ActiveOwnershipAssignment = {
  id: string;
  adminId: string;
  departmentKey: string | null;
  officeId: string | null;
  priority: number;
  createdAt: Date;
};

function getAssignmentSpecificity(assignment: Pick<ActiveOwnershipAssignment, 'departmentKey' | 'officeId'>) {
  let score = 0;
  if (assignment.departmentKey) score += 1;
  if (assignment.officeId) score += 1;
  return score;
}

function compareOwnershipAssignments(a: ActiveOwnershipAssignment, b: ActiveOwnershipAssignment) {
  const priorityDiff = a.priority - b.priority;
  if (priorityDiff !== 0) return priorityDiff;

  const specificityDiff = getAssignmentSpecificity(b) - getAssignmentSpecificity(a);
  if (specificityDiff !== 0) return specificityDiff;

  const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
  if (createdAtDiff !== 0) return createdAtDiff;

  const adminIdDiff = a.adminId.localeCompare(b.adminId);
  if (adminIdDiff !== 0) return adminIdDiff;

  return a.id.localeCompare(b.id);
}

function doesAssignmentMatchEmployee(
  assignment: Pick<ActiveOwnershipAssignment, 'departmentKey' | 'officeId'>,
  employee: LeaveRecipientEmployeeScope
) {
  if (assignment.departmentKey) {
    const employeeDepartmentKey = normalizeDepartmentScopeKey(employee.department);
    if (!employeeDepartmentKey || employeeDepartmentKey !== assignment.departmentKey) {
      return false;
    }
  }

  if (assignment.officeId && assignment.officeId !== employee.officeId) {
    return false;
  }

  return true;
}

function resolveEmployeeOwnerAdminId(
  assignments: ActiveOwnershipAssignment[],
  employee: LeaveRecipientEmployeeScope
): string | null {
  const sortedAssignments = [...assignments].sort(compareOwnershipAssignments);
  for (const assignment of sortedAssignments) {
    if (doesAssignmentMatchEmployee(assignment, employee)) {
      return assignment.adminId;
    }
  }
  return null;
}

export async function resolveAdminRecipientsForLeaveRequestCreated(employeeId: string, tx: TxLike = prisma) {
  const targetTx = tx as TxLike;

  const [employee, assignmentsRaw, fallbackAdmins] = await Promise.all([
    targetTx.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        department: true,
        officeId: true,
      },
    }),
    getAllActiveAdminOwnershipAssignments('leave'),
    targetTx.admin.findMany({
      where: {
        deletedAt: null,
        includeFallbackLeaveQueue: true,
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!employee) {
    return [];
  }

  const assignments: ActiveOwnershipAssignment[] = assignmentsRaw.map(assignment => ({
    id: assignment.id,
    adminId: assignment.adminId,
    departmentKey: assignment.departmentKey,
    officeId: assignment.officeId,
    priority: assignment.priority,
    createdAt: assignment.createdAt,
  }));

  const ownerAdminId = resolveEmployeeOwnerAdminId(assignments, {
    department: employee.department,
    officeId: employee.officeId,
  });

  if (ownerAdminId) {
    return [ownerAdminId];
  }

  return fallbackAdmins.map(admin => admin.id);
}

export async function createAdminNotifications(
  input: {
    adminIds: string[];
    type: AdminNotificationType;
    title: string;
    body: string;
    payload?: Prisma.InputJsonValue;
  },
  tx: TxLike = prisma
) {
  const uniqueAdminIds = Array.from(new Set(input.adminIds));
  if (uniqueAdminIds.length === 0) {
    return [];
  }

  const targetTx = tx as TxLike;
  return Promise.all(
    uniqueAdminIds.map(adminId =>
      targetTx.adminNotification.create({
        data: {
          adminId,
          type: input.type,
          title: input.title,
          body: input.body,
          payload: input.payload,
        },
      })
    )
  );
}

export async function createLeaveRequestCreatedAdminNotifications(
  input: {
    leaveRequestId: string;
    employeeId: string;
    startDate: Date;
    endDate: Date;
    reason: string;
  },
  tx: TxLike = prisma
) {
  const targetTx = tx as TxLike;

  const [employee, recipientAdminIds] = await Promise.all([
    targetTx.employee.findUnique({
      where: { id: input.employeeId },
      select: {
        fullName: true,
        employeeNumber: true,
      },
    }),
    resolveAdminRecipientsForLeaveRequestCreated(input.employeeId, targetTx),
  ]);

  if (!employee || recipientAdminIds.length === 0) {
    return [];
  }

  const dateRangeLabel = `${input.startDate.toISOString().slice(0, 10)} to ${input.endDate.toISOString().slice(0, 10)}`;
  const employeeLabel = employee.employeeNumber ? `${employee.fullName} (${employee.employeeNumber})` : employee.fullName;

  return createAdminNotifications(
    {
      adminIds: recipientAdminIds,
      type: 'leave_request_created',
      title: 'New leave request submitted',
      body: `${employeeLabel} requested leave for ${dateRangeLabel}.`,
      payload: {
        leaveRequestId: input.leaveRequestId,
        employeeId: input.employeeId,
        reason: input.reason,
        startDate: input.startDate.toISOString().slice(0, 10),
        endDate: input.endDate.toISOString().slice(0, 10),
        targetPath: '/admin/leave-requests',
      },
    },
    targetTx
  );
}

export async function listRecentAdminNotifications(adminId: string, limit = 20, tx: TxLike = prisma) {
  return (tx as TxLike).adminNotification.findMany({
    where: { adminId },
    orderBy: [{ createdAt: 'desc' }],
    take: Math.max(1, Math.min(limit, 100)),
  });
}

export async function countUnreadAdminNotifications(adminId: string, tx: TxLike = prisma) {
  return (tx as TxLike).adminNotification.count({
    where: {
      adminId,
      readAt: null,
    },
  });
}

export async function markAdminNotificationsAsRead(adminId: string, notificationIds?: string[], tx: TxLike = prisma) {
  const ids = notificationIds && notificationIds.length > 0 ? Array.from(new Set(notificationIds)) : null;
  return (tx as TxLike).adminNotification.updateMany({
    where: {
      adminId,
      readAt: null,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: {
      readAt: new Date(),
    },
  });
}
