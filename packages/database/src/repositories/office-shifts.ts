import { Prisma, ShiftStatus } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';

type TxLike = Prisma.TransactionClient | typeof prisma;

function getOfficeShiftWindowQuery(at: Date) {
  const businessDay = getBusinessDayRange(at, BUSINESS_TIMEZONE);

  return {
    businessDay,
    where: {
      deletedAt: null,
      startsAt: {
        lt: businessDay.end,
      },
      endsAt: {
        gt: businessDay.start,
      },
      status: {
        not: 'cancelled' as ShiftStatus,
      },
    },
  };
}

function getMinutesSinceMidnight(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? '0');

  return hour * 60 + minute;
}

export async function findRelevantOfficeShiftForEmployee(employeeId: string, at = new Date()) {
  const { businessDay, where } = getOfficeShiftWindowQuery(at);

  const shifts = await prisma.officeShift.findMany({
    where: {
      employeeId,
      ...where,
    },
    include: {
      officeShiftType: true,
    },
    orderBy: {
      startsAt: 'asc',
    },
  });

  const activeShift =
    shifts.find(shift => shift.startsAt.getTime() <= at.getTime() && shift.endsAt.getTime() >= at.getTime()) ?? null;
  if (activeShift) {
    return { shift: activeShift, businessDay };
  }

  const upcomingShift = shifts.find(shift => shift.startsAt.getTime() > at.getTime()) ?? null;
  if (upcomingShift) {
    return { shift: upcomingShift, businessDay };
  }

  const pastShift = [...shifts].reverse().find(shift => shift.endsAt.getTime() <= at.getTime()) ?? null;
  return { shift: pastShift, businessDay };
}

export async function getOfficeShiftById(id: string, include?: Prisma.OfficeShiftInclude) {
  return prisma.officeShift.findUnique({
    where: { id, deletedAt: null },
    include:
      include || {
        officeShiftType: true,
        employee: { include: { office: { select: { name: true } } } },
        createdBy: { select: { name: true } },
        lastUpdatedBy: { select: { name: true } },
      },
  });
}

export async function getPaginatedOfficeShifts(params: {
  where: Prisma.OfficeShiftWhereInput;
  orderBy: Prisma.OfficeShiftOrderByWithRelationInput;
  skip: number;
  take: number;
  include?: Prisma.OfficeShiftInclude;
}) {
  const { where, orderBy, skip, take, include } = params;
  const finalWhere = { ...where, deletedAt: null };

  const [officeShifts, totalCount] = await prisma.$transaction(async tx => {
    return Promise.all([
      tx.officeShift.findMany({
        where: finalWhere,
        orderBy,
        skip,
        take,
        include:
          include || {
            officeShiftType: true,
            employee: { include: { office: { select: { name: true } } } },
            officeAttendances: true,
            createdBy: { select: { name: true } },
            lastUpdatedBy: { select: { name: true } },
          },
      }),
      tx.officeShift.count({ where: finalWhere }),
    ]);
  });

  return { officeShifts, totalCount };
}

export async function resolveOfficeShiftContextForEmployee(employeeId: string, at = new Date()) {
  const { shift, businessDay } = await findRelevantOfficeShiftForEmployee(employeeId, at);

  if (!shift) {
    return {
      source: 'office_shift' as const,
      mode: 'shift_based' as const,
      shift: null,
      businessDay,
      startMinutes: null,
      endMinutes: null,
      windowStart: null,
      windowEnd: null,
      isWorkingDay: false,
      isLate: false,
      isAfterEnd: false,
    };
  }

  return {
    source: 'office_shift' as const,
    mode: 'shift_based' as const,
    shift,
    businessDay,
    startMinutes: getMinutesSinceMidnight(shift.startsAt, BUSINESS_TIMEZONE),
    endMinutes: getMinutesSinceMidnight(shift.endsAt, BUSINESS_TIMEZONE),
    windowStart: shift.startsAt,
    windowEnd: shift.endsAt,
    isWorkingDay: true,
    isLate: at.getTime() > shift.startsAt.getTime(),
    isAfterEnd: at.getTime() > shift.endsAt.getTime(),
  };
}

export async function getScheduledPaidMinutesForOfficeShiftAttendance(employeeId: string, at = new Date()) {
  const context = await resolveOfficeShiftContextForEmployee(employeeId, at);

  if (!context.shift || !context.windowStart || !context.windowEnd) {
    return 0;
  }

  return Math.max(0, Math.floor((context.windowEnd.getTime() - context.windowStart.getTime()) / 60_000));
}

