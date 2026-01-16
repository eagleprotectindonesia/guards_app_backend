import { db as prisma } from "../client";
import { Prisma, AttendanceStatus } from '@prisma/client';

export async function getOfficeAttendanceById(id: string) {
  return prisma.officeAttendance.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          employeeCode: true,
        },
      },
      office: {
        select: {
          name: true,
          address: true,
        },
      },
    },
  });
}

export async function recordOfficeAttendance(params: {
  officeId: string;
  employeeId: string;
  status: AttendanceStatus;
  picture?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}) {
  const { officeId, employeeId, status, picture, metadata } = params;

  return prisma.officeAttendance.create({
    data: {
      officeId,
      employeeId,
      recordedAt: new Date(),
      status,
      picture,
      metadata,
    },
  });
}

export async function getTodayOfficeAttendance(employeeId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  return prisma.officeAttendance.findMany({
    where: {
      employeeId,
      recordedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      office: true,
    },
    orderBy: {
      recordedAt: 'desc',
    },
  });
}

export async function getPaginatedOfficeAttendance(params: {
  where: Prisma.OfficeAttendanceWhereInput;
  orderBy: Prisma.OfficeAttendanceOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;

  const [attendances, totalCount] = await prisma.$transaction(async tx => {
    return Promise.all([
      tx.officeAttendance.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          employee: true,
          office: true,
        },
      }),
      tx.officeAttendance.count({ where }),
    ]);
  });

  return { attendances, totalCount };
}

export async function getOfficeAttendanceExportBatch(params: {
  where: Prisma.OfficeAttendanceWhereInput;
  take: number;
  cursor?: string;
}) {
  const { where, take, cursor } = params;
  return prisma.officeAttendance.findMany({
    take,
    where,
    orderBy: { id: 'asc' },
    include: {
      office: true,
      employee: true,
    },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });
}
