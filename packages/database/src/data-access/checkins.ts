import { db as prisma } from "../client";
import { Prisma, CheckInStatus } from '@prisma/client';

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

    return checkin;
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