export async function checkOverlappingOfficeShift(params: {
  employeeId: string;
  startsAt: Date;
  endsAt: Date;
  excludeOfficeShiftId?: string;
}) {
  const { employeeId, startsAt, endsAt, excludeOfficeShiftId } = params;

  return prisma.officeShift.findFirst({
    where: {
      employeeId,
      deletedAt: null,
      id: excludeOfficeShiftId ? { not: excludeOfficeShiftId } : undefined,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
}

export async function createOfficeShiftWithChangelog(data: Prisma.OfficeShiftCreateInput, adminId: string) {
  return prisma.$transaction(async tx => {
    const created = await tx.officeShift.create({
      data: {
        ...data,
        createdBy: { connect: { id: adminId } },
        lastUpdatedBy: { connect: { id: adminId } },
      },
      include: {
        officeShiftType: true,
        employee: { include: { office: { select: { name: true } } } },
      },
    });

    await tx.changelog.create({
      data: {
        action: 'CREATE',
        entityType: 'OfficeShift',
        entityId: created.id,
        actor: 'admin',
        actorId: adminId,
        details: {
          officeShiftTypeName: created.officeShiftType.name,
          employeeName: created.employee.fullName,
          date: created.date,
          startsAt: created.startsAt,
          endsAt: created.endsAt,
          status: created.status,
          note: created.note,
          officeShiftTypeId: created.officeShiftTypeId,
          employeeId: created.employeeId,
        },
      },
    });

    return created;
  });
}

export async function updateOfficeShiftWithChangelog(
  id: string,
  data: Prisma.OfficeShiftUpdateInput,
  adminId: string
) {
  return prisma.$transaction(async tx => {
    const before = await tx.officeShift.findUnique({
      where: { id, deletedAt: null },
      include: {
        officeShiftType: true,
        employee: true,
      },
    });

    if (!before) {
      throw new Error('Office Shift not found');
    }

    const updated = await tx.officeShift.update({
      where: { id },
      data: {
        ...data,
        lastUpdatedBy: { connect: { id: adminId } },
      },
      include: {
        officeShiftType: true,
        employee: true,
      },
    });

    const changes: Record<string, { from: Prisma.InputJsonValue; to: Prisma.InputJsonValue }> = {};
    const fieldsToTrack = ['officeShiftTypeId', 'employeeId', 'date', 'startsAt', 'endsAt', 'status', 'note'] as const;
    for (const field of fieldsToTrack) {
      const oldValue = before[field];
      const newValue = updated[field];
      if (oldValue instanceof Date && newValue instanceof Date) {
        if (oldValue.getTime() !== newValue.getTime()) {
          changes[field] = {
            from: oldValue.toISOString() as Prisma.InputJsonValue,
            to: newValue.toISOString() as Prisma.InputJsonValue,
          };
        }
      } else if (oldValue !== newValue) {
        changes[field] = {
          from: (oldValue ?? null) as Prisma.InputJsonValue,
          to: (newValue ?? null) as Prisma.InputJsonValue,
        };
      }
    }

    if (before.officeShiftType.name !== updated.officeShiftType.name) {
      changes.officeShiftTypeName = {
        from: before.officeShiftType.name as Prisma.InputJsonValue,
        to: updated.officeShiftType.name as Prisma.InputJsonValue,
      };
    }

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'OfficeShift',
        entityId: updated.id,
        actor: 'admin',
        actorId: adminId,
        details: {
          officeShiftTypeName: updated.officeShiftType.name,
          employeeName: updated.employee.fullName,
          date: updated.date,
          startsAt: updated.startsAt,
          endsAt: updated.endsAt,
          status: updated.status,
          note: updated.note,
          officeShiftTypeId: updated.officeShiftTypeId,
          employeeId: updated.employeeId,
          changes: Object.keys(changes).length > 0 ? changes : undefined,
        },
      },
    });

    return updated;
  });
}

export async function deleteOfficeShiftWithChangelog(id: string, adminId: string) {
  return prisma.$transaction(async tx => {
    const officeShift = await tx.officeShift.findUnique({
      where: { id, deletedAt: null },
      include: {
        officeShiftType: true,
        employee: true,
      },
    });

    if (!officeShift) {
      throw new Error('Office Shift not found');
    }

    await tx.officeShift.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'cancelled',
        lastUpdatedBy: { connect: { id: adminId } },
      },
    });

    await tx.changelog.create({
      data: {
        action: 'DELETE',
        entityType: 'OfficeShift',
        entityId: id,
        actor: 'admin',
        actorId: adminId,
        details: {
          officeShiftTypeName: officeShift.officeShiftType.name,
          employeeName: officeShift.employee.fullName,
          date: officeShift.date,
          startsAt: officeShift.startsAt,
          endsAt: officeShift.endsAt,
          note: officeShift.note,
          deletedAt: new Date(),
        },
      },
    });
  });
}

export async function bulkCreateOfficeShiftsWithChangelog(
  officeShiftsToCreate: Prisma.OfficeShiftCreateManyInput[],
  adminId: string
) {
  return prisma.$transaction(async tx => {
    const results = await tx.officeShift.createManyAndReturn({
      data: officeShiftsToCreate.map(shift => ({
        ...shift,
        createdById: adminId,
        lastUpdatedById: adminId,
      })),
      include: {
        officeShiftType: { select: { name: true } },
        employee: { select: { fullName: true } },
      },
    });

    await tx.changelog.createMany({
      data: results.map(shift => ({
        action: 'CREATE',
        entityType: 'OfficeShift',
        entityId: shift.id,
        actor: 'admin',
        actorId: adminId,
        details: {
          officeShiftTypeName: shift.officeShiftType.name,
          employeeName: shift.employee.fullName,
          date: shift.date,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          status: shift.status,
          note: shift.note,
          officeShiftTypeId: shift.officeShiftTypeId,
          employeeId: shift.employeeId,
        },
      })),
    });

    return results;
  });
}

export async function deleteFutureOfficeShiftsByEmployee(employeeId: string, tx: TxLike) {
  const now = new Date();
  const futureShifts = await tx.officeShift.findMany({
    where: {
      employeeId,
      deletedAt: null,
      startsAt: {
        gte: now,
      },
    },
    select: {
      id: true,
    },
  });

  if (futureShifts.length === 0) return 0;

  const shiftIds = futureShifts.map(shift => shift.id);
  await tx.officeShift.updateMany({
    where: {
      id: {
        in: shiftIds,
      },
    },
    data: {
      deletedAt: now,
      status: 'cancelled',
    },
  });

  await tx.changelog.create({
    data: {
      action: 'BULK_DELETE',
      entityType: 'OfficeShift',
      entityId: `employee:${employeeId}`,
      actor: 'system',
      details: {
        reason: 'OFFICE_ATTENDANCE_MODE_CHANGE',
        count: shiftIds.length,
        officeShiftIds: shiftIds,
      },
    },
  });

  return shiftIds.length;
}
