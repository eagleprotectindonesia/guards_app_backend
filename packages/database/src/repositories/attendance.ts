import { db as prisma } from '../prisma/client';
import { Prisma, AttendanceStatus, AlertReason } from '@prisma/client';
import { autoResolveAlert } from './alerts';

export async function getAttendanceByShiftId(shiftId: string) {
  return prisma.attendance.findUnique({
    where: { shiftId },
    include: {
      employee: {
        select: {
          fullName: true,
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
  picture?: string;
  metadata?: any;
  updateShiftStatus?: boolean;
}) {
  const { shiftId, employeeId, guardId, status, picture, metadata, updateShiftStatus } = params;
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
        picture,
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

    // Auto-resolve missed attendance alerts
    const resolvedAlert = await autoResolveAlert({
      shiftId,
      reason: AlertReason.missed_attendance,
      tx,
    });

    return { attendance, resolvedAlert };
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
    const attendances = await tx.attendance.findMany({
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
    });
    const totalCount = await tx.attendance.count({ where });
    return [attendances, totalCount] as const;
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
          shiftType: true,
          lastUpdatedBy: {
            select: {
              name: true,
            },
          },
          checkins: {
            select: {
              at: true,
              metadata: true,
            },
          },
        },
      },
      employee: true,
    },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });
}

export async function getLatestGuardShiftEditChangelogs(shiftIds: string[]) {
  if (shiftIds.length === 0) {
    return [];
  }

  return prisma.changelog.findMany({
    where: {
      entityType: 'Shift',
      action: {
        in: ['UPDATE'],
      },
      entityId: {
        in: shiftIds,
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      admin: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function getEmployeeOnsiteDayOffChangelogsForDates(params: { employeeIds: string[]; dateKeys: string[] }) {
  const { employeeIds, dateKeys } = params;
  if (employeeIds.length === 0 || dateKeys.length === 0) {
    return [];
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM changelogs
    WHERE entity_type = 'EmployeeOnsiteDayOff'
      AND details->>'employeeId' IN (${Prisma.join(employeeIds)})
      AND details->>'date' IN (${Prisma.join(dateKeys)})
    ORDER BY created_at ASC, id ASC
  `);

  if (rows.length === 0) {
    return [];
  }

  return prisma.changelog.findMany({
    where: {
      id: {
        in: rows.map(row => row.id),
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      admin: {
        select: {
          name: true,
        },
      },
    },
  });
}
