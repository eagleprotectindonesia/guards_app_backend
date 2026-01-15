import { db as prisma } from "../client";
import { Prisma, AttendanceStatus } from '@prisma/client';

export async function getAttendanceByShiftId(shiftId: string) {
  return prisma.attendance.findUnique({
    where: { shiftId },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
  });
}

/** @deprecated Use getAttendanceByShiftId and access employee relation */
export const getAttendanceByShiftIdWithGuard = getAttendanceByShiftId;

export async function recordAttendance(params: {
  shiftId: string;
  employeeId?: string;
  // Backward compatibility
  guardId?: string;
  status: AttendanceStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
  updateShiftStatus?: boolean;
}) {
  const { shiftId, employeeId, guardId, status, metadata, updateShiftStatus } = params;
  const targetEmployeeId = employeeId || guardId;

  if (!targetEmployeeId) {
    throw new Error('employeeId or guardId is required');
  }

  return prisma.$transaction(async tx => {
    const attendance = await tx.attendance.create({
      data: {
        shiftId,
        employeeId: targetEmployeeId,
        recordedAt: new Date(),
        status,
        metadata,
      },
    });

    await tx.shift.update({
      where: { id: shiftId },
      data: {
        ...(updateShiftStatus && { status: 'in_progress' }),
        attendance: {
          connect: { id: attendance.id },
        },
      },
    });

    return attendance;
  });
}

export async function getPaginatedAttendance(params: {
  where: Prisma.AttendanceWhereInput;
  orderBy: Prisma.AttendanceOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;

  const [attendances, totalCount] = await prisma.$transaction(async tx => {
    return Promise.all([
      tx.attendance.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          employee: true,
          shift: {
            include: {
              site: true,
              shiftType: true,
            },
          },
        },
      }),
      tx.attendance.count({ where }),
    ]);
  });

  return { attendances, totalCount };
}

export async function getAttendanceExportBatch(params: {
  where: Prisma.AttendanceWhereInput;
  take: number;
  cursor?: string;
}) {
  const { where, take, cursor } = params;
  return prisma.attendance.findMany({
    take,
    where,
    orderBy: { id: 'asc' },
    include: {
      shift: {
        include: {
          employee: true,
          site: true,
        },
      },
      employee: true,
    },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });
}
