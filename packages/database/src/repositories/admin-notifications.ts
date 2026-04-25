import { AdminNotificationType, Prisma } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { getAllActiveAdminOwnershipAssignments, getMatchingAdminIdsForEmployeeScope } from './admin-ownership';

type TxLike = Prisma.TransactionClient | typeof prisma;

type LeaveRecipientEmployeeScope = {
  department: string | null;
  officeId: string | null;
};

type ActiveOwnershipAssignment = {
  adminId: string;
  departmentKey: string | null;
  officeId: string | null;
};

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
    adminId: assignment.adminId,
    departmentKey: assignment.departmentKey,
    officeId: assignment.officeId,
  }));

  const matchingAdminIds = getMatchingAdminIdsForEmployeeScope(assignments, {
    department: employee.department,
    officeId: employee.officeId,
  });

  if (matchingAdminIds.length > 0) {
    return matchingAdminIds;
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
