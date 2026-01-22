import { db as prisma } from "../client";
import { Prisma, CheckInStatus, AlertReason } from '@prisma/client';
import { autoResolveAlert } from "./alerts";

export async function getCheckinsByShiftId(shiftId: string) {
  return prisma.checkin.findMany({
    where: { shiftId },
    orderBy: { at: 'desc' },
  });
}

export async function recordCheckin(params: {
  shiftId: string;
  employeeId?: string;
  // Backward compatibility
  guardId?: string;
  status: CheckInStatus;
  source?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
  now: Date;
  shiftUpdateData: {
    status?: 'in_progress' | 'completed';
    missedCount?: number;
    checkInStatus: CheckInStatus;
  };
}) {
  const { shiftId, employeeId, guardId, status, source, metadata, now, shiftUpdateData } = params;
  const targetEmployeeId = employeeId || guardId;

  if (!targetEmployeeId) {
    throw new Error('employeeId or guardId is required');
  }

  return prisma.$transaction(async tx => {
    const checkin = await tx.checkin.create({
      data: {
        shiftId,
        employeeId: targetEmployeeId,
        status,
        source: source || 'api',
        metadata,
        at: now,
      },
    });

    await tx.shift.update({
      where: { id: shiftId },
      data: {
        ...shiftUpdateData,
        lastHeartbeatAt: now,
      },
    });

    // Auto-resolve missed check-in alerts
    const resolvedAlert = await autoResolveAlert({
      shiftId,
      reason: AlertReason.missed_checkin,
      tx,
    });

    return { checkin, resolvedAlert };
  });
}

export async function recordBulkCheckins(params: {
  shiftId: string;
  employeeId: string;
  checkins: {
    at: Date;
    status: CheckInStatus;
    metadata?: any;
    source?: string;
  }[];
  shiftUpdateData: {
    status?: 'in_progress' | 'completed';
    missedCount?: number;
    checkInStatus: CheckInStatus;
  };
}) {
  const { shiftId, employeeId, checkins, shiftUpdateData } = params;

  if (checkins.length === 0) {
    throw new Error('No checkins provided');
  }

  // Sort checkins by time to ensure lastHeartbeatAt is the latest
  const sortedCheckins = [...checkins].sort((a, b) => a.at.getTime() - b.at.getTime());
  const latestCheckinAt = sortedCheckins[sortedCheckins.length - 1].at;

  return prisma.$transaction(async tx => {
    // Create all checkin records
    await tx.checkin.createMany({
      data: sortedCheckins.map(c => ({
        shiftId,
        employeeId,
        at: c.at,
        status: c.status,
        source: c.source || 'api',
        metadata: c.metadata,
      })),
    });

    // Update shift status and last heartbeat
    await tx.shift.update({
      where: { id: shiftId },
      data: {
        ...shiftUpdateData,
        lastHeartbeatAt: latestCheckinAt,
      },
    });

    // Find all missed check-in alerts for this shift that are not yet resolved
    const alertsToResolve = await tx.alert.findMany({
      where: {
        shiftId,
        reason: AlertReason.missed_checkin,
        resolvedAt: null,
      },
      include: {
        site: true,
        resolverAdmin: true,
        ackAdmin: true,
        shift: {
          include: {
            employee: true,
            shiftType: true,
          },
        },
      },
    });

    if (alertsToResolve.length > 0) {
      const now = new Date();
      await tx.alert.updateMany({
        where: {
          id: { in: alertsToResolve.map(a => a.id) },
        },
        data: {
          resolvedAt: now,
          resolutionType: 'auto',
          resolutionNote: 'Auto-resolved by bulk check-in',
        },
      });

      // Update the objects in memory to reflect the resolution for the response
      alertsToResolve.forEach(a => {
        a.resolvedAt = now;
        a.resolutionType = 'auto';
        a.resolutionNote = 'Auto-resolved by bulk check-in';
      });
    }

    return { count: checkins.length, resolvedAlerts: alertsToResolve };
  });
}

export async function getPaginatedCheckins(params: {
  where: Prisma.CheckinWhereInput;
  orderBy: Prisma.CheckinOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;

  const [checkins, totalCount] = await prisma.$transaction(async tx => {
    return Promise.all([
      tx.checkin.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          employee: true,
          shift: {
            include: {
              site: true,
            },
          },
        },
      }),
      tx.checkin.count({ where }),
    ]);
  });

  return { checkins, totalCount };
}

export async function getCheckinExportBatch(params: {
  where: Prisma.CheckinWhereInput;
  take: number;
  cursor?: string;
}) {
  const { where, take, cursor } = params;
  return prisma.checkin.findMany({
    take,
    where,
    orderBy: { id: 'asc' },
    include: {
      employee: true,
      shift: {
        include: {
          site: true,
        },
      },
    },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });
}
