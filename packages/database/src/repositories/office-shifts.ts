import { formatDateKeyInTimeZone } from '@repo/shared';
import { Prisma, ShiftStatus } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { redis } from '../redis/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange, OFFICE_PAID_BREAK_MINUTES } from './office-work-schedules';
import {
  deleteEmployeeOfficeDayOverridesByEmployeeAndDates,
  upsertEmployeeOfficeDayOverride,
} from './office-day-overrides';
import { reconcileApprovedOfficeLeavesForCoverage } from './office-leave-reconciliation';
import { logHrActivity } from './hr-activities';

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

export async function findRelevantOfficeShiftForEmployee(
  employeeId: string,
  at = new Date(),
  options?: {
    allowedDateKeys?: Set<string>;
  }
) {
  const { businessDay, where } = getOfficeShiftWindowQuery(at);

  const shifts = await prisma.officeShift.findMany({
    where: {
      employeeId,
      ...where,
    },
    include: {
      officeShiftType: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      startsAt: 'asc',
    },
  });
  const allowedDateKeys = options?.allowedDateKeys;
  const relevantShifts = allowedDateKeys
    ? shifts.filter(shift => allowedDateKeys.has(formatDateKeyInTimeZone(shift.date, BUSINESS_TIMEZONE)))
    : shifts;

  const activeShift =
    relevantShifts.find(shift => shift.startsAt.getTime() <= at.getTime() && shift.endsAt.getTime() >= at.getTime()) ??
    null;
  if (activeShift) {
    return { shift: activeShift, businessDay };
  }

  const upcomingShift = relevantShifts.find(shift => shift.startsAt.getTime() > at.getTime()) ?? null;
  if (upcomingShift) {
    return { shift: upcomingShift, businessDay };
  }

  return { shift: null, businessDay };
}

export async function getOfficeShiftById(id: string, include?: Prisma.OfficeShiftInclude) {
  return prisma.officeShift.findUnique({
    where: { id, deletedAt: null },
    include: include || {
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
    const officeShifts = await tx.officeShift.findMany({
      where: finalWhere,
      orderBy,
      skip,
      take,
      include: include || {
        officeShiftType: true,
        employee: { include: { office: { select: { name: true } } } },
        officeAttendances: true,
        createdBy: { select: { name: true } },
        lastUpdatedBy: { select: { name: true } },
      },
    });
    const totalCount = await tx.officeShift.count({ where: finalWhere });
    return [officeShifts, totalCount] as const;
  });

  return { officeShifts, totalCount };
}

export async function resolveOfficeShiftContextForEmployee(
  employeeId: string,
  at = new Date(),
  options?: {
    allowedDateKeys?: Set<string>;
  }
) {
  const { shift, businessDay } = await findRelevantOfficeShiftForEmployee(employeeId, at, options);

  if (!shift) {
    return {
      source: 'office_shift' as const,
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

  const shiftBusinessDay = getBusinessDayRange(shift.startsAt, BUSINESS_TIMEZONE);

  return {
    source: 'office_shift' as const,
    shift,
    businessDay: shiftBusinessDay,
    startMinutes: getMinutesSinceMidnight(shift.startsAt, BUSINESS_TIMEZONE),
    endMinutes: getMinutesSinceMidnight(shift.endsAt, BUSINESS_TIMEZONE),
    windowStart: shift.startsAt,
    windowEnd: shift.endsAt,
    isWorkingDay: true,
    isLate: at.getTime() > shift.startsAt.getTime(),
    isAfterEnd: at.getTime() > shift.endsAt.getTime(),
  };
}

async function assertOfficeShiftAttendanceModeAllowed(
  client: TxLike,
  params: {
    employeeId?: string;
    attendanceMode?: 'office_required' | 'non_office' | null;
  }
) {
  const { employeeId, attendanceMode } = params;
  if (!employeeId || attendanceMode == null) return;

  const employee = await client.employee.findUnique({
    where: { id: employeeId, deletedAt: null },
    select: { officeId: true },
  });

  if (!employee?.officeId) {
    throw new Error('Shift attendance mode override can only be set for office employees with an assigned office.');
  }
}

function normalizeOfficeShiftAttendanceMode(
  value:
    | Prisma.OfficeShiftUpdateInput['attendanceMode']
    | Prisma.OfficeShiftCreateInput['attendanceMode']
    | 'office_required'
    | 'non_office'
    | null
    | undefined
): 'office_required' | 'non_office' | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'object' && 'set' in value) {
    return (value.set ?? null) as 'office_required' | 'non_office' | null;
  }
  return value as 'office_required' | 'non_office';
}

export async function getScheduledPaidMinutesForOfficeShiftAttendance(employeeId: string, at = new Date()) {
  const context = await resolveOfficeShiftContextForEmployee(employeeId, at);

  if (!context.shift || !context.windowStart || !context.windowEnd) {
    return 0;
  }

  const durationMinutes = Math.floor((context.windowEnd.getTime() - context.windowStart.getTime()) / 60_000);
  const breakMinutes = durationMinutes > 5 * 60 ? OFFICE_PAID_BREAK_MINUTES : 0;

  return Math.max(0, durationMinutes - breakMinutes);
}

export async function checkOverlappingOfficeShift(params: {
  employeeId: string;
  startsAt: Date;
  endsAt: Date;
  excludeOfficeShiftId?: string;
  excludeOfficeShiftIds?: string[];
}) {
  const { employeeId, startsAt, endsAt, excludeOfficeShiftId, excludeOfficeShiftIds } = params;

  const excluded: string[] = [];
  if (excludeOfficeShiftId) excluded.push(excludeOfficeShiftId);
  if (excludeOfficeShiftIds) excluded.push(...excludeOfficeShiftIds);

  return prisma.officeShift.findFirst({
    where: {
      employeeId,
      deletedAt: null,
      id: excluded.length > 0 ? { notIn: excluded } : undefined,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
}

export async function createOfficeShiftWithChangelog(
  data: Prisma.OfficeShiftCreateInput,
  adminId: string,
  tx?: Prisma.TransactionClient
) {
  const client: TxLike = tx ?? prisma;
  await assertOfficeShiftAttendanceModeAllowed(client, {
    employeeId: 'connect' in data.employee ? data.employee.connect?.id : undefined,
    attendanceMode: normalizeOfficeShiftAttendanceMode(data.attendanceMode) ?? null,
  });

  const created = await client.officeShift.create({
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

  await client.changelog.create({
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
        attendanceMode: created.attendanceMode,
        officeShiftTypeId: created.officeShiftTypeId,
        employeeId: created.employeeId,
      },
    },
  });

  // Log HR activity
  await logHrActivity({
    id: `office_shift:${created.id}`,
    type: 'office_shift_created',
    employeeName: created.employee.fullName,
    details: `Shift scheduled: ${created.officeShiftType.name} on ${new Date(created.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
  });

  return created;
}

export async function updateOfficeShiftWithChangelog(
  id: string,
  data: Prisma.OfficeShiftUpdateInput,
  adminId: string,
  tx?: Prisma.TransactionClient
) {
  const client: TxLike = tx ?? prisma;

  const before = await client.officeShift.findUnique({
    where: { id, deletedAt: null },
    include: {
      officeShiftType: true,
      employee: true,
    },
  });

  if (!before) {
    throw new Error('Office Shift not found');
  }

  const nextEmployeeId =
    data.employee && typeof data.employee === 'object' && 'connect' in data.employee
      ? data.employee.connect?.id
      : before.employeeId;
  const nextAttendanceMode =
    data.attendanceMode !== undefined ? normalizeOfficeShiftAttendanceMode(data.attendanceMode) : before.attendanceMode;

  await assertOfficeShiftAttendanceModeAllowed(client, {
    employeeId: nextEmployeeId,
    attendanceMode: nextAttendanceMode,
  });

  const updated = await client.officeShift.update({
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
  const fieldsToTrack = [
    'officeShiftTypeId',
    'employeeId',
    'date',
    'startsAt',
    'endsAt',
    'attendanceMode',
    'status',
    'note',
  ] as const;
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

  await client.changelog.create({
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
        attendanceMode: updated.attendanceMode,
        officeShiftTypeId: updated.officeShiftTypeId,
        employeeId: updated.employeeId,
        changes: Object.keys(changes).length > 0 ? changes : undefined,
      },
    },
  });

  return updated;
}

export async function deleteOfficeShiftWithChangelog(id: string, adminId: string, tx?: Prisma.TransactionClient) {
  const client: TxLike = tx ?? prisma;

  const officeShift = await client.officeShift.findUnique({
    where: { id, deletedAt: null },
    include: {
      officeShiftType: true,
      employee: true,
    },
  });

  if (!officeShift) {
    throw new Error('Office Shift not found');
  }

  const dateObj = new Date(officeShift.date.toISOString().slice(0, 10) + 'T00:00:00Z');

  await client.officeShift.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      status: 'cancelled',
      lastUpdatedBy: { connect: { id: adminId } },
    },
  });

  await deleteEmployeeOfficeDayOverridesByEmployeeAndDates(
    officeShift.employeeId,
    [dateObj.toISOString().slice(0, 10)],
    adminId,
    client,
    false,
    ['shift_override']
  );

  await client.changelog.create({
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
}

export async function bulkCreateOfficeShiftsWithChangelog(
  officeShiftsToCreate: Prisma.OfficeShiftCreateManyInput[],
  adminId: string,
  txLike?: TxLike
) {
  const execute = async (tx: TxLike) => {
    const employeeIdsNeedingValidation = Array.from(
      new Set(officeShiftsToCreate.filter(shift => shift.attendanceMode != null).map(shift => shift.employeeId))
    );

    if (employeeIdsNeedingValidation.length > 0) {
      const employees = await tx.employee.findMany({
        where: { id: { in: employeeIdsNeedingValidation }, deletedAt: null },
        select: { id: true, officeId: true },
      });
      const officeIdsByEmployee = new Map(employees.map(employee => [employee.id, employee.officeId]));

      for (const shift of officeShiftsToCreate) {
        if (shift.attendanceMode == null) continue;
        if (!officeIdsByEmployee.get(shift.employeeId)) {
          throw new Error(
            'Shift attendance mode override can only be set for office employees with an assigned office.'
          );
        }
      }
    }

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
          attendanceMode: shift.attendanceMode,
          officeShiftTypeId: shift.officeShiftTypeId,
          employeeId: shift.employeeId,
        },
      })),
    });

    // Log HR activities
    for (const shift of results) {
      await logHrActivity({
        id: `office_shift:${shift.id}`,
        type: 'office_shift_created',
        employeeName: shift.employee.fullName,
        details: `Shift scheduled: ${shift.officeShiftType.name} on ${new Date(shift.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      });
    }

    return results;
  };

  if (txLike) {
    return execute(txLike);
  }

  return prisma.$transaction(execute);
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

export async function deleteOfficeShiftsWithChangelog(ids: string[], adminId: string, tx?: Prisma.TransactionClient) {
  const client: TxLike = tx ?? prisma;

  const officeShifts = await client.officeShift.findMany({
    where: { id: { in: ids }, deletedAt: null },
    include: {
      officeShiftType: true,
      employee: true,
    },
  });

  if (officeShifts.length === 0) {
    throw new Error('No valid Office Shifts found to delete');
  }

  const now = new Date();

  await client.officeShift.updateMany({
    where: { id: { in: ids } },
    data: {
      deletedAt: now,
      status: 'cancelled',
      lastUpdatedById: adminId,
    },
  });

  // Collect dates for deleting day overrides
  const datesByEmployee = new Map<string, Set<Date>>();
  for (const shift of officeShifts) {
    const dateObj = new Date(shift.date.toISOString().slice(0, 10) + 'T00:00:00Z');
    if (!datesByEmployee.has(shift.employeeId)) {
      datesByEmployee.set(shift.employeeId, new Set());
    }
    datesByEmployee.get(shift.employeeId)!.add(dateObj);
  }

  // Delete day overrides for each employee via repository helper so reconciliation is applied.
  for (const [employeeId, dates] of datesByEmployee.entries()) {
    await deleteEmployeeOfficeDayOverridesByEmployeeAndDates(
      employeeId,
      [...dates].map(date => date.toISOString().slice(0, 10)),
      adminId,
      client,
      false,
      ['shift_override']
    );
  }

  await client.changelog.createMany({
    data: officeShifts.map(officeShift => ({
      action: 'DELETE',
      entityType: 'OfficeShift',
      entityId: officeShift.id,
      actor: 'admin',
      actorId: adminId,
      details: {
        officeShiftTypeName: officeShift.officeShiftType.name,
        employeeName: officeShift.employee.fullName,
        date: officeShift.date,
        startsAt: officeShift.startsAt,
        endsAt: officeShift.endsAt,
        note: officeShift.note,
        deletedAt: now,
      },
    })),
  });

  return officeShifts.length;
}

export async function deleteOfficeShiftsByEmployeeAndDates(
  employeeId: string,
  dates: string[],
  adminId: string,
  tx: TxLike
) {
  const dateObjects = dates.map(d => new Date(`${d}T00:00:00Z`));

  const shiftsToDelete = await tx.officeShift.findMany({
    where: {
      employeeId,
      deletedAt: null,
      date: {
        in: dateObjects,
      },
    },
    include: {
      officeShiftType: true,
      employee: true,
    },
  });

  if (shiftsToDelete.length === 0) return 0;

  const shiftIds = shiftsToDelete.map(shift => shift.id);
  const now = new Date();

  await tx.officeShift.updateMany({
    where: {
      id: {
        in: shiftIds,
      },
    },
    data: {
      deletedAt: now,
      status: 'cancelled',
      lastUpdatedById: adminId,
    },
  });

  // Create changelog entries for each deleted shift
  await tx.changelog.createMany({
    data: shiftsToDelete.map(shift => ({
      action: 'DELETE',
      entityType: 'OfficeShift',
      entityId: shift.id,
      actor: 'admin' as const,
      actorId: adminId,
      details: {
        officeShiftTypeName: shift.officeShiftType.name,
        employeeName: shift.employee.fullName,
        date: shift.date,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        reason: 'BULK_IMPORT_DAY_OFF',
        deletedAt: now,
      },
    })),
  });

  return shiftIds.length;
}

export async function getUpcomingOfficeShiftsOverview(at = new Date()) {
  const todayRange = getBusinessDayRange(at, BUSINESS_TIMEZONE);

  const tomorrow = new Date(at);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowRange = getBusinessDayRange(tomorrow, BUSINESS_TIMEZONE);

  const sevenDays = new Date(at);
  sevenDays.setDate(sevenDays.getDate() + 7);
  const sevenDaysRange = getBusinessDayRange(sevenDays, BUSINESS_TIMEZONE);

  const [todayUpcoming, tomorrowCount, next7Days] = await Promise.all([
    prisma.officeShift.count({
      where: {
        deletedAt: null,
        startsAt: {
          gt: at,
          lt: todayRange.end,
        },
        status: {
          not: 'cancelled' as ShiftStatus,
        },
      },
    }),
    prisma.officeShift.count({
      where: {
        deletedAt: null,
        startsAt: {
          gte: tomorrowRange.start,
          lt: tomorrowRange.end,
        },
        status: {
          not: 'cancelled' as ShiftStatus,
        },
      },
    }),
    prisma.officeShift.count({
      where: {
        deletedAt: null,
        startsAt: {
          gte: todayRange.start,
          lt: sevenDaysRange.end,
        },
        status: {
          not: 'cancelled' as ShiftStatus,
        },
      },
    }),
  ]);

  return {
    todayUpcoming,
    tomorrow: tomorrowCount,
    next7Days,
  };
}

export async function getTodayOfficeShiftsOverview(at = new Date()) {
  const todayRange = getBusinessDayRange(at, BUSINESS_TIMEZONE);

  const [completed, ongoing, upcoming] = await Promise.all([
    prisma.officeShift.count({
      where: {
        deletedAt: null,
        endsAt: {
          lte: at,
          gte: todayRange.start,
        },
        status: {
          not: 'cancelled' as ShiftStatus,
        },
      },
    }),
    prisma.officeShift.count({
      where: {
        deletedAt: null,
        startsAt: {
          lte: at,
        },
        endsAt: {
          gt: at,
        },
        status: {
          not: 'cancelled' as ShiftStatus,
        },
      },
    }),
    prisma.officeShift.count({
      where: {
        deletedAt: null,
        startsAt: {
          gt: at,
          lt: todayRange.end,
        },
        status: {
          not: 'cancelled' as ShiftStatus,
        },
      },
    }),
  ]);

  return {
    completed,
    ongoing,
    upcoming,
  };
}

export async function deleteOldOfficeShiftsAndRelated(olderThan: Date) {
  let officeShifts = 0;
  let officeAttendances = 0;
  let changelogs = 0;
  const s3Keys = new Set<string>();

  while (true) {
    const batch = await prisma.officeShift.findMany({
      where: { endsAt: { lt: olderThan } },
      select: { id: true },
      take: 500,
      orderBy: { endsAt: 'asc' },
    });

    if (batch.length === 0) break;
    const officeShiftIds = batch.map(s => s.id);

    await prisma.$transaction(async tx => {
      const oaRows = await tx.officeAttendance.findMany({
        where: { officeShiftId: { in: officeShiftIds } },
        select: { id: true, picture: true },
      });
      for (const a of oaRows) {
        if (a.picture && !a.picture.startsWith('http')) s3Keys.add(a.picture);
      }
      if (oaRows.length > 0) {
        const { count } = await tx.officeAttendance.deleteMany({
          where: { id: { in: oaRows.map(a => a.id) } },
        });
        officeAttendances += count;
      }

      const { count: clCount } = await tx.changelog.deleteMany({
        where: { entityType: 'OfficeShift', entityId: { in: officeShiftIds } },
      });
      changelogs += clCount;

      const { count: osCount } = await tx.officeShift.deleteMany({
        where: { id: { in: officeShiftIds } },
      });
      officeShifts += osCount;
    });
  }

  return { officeShifts, officeAttendances, changelogs, s3Keys: Array.from(s3Keys) };
}

export type LatestOfficeShiftSwapReplacement = {
  method: 'SWAP' | 'REPLACEMENT';
  previousEmployeeName: string | null;
  swapPartnerName?: string | null;
  replacementReason?: string | null;
};

/**
 * Returns non-deleted, non-past office shifts for an employee. Used to surface
 * swap candidates for the admin office swap-shift modal. Past shifts and shifts
 * not in `scheduled`/`in_progress` are excluded so admins can only swap into a
 * shift that is today or in the future.
 */
export async function getOfficeShiftsByEmployeeWithinWindow(
  employeeId: string,
  referenceDate: Date,
  include?: Prisma.OfficeShiftInclude
) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayUtcMidnight = new Date(`${todayKey}T00:00:00Z`);

  return prisma.officeShift.findMany({
    where: {
      employeeId,
      deletedAt: null,
      date: { gte: todayUtcMidnight },
    },
    include: include || {
      officeShiftType: true,
      employee: { include: { office: { select: { name: true } } } },
      officeAttendances: true,
    },
    orderBy: { startsAt: 'asc' },
  });
}

/**
 * Replaces the employee on an existing office shift IN PLACE.
 *
 * The shift keeps its id, type, date, window, attendanceMode, and attendance records.
 * Only `employeeId` and `note` change. The coupled `shift_override` day override for
 * the old (employeeId, date) is removed and a new one is upserted for the new owner.
 *
 * Atomic transaction with row locks on both employees. Writes a single UPDATE
 * changelog with `details.method = 'REPLACEMENT'`.
 */
export async function replaceOfficeShiftGuard(
  params: {
    officeShiftId: string;
    replacementEmployeeId: string;
    reason: string;
    notes?: string | null;
    evidenceS3Key?: string | null;
  },
  adminId: string
) {
  const { officeShiftId, replacementEmployeeId, reason, notes, evidenceS3Key } = params;

  if (!officeShiftId) throw new Error('officeShiftId is required');
  if (!replacementEmployeeId) throw new Error('replacementEmployeeId is required');
  if (!reason?.trim()) throw new Error('reason is required');

  const result = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const originalShift = await tx.officeShift.findUnique({
        where: { id: officeShiftId, deletedAt: null },
        include: {
          officeShiftType: true,
          employee: { include: { office: { select: { name: true } } } },
        },
      });

      if (!originalShift) {
        throw new Error('Office shift not found');
      }

      const forbidden: ShiftStatus[] = ['cancelled', 'completed', 'missed'];
      if (forbidden.includes(originalShift.status)) {
        throw new Error('Only scheduled or in-progress office shifts can be replaced');
      }

      if (originalShift.employeeId === replacementEmployeeId) {
        throw new Error('Replacement employee must be different from the current employee');
      }

      const replacementEmployee = await tx.employee.findUnique({
        where: { id: replacementEmployeeId, deletedAt: null },
        select: { id: true, role: true, status: true, fullName: true, employeeNumber: true },
      });

      if (!replacementEmployee) {
        throw new Error('Replacement employee not found');
      }

      if (replacementEmployee.role !== 'office') {
        throw new Error('Replacement employee must have the office role');
      }

      if (replacementEmployee.status !== true) {
        throw new Error('Replacement employee is not active');
      }

      // Row-lock both employee rows to serialize concurrent operations
      const employeeIdsToLock = Array.from(
        new Set([originalShift.employeeId, replacementEmployeeId].filter((id): id is string => !!id))
      ).sort();
      if (employeeIdsToLock.length > 0) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM employees WHERE id IN (${Prisma.join(employeeIdsToLock)}) ORDER BY id FOR UPDATE`
        );
      }

      // Overlap check for replacement employee
      const overlap = await checkOverlappingOfficeShift({
        employeeId: replacementEmployeeId,
        startsAt: originalShift.startsAt,
        endsAt: originalShift.endsAt,
        excludeOfficeShiftId: officeShiftId,
      });
      if (overlap) {
        throw new Error('Replacement employee already has a conflicting office shift during this time');
      }

      const timestamp = new Date().toISOString();
      const replaceLine = `[Replaced on ${timestamp}]: ${reason.trim()}`;
      const noteParts = [replaceLine];
      if (notes?.trim()) noteParts.push(notes.trim());
      if (evidenceS3Key) noteParts.push(`Evidence: ${evidenceS3Key}`);
      const newNoteBody = noteParts.join('\n');
      const updatedNote = originalShift.note ? `${newNoteBody}\n\n${originalShift.note}` : newNoteBody;

      const dateKey = formatDateKeyInTimeZone(originalShift.date, BUSINESS_TIMEZONE);

      // Re-point the shift_override day override from the old owner to the new owner.
      const originalEmployeeId = originalShift.employeeId;
      if (originalEmployeeId) {
        await deleteEmployeeOfficeDayOverridesByEmployeeAndDates(originalEmployeeId, [dateKey], adminId, tx, true, [
          'shift_override',
        ]);
      }
      await upsertEmployeeOfficeDayOverride(
        {
          employeeId: replacementEmployeeId,
          date: dateKey,
          overrideType: 'shift_override',
          adminId,
          skipLeaveReconciliation: true,
        },
        tx
      );

      const updatedShift = await tx.officeShift.update({
        where: { id: officeShiftId, deletedAt: null },
        data: {
          employee: { connect: { id: replacementEmployeeId } },
          note: updatedNote,
          lastUpdatedBy: { connect: { id: adminId } },
        },
        include: {
          officeShiftType: true,
          employee: { include: { office: { select: { name: true } } } },
        },
      });

      const beforeEmpName = originalShift.employee?.fullName ?? 'Unassigned';
      const afterEmpName = updatedShift.employee?.fullName ?? 'Unassigned';

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'OfficeShift',
          entityId: updatedShift.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            method: 'REPLACEMENT',
            officeShiftTypeName: updatedShift.officeShiftType.name,
            employeeName: afterEmpName,
            date: updatedShift.date,
            startsAt: updatedShift.startsAt,
            endsAt: updatedShift.endsAt,
            status: updatedShift.status,
            note: updatedShift.note,
            attendanceMode: updatedShift.attendanceMode,
            officeShiftTypeId: updatedShift.officeShiftTypeId,
            employeeId: updatedShift.employeeId,
            employeeNumber: updatedShift.employee?.employeeNumber ?? null,
            previousEmployeeId: originalEmployeeId,
            previousEmployeeNumber: originalShift.employee?.employeeNumber ?? null,
            previousEmployeeName: beforeEmpName,
            replacementReason: reason.trim(),
            replacementNotes: notes ?? null,
            evidenceS3Key: evidenceS3Key ?? null,
            replacedAt: new Date(),
            changes: {
              employeeId: { from: originalEmployeeId, to: updatedShift.employeeId },
              employeeName: { from: beforeEmpName, to: afterEmpName },
              note: { from: originalShift.note, to: updatedShift.note },
            },
          },
        },
      });

      return updatedShift;
    },
    { timeout: 15000 }
  );

  // Post-commit: notify affected employees and reconcile office leaves
  const employeesTouched = Array.from(new Set([result.employeeId].filter(Boolean) as string[]));

  for (const employeeId of employeesTouched) {
    await redis.xadd(
      `employee:stream:${employeeId}`,
      'MAXLEN',
      '~',
      100,
      '*',
      'type',
      'shift_updated',
      'shiftId',
      result.id
    );

    const dateKey = formatDateKeyInTimeZone(result.date, BUSINESS_TIMEZONE);
    await reconcileApprovedOfficeLeavesForCoverage({
      employeeId,
      startDateKey: dateKey,
      endDateKey: dateKey,
      adminId,
    });
  }

  await redis.publish('events:shifts', JSON.stringify({ type: 'OFFICE_SHIFT_REPLACED', id: result.id }));

  return result;
}

export type BulkOfficeSwapAffectedShift = {
  id: string;
  employeeId: string | null;
  shiftTypeName: string;
  date: Date;
  startsAt: Date;
  endsAt: Date;
  method: 'SWAP' | 'REPLACEMENT';
};

export type BulkOfficeSwapReplaceResult = {
  swappedCount: number;
  replacedCount: number;
  affectedShifts: BulkOfficeSwapAffectedShift[];
  rangeFrom: Date;
  rangeTo: Date;
};

/**
 * Bulk swap+replace between two office employees over a date range.
 * Time-matched shifts are swapped; the rest are reassigned (replaced) to the
 * other employee. Every reassignment re-points the shift_override day override
 * from the old owner to the new owner (the office-shift delta). All reads,
 * locks, validations, updates and changelogs run inside one transaction.
 */
export async function bulkSwapReplaceOfficeShifts(
  params: {
    employeeAId: string;
    employeeBId: string;
    fromDate: string;
    toDate: string;
    reason?: string | null;
    notes?: string | null;
  },
  adminId: string
): Promise<BulkOfficeSwapReplaceResult> {
  const { employeeAId, employeeBId, fromDate, toDate, reason, notes } = params;

  if (!employeeAId || !employeeBId) throw new Error('employeeAId and employeeBId are required');
  if (employeeAId === employeeBId) throw new Error('Cannot swap an employee with themselves');
  if (!fromDate || !toDate) throw new Error('fromDate and toDate are required');
  if (new Date(fromDate) > new Date(toDate)) throw new Error('fromDate must be <= toDate');

  // Pre-tx employee validation: exist, not deleted, office role, active.
  const [empA, empB] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeAId },
      select: { id: true, fullName: true, deletedAt: true, role: true, status: true },
    }),
    prisma.employee.findUnique({
      where: { id: employeeBId },
      select: { id: true, fullName: true, deletedAt: true, role: true, status: true },
    }),
  ]);
  for (const [tag, e] of [
    ['Employee A', empA],
    ['Employee B', empB],
  ] as const) {
    if (!e || e.deletedAt) throw new Error(`${tag} not found`);
    if (e.role !== 'office') throw new Error(`${tag} must be an office employee`);
    if (!e.status) throw new Error(`${tag} is inactive`);
  }

  const rangeFrom = new Date(`${fromDate}T00:00:00Z`);
  const rangeTo = new Date(`${toDate}T23:59:59Z`);

  const timestamp = new Date().toISOString();
  const swapLine = `[Swap on ${timestamp}]: ${reason?.trim() ?? 'Bulk swap'}`;
  const replacementLine = `[Replaced on ${timestamp}]: ${reason?.trim() ?? 'Bulk swap'}`;
  const replacementReasonText = reason?.trim() || 'Bulk swap';

  const result = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Lock both employee rows first (before any reads) to serialize
      // concurrent bulk operations between the same employees.
      const employeeIdsToLock = [employeeAId, employeeBId].sort();
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM employees WHERE id IN (${Prisma.join(employeeIdsToLock)}) ORDER BY id FOR UPDATE`
      );

      const [aShifts, bShifts] = await Promise.all([
        tx.officeShift.findMany({
          where: {
            employeeId: employeeAId,
            deletedAt: null,
            status: { in: ['scheduled', 'in_progress'] },
            date: { gte: rangeFrom, lte: rangeTo },
          },
          include: {
            officeShiftType: true,
            employee: { include: { office: { select: { name: true } } } },
          },
          orderBy: { startsAt: 'asc' },
        }),
        tx.officeShift.findMany({
          where: {
            employeeId: employeeBId,
            deletedAt: null,
            status: { in: ['scheduled', 'in_progress'] },
            date: { gte: rangeFrom, lte: rangeTo },
          },
          include: {
            officeShiftType: true,
            employee: { include: { office: { select: { name: true } } } },
          },
          orderBy: { startsAt: 'asc' },
        }),
      ]);

      if (aShifts.length === 0 && bShifts.length === 0) {
        throw new Error('No eligible office shifts found for either employee in the given date range');
      }

      // Pair A<->B by exact startsAt|endsAt interval.
      const bShiftsByInterval = new Map<string, (typeof bShifts)[number]>();
      for (const bs of bShifts) {
        const key = `${bs.startsAt.toISOString()}|${bs.endsAt.toISOString()}`;
        bShiftsByInterval.set(key, bs);
      }

      const matchedPairs: { aShift: (typeof aShifts)[number]; bShift: (typeof bShifts)[number] }[] = [];
      const unmatchedA: (typeof aShifts)[number][] = [];
      const bMatchedKeys = new Set<string>();
      for (const aShift of aShifts) {
        const key = `${aShift.startsAt.toISOString()}|${aShift.endsAt.toISOString()}`;
        const bShift = bShiftsByInterval.get(key);
        if (bShift) {
          matchedPairs.push({ aShift, bShift });
          bMatchedKeys.add(key);
        } else {
          unmatchedA.push(aShift);
        }
      }
      const unmatchedB = bShifts.filter(bs => {
        const key = `${bs.startsAt.toISOString()}|${bs.endsAt.toISOString()}`;
        return !bMatchedKeys.has(key);
      });

      // Lock every batch shift row in deterministic order, before any
      // overlap validation, so concurrent mutations can't race the read.
      const allShiftIds = Array.from(new Set([...aShifts.map(s => s.id), ...bShifts.map(s => s.id)])).sort();
      if (allShiftIds.length > 0) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM office_shifts WHERE id IN (${Prisma.join(allShiftIds)}) ORDER BY id FOR UPDATE`
        );
      }

      // Overlap checks against non-batch shifts.
      // Every batch shift is being reassigned between the two employees, so
      // they must be excluded from each other's overlap window (they move
      // together and cannot collide with one another at the destination).
      for (const bs of bShifts) {
        const overlapA = await checkOverlappingOfficeShift({
          employeeId: employeeAId,
          startsAt: bs.startsAt,
          endsAt: bs.endsAt,
          excludeOfficeShiftIds: allShiftIds,
        });
        if (overlapA) throw new Error(`Pre-existing shift conflicts with ${empA?.fullName ?? employeeAId}'s new slot`);
      }
      for (const as of aShifts) {
        const overlapB = await checkOverlappingOfficeShift({
          employeeId: employeeBId,
          startsAt: as.startsAt,
          endsAt: as.endsAt,
          excludeOfficeShiftIds: allShiftIds,
        });
        if (overlapB) throw new Error(`Pre-existing shift conflicts with ${empB?.fullName ?? employeeBId}'s new slot`);
      }

      const changelogEntries: Prisma.ChangelogCreateManyInput[] = [];
      const affectedShifts: BulkOfficeSwapAffectedShift[] = [];
      let swappedCount = 0;
      let replacedCount = 0;

      const updateInclude = {
        officeShiftType: true,
        employee: { include: { office: { select: { name: true } } } },
      } satisfies Prisma.OfficeShiftInclude;

      // 5a. Matched pairs -> SWAP.
      for (const { aShift, bShift } of matchedPairs) {
        const dateKeyA = formatDateKeyInTimeZone(aShift.date, BUSINESS_TIMEZONE);
        const dateKeyB = formatDateKeyInTimeZone(bShift.date, BUSINESS_TIMEZONE);

        // Re-point shift_override day overrides to the new owners.
        if (aShift.employeeId) {
          await deleteEmployeeOfficeDayOverridesByEmployeeAndDates(aShift.employeeId, [dateKeyA], adminId, tx, true, [
            'shift_override',
          ]);
        }
        await upsertEmployeeOfficeDayOverride(
          {
            employeeId: bShift.employeeId,
            date: dateKeyA,
            overrideType: 'shift_override',
            adminId,
            skipLeaveReconciliation: true,
          },
          tx
        );
        if (bShift.employeeId) {
          await deleteEmployeeOfficeDayOverridesByEmployeeAndDates(bShift.employeeId, [dateKeyB], adminId, tx, true, [
            'shift_override',
          ]);
        }
        await upsertEmployeeOfficeDayOverride(
          {
            employeeId: aShift.employeeId,
            date: dateKeyB,
            overrideType: 'shift_override',
            adminId,
            skipLeaveReconciliation: true,
          },
          tx
        );

        const aNoteParts = [swapLine, notes?.trim()].filter(Boolean);
        const aUpdatedNote = aNoteParts.join('\n') + (aShift.note ? `\n\n${aShift.note}` : '');
        const bNoteParts = [swapLine, notes?.trim()].filter(Boolean);
        const bUpdatedNote = bNoteParts.join('\n') + (bShift.note ? `\n\n${bShift.note}` : '');

        const updatedA = await tx.officeShift.update({
          where: { id: aShift.id, deletedAt: null },
          data: {
            employee: { connect: { id: bShift.employeeId } },
            note: aUpdatedNote,
            lastUpdatedBy: { connect: { id: adminId } },
          },
          include: updateInclude,
        });
        const updatedB = await tx.officeShift.update({
          where: { id: bShift.id, deletedAt: null },
          data: {
            employee: { connect: { id: aShift.employeeId } },
            note: bUpdatedNote,
            lastUpdatedBy: { connect: { id: adminId } },
          },
          include: updateInclude,
        });

        changelogEntries.push(
          {
            action: 'UPDATE',
            entityType: 'OfficeShift',
            entityId: updatedA.id,
            actor: 'admin',
            actorId: adminId,
            details: {
              officeShiftTypeName: updatedA.officeShiftType.name,
              employeeName: updatedA.employee?.fullName ?? 'Unassigned',
              date: updatedA.date,
              startsAt: updatedA.startsAt,
              endsAt: updatedA.endsAt,
              status: updatedA.status,
              note: updatedA.note,
              attendanceMode: updatedA.attendanceMode,
              officeShiftTypeId: updatedA.officeShiftTypeId,
              employeeId: updatedA.employeeId,
              employeeNumber: updatedA.employee?.employeeNumber ?? null,
              previousEmployeeId: aShift.employeeId,
              previousEmployeeNumber: aShift.employee?.employeeNumber ?? null,
              previousEmployeeName: aShift.employee?.fullName ?? 'Unassigned',
              method: 'SWAP',
              swapPairShiftId: updatedB.id,
              swapReason: reason ?? 'Bulk swap',
              changes: {
                employeeId: { from: aShift.employeeId, to: updatedA.employeeId },
                note: { from: aShift.note, to: updatedA.note },
              },
            },
          },
          {
            action: 'UPDATE',
            entityType: 'OfficeShift',
            entityId: updatedB.id,
            actor: 'admin',
            actorId: adminId,
            details: {
              officeShiftTypeName: updatedB.officeShiftType.name,
              employeeName: updatedB.employee?.fullName ?? 'Unassigned',
              date: updatedB.date,
              startsAt: updatedB.startsAt,
              endsAt: updatedB.endsAt,
              status: updatedB.status,
              note: updatedB.note,
              attendanceMode: updatedB.attendanceMode,
              officeShiftTypeId: updatedB.officeShiftTypeId,
              employeeId: updatedB.employeeId,
              employeeNumber: updatedB.employee?.employeeNumber ?? null,
              previousEmployeeId: bShift.employeeId,
              previousEmployeeNumber: bShift.employee?.employeeNumber ?? null,
              previousEmployeeName: bShift.employee?.fullName ?? 'Unassigned',
              method: 'SWAP',
              swapPairShiftId: updatedA.id,
              swapReason: reason ?? 'Bulk swap',
              changes: {
                employeeId: { from: bShift.employeeId, to: updatedB.employeeId },
                note: { from: bShift.note, to: updatedB.note },
              },
            },
          }
        );

        affectedShifts.push(
          {
            id: updatedA.id,
            employeeId: updatedA.employeeId,
            shiftTypeName: updatedA.officeShiftType.name,
            date: updatedA.date,
            startsAt: updatedA.startsAt,
            endsAt: updatedA.endsAt,
            method: 'SWAP',
          },
          {
            id: updatedB.id,
            employeeId: updatedB.employeeId,
            shiftTypeName: updatedB.officeShiftType.name,
            date: updatedB.date,
            startsAt: updatedB.startsAt,
            endsAt: updatedB.endsAt,
            method: 'SWAP',
          }
        );
        swappedCount++;
      }

      // 5b. Unmatched A shifts -> REPLACE to B.
      for (const aShift of unmatchedA) {
        const dateKey = formatDateKeyInTimeZone(aShift.date, BUSINESS_TIMEZONE);
        const noteParts = [replacementLine, notes?.trim()].filter(Boolean);
        const updatedNote = noteParts.join('\n') + (aShift.note ? `\n\n${aShift.note}` : '');

        if (aShift.employeeId) {
          await deleteEmployeeOfficeDayOverridesByEmployeeAndDates(aShift.employeeId, [dateKey], adminId, tx, true, [
            'shift_override',
          ]);
        }
        await upsertEmployeeOfficeDayOverride(
          {
            employeeId: employeeBId,
            date: dateKey,
            overrideType: 'shift_override',
            adminId,
            skipLeaveReconciliation: true,
          },
          tx
        );

        const updatedShift = await tx.officeShift.update({
          where: { id: aShift.id, deletedAt: null },
          data: {
            employee: { connect: { id: employeeBId } },
            note: updatedNote,
            lastUpdatedBy: { connect: { id: adminId } },
          },
          include: updateInclude,
        });

        changelogEntries.push({
          action: 'UPDATE',
          entityType: 'OfficeShift',
          entityId: updatedShift.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            officeShiftTypeName: updatedShift.officeShiftType.name,
            employeeName: updatedShift.employee?.fullName ?? 'Unassigned',
            date: updatedShift.date,
            startsAt: updatedShift.startsAt,
            endsAt: updatedShift.endsAt,
            status: updatedShift.status,
            note: updatedShift.note,
            attendanceMode: updatedShift.attendanceMode,
            officeShiftTypeId: updatedShift.officeShiftTypeId,
            employeeId: updatedShift.employeeId,
            employeeNumber: updatedShift.employee?.employeeNumber ?? null,
            previousEmployeeId: aShift.employeeId,
            previousEmployeeNumber: aShift.employee?.employeeNumber ?? null,
            previousEmployeeName: aShift.employee?.fullName ?? 'Unassigned',
            method: 'REPLACEMENT',
            replacementReason: replacementReasonText,
            replacementNotes: notes ?? null,
            evidenceS3Key: null,
            replacedAt: new Date(),
            changes: {
              employeeId: { from: aShift.employeeId, to: updatedShift.employeeId },
              note: { from: aShift.note, to: updatedShift.note },
            },
          },
        });

        affectedShifts.push({
          id: updatedShift.id,
          employeeId: updatedShift.employeeId,
          shiftTypeName: updatedShift.officeShiftType.name,
          date: updatedShift.date,
          startsAt: updatedShift.startsAt,
          endsAt: updatedShift.endsAt,
          method: 'REPLACEMENT',
        });
        replacedCount++;
      }

      // 5c. Unmatched B shifts -> REPLACE to A.
      for (const bShift of unmatchedB) {
        const dateKey = formatDateKeyInTimeZone(bShift.date, BUSINESS_TIMEZONE);
        const noteParts = [replacementLine, notes?.trim()].filter(Boolean);
        const updatedNote = noteParts.join('\n') + (bShift.note ? `\n\n${bShift.note}` : '');

        if (bShift.employeeId) {
          await deleteEmployeeOfficeDayOverridesByEmployeeAndDates(bShift.employeeId, [dateKey], adminId, tx, true, [
            'shift_override',
          ]);
        }
        await upsertEmployeeOfficeDayOverride(
          {
            employeeId: employeeAId,
            date: dateKey,
            overrideType: 'shift_override',
            adminId,
            skipLeaveReconciliation: true,
          },
          tx
        );

        const updatedShift = await tx.officeShift.update({
          where: { id: bShift.id, deletedAt: null },
          data: {
            employee: { connect: { id: employeeAId } },
            note: updatedNote,
            lastUpdatedBy: { connect: { id: adminId } },
          },
          include: updateInclude,
        });

        changelogEntries.push({
          action: 'UPDATE',
          entityType: 'OfficeShift',
          entityId: updatedShift.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            officeShiftTypeName: updatedShift.officeShiftType.name,
            employeeName: updatedShift.employee?.fullName ?? 'Unassigned',
            date: updatedShift.date,
            startsAt: updatedShift.startsAt,
            endsAt: updatedShift.endsAt,
            status: updatedShift.status,
            note: updatedShift.note,
            attendanceMode: updatedShift.attendanceMode,
            officeShiftTypeId: updatedShift.officeShiftTypeId,
            employeeId: updatedShift.employeeId,
            employeeNumber: updatedShift.employee?.employeeNumber ?? null,
            previousEmployeeId: bShift.employeeId,
            previousEmployeeNumber: bShift.employee?.employeeNumber ?? null,
            previousEmployeeName: bShift.employee?.fullName ?? 'Unassigned',
            method: 'REPLACEMENT',
            replacementReason: replacementReasonText,
            replacementNotes: notes ?? null,
            evidenceS3Key: null,
            replacedAt: new Date(),
            changes: {
              employeeId: { from: bShift.employeeId, to: updatedShift.employeeId },
              note: { from: bShift.note, to: updatedShift.note },
            },
          },
        });

        affectedShifts.push({
          id: updatedShift.id,
          employeeId: updatedShift.employeeId,
          shiftTypeName: updatedShift.officeShiftType.name,
          date: updatedShift.date,
          startsAt: updatedShift.startsAt,
          endsAt: updatedShift.endsAt,
          method: 'REPLACEMENT',
        });
        replacedCount++;
      }

      if (changelogEntries.length > 0) {
        await tx.changelog.createMany({ data: changelogEntries });
      }

      return { swappedCount, replacedCount, affectedShifts };
    },
    { timeout: 30000 }
  );

  // Post-commit: employee streams, events, leave reconciliation.
  const employeesTouched = Array.from(new Set([employeeAId, employeeBId].filter(Boolean)));
  for (const employeeId of employeesTouched) {
    await redis.xadd(`employee:stream:${employeeId}`, 'MAXLEN', '~', 100, '*', 'type', 'shift_updated');
  }

  const datesByEmployee = new Map<string, Set<string>>();
  for (const s of result.affectedShifts) {
    if (!s.employeeId) continue;
    const key = formatDateKeyInTimeZone(s.date, BUSINESS_TIMEZONE);
    const set = datesByEmployee.get(s.employeeId) ?? new Set<string>();
    set.add(key);
    datesByEmployee.set(s.employeeId, set);
  }
  for (const employeeId of employeesTouched) {
    const dates = datesByEmployee.get(employeeId);
    if (!dates || dates.size === 0) continue;
    const sorted = [...dates].sort();
    await reconcileApprovedOfficeLeavesForCoverage({
      employeeId,
      startDateKey: sorted[0],
      endDateKey: sorted[sorted.length - 1],
      adminId,
    });
  }

  const publishIds = result.affectedShifts.map(s => s.id);
  if (result.swappedCount > 0 && result.replacedCount > 0) {
    await redis.publish('events:shifts', JSON.stringify({ type: 'OFFICE_SHIFT_SWAP_REPLACE', ids: publishIds }));
  } else if (result.swappedCount > 0) {
    await redis.publish('events:shifts', JSON.stringify({ type: 'OFFICE_SHIFT_SWAPPED', ids: publishIds }));
  } else if (result.replacedCount > 0) {
    await redis.publish('events:shifts', JSON.stringify({ type: 'OFFICE_SHIFT_REPLACED', ids: publishIds }));
  }

  return { ...result, rangeFrom, rangeTo };
}

/**
 * Swaps the `employeeId` of two existing office shifts in-place.
 *
 * Both shifts must be `scheduled` or `in_progress` and have different employees.
 * The coupled `shift_override` day overrides are re-pointed to their new owners.
 *
 * Returns the updated shift rows after the swap.
 */
export async function swapOfficeShifts(
  params: {
    officeShiftAId: string;
    officeShiftBId: string;
    reason: string;
    notes?: string | null;
  },
  adminId: string
) {
  const { officeShiftAId, officeShiftBId, reason, notes } = params;

  if (!officeShiftAId || !officeShiftBId) throw new Error('officeShiftAId and officeShiftBId are required');
  if (officeShiftAId === officeShiftBId) throw new Error('Cannot swap an office shift with itself');
  if (!reason?.trim()) throw new Error('reason is required');

  const result = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Lock both shift rows in deterministic order
      const idsToLock = [officeShiftAId, officeShiftBId].sort();
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM office_shifts WHERE id IN (${Prisma.join(idsToLock)}) ORDER BY id FOR UPDATE`
      );

      const [a, b] = await Promise.all([
        tx.officeShift.findUnique({
          where: { id: officeShiftAId, deletedAt: null },
          include: {
            officeShiftType: true,
            employee: { include: { office: { select: { name: true } } } },
          },
        }),
        tx.officeShift.findUnique({
          where: { id: officeShiftBId, deletedAt: null },
          include: {
            officeShiftType: true,
            employee: { include: { office: { select: { name: true } } } },
          },
        }),
      ]);

      if (!a || !b) throw new Error('One or both office shifts not found');

      const forbidden: ShiftStatus[] = ['cancelled', 'completed', 'missed'];
      if (forbidden.includes(a.status) || forbidden.includes(b.status)) {
        throw new Error('Only scheduled or in-progress office shifts can be swapped');
      }

      if (!a.employeeId || !b.employeeId) {
        throw new Error('Both office shifts must be assigned to an employee before swapping');
      }

      if (a.employeeId === b.employeeId) {
        throw new Error('Both office shifts are already assigned to the same employee');
      }

      // Lock affected employees
      const employeeIdsToLock = Array.from(new Set([a.employeeId, b.employeeId])).sort();
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM employees WHERE id IN (${Prisma.join(employeeIdsToLock)}) ORDER BY id FOR UPDATE`
      );

      // Overlap check: each employee must not collide with the new shift times
      const overlapA = await checkOverlappingOfficeShift({
        employeeId: a.employeeId,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        excludeOfficeShiftId: a.id,
      });
      if (overlapA && overlapA.id !== officeShiftBId) {
        const nameA = a.employee?.fullName ?? a.employeeId;
        throw new Error(`Swap would create an overlap for ${nameA}`);
      }

      const overlapB = await checkOverlappingOfficeShift({
        employeeId: b.employeeId,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        excludeOfficeShiftId: b.id,
      });
      if (overlapB && overlapB.id !== officeShiftAId) {
        const nameB = b.employee?.fullName ?? b.employeeId;
        throw new Error(`Swap would create an overlap for ${nameB}`);
      }

      const timestamp = new Date().toISOString();
      const swapLine = `[Swap on ${timestamp}]: ${reason.trim()}`;

      const updatedANote = [swapLine, notes?.trim()].filter(Boolean).join('\n') + (a.note ? `\n\n${a.note}` : '');
      const updatedBNote = [swapLine, notes?.trim()].filter(Boolean).join('\n') + (b.note ? `\n\n${b.note}` : '');

      const dateKeyA = formatDateKeyInTimeZone(a.date, BUSINESS_TIMEZONE);
      const dateKeyB = formatDateKeyInTimeZone(b.date, BUSINESS_TIMEZONE);

      // Re-point shift_override day overrides to the new owners.
      if (a.employeeId) {
        await deleteEmployeeOfficeDayOverridesByEmployeeAndDates(a.employeeId, [dateKeyA], adminId, tx, true, [
          'shift_override',
        ]);
      }
      await upsertEmployeeOfficeDayOverride(
        {
          employeeId: b.employeeId,
          date: dateKeyA,
          overrideType: 'shift_override',
          adminId,
          skipLeaveReconciliation: true,
        },
        tx
      );
      if (b.employeeId) {
        await deleteEmployeeOfficeDayOverridesByEmployeeAndDates(b.employeeId, [dateKeyB], adminId, tx, true, [
          'shift_override',
        ]);
      }
      await upsertEmployeeOfficeDayOverride(
        {
          employeeId: a.employeeId,
          date: dateKeyB,
          overrideType: 'shift_override',
          adminId,
          skipLeaveReconciliation: true,
        },
        tx
      );

      const updatedA = await tx.officeShift.update({
        where: { id: officeShiftAId, deletedAt: null },
        data: {
          employee: { connect: { id: b.employeeId } },
          note: updatedANote,
          lastUpdatedBy: { connect: { id: adminId } },
        },
        include: {
          officeShiftType: true,
          employee: { include: { office: { select: { name: true } } } },
        },
      });

      const updatedB = await tx.officeShift.update({
        where: { id: officeShiftBId, deletedAt: null },
        data: {
          employee: { connect: { id: a.employeeId } },
          note: updatedBNote,
          lastUpdatedBy: { connect: { id: adminId } },
        },
        include: {
          officeShiftType: true,
          employee: { include: { office: { select: { name: true } } } },
        },
      });

      await tx.changelog.createMany({
        data: [
          {
            action: 'UPDATE',
            entityType: 'OfficeShift',
            entityId: updatedA.id,
            actor: 'admin',
            actorId: adminId,
            details: {
              officeShiftTypeName: updatedA.officeShiftType.name,
              employeeName: updatedA.employee?.fullName ?? 'Unassigned',
              date: updatedA.date,
              startsAt: updatedA.startsAt,
              endsAt: updatedA.endsAt,
              status: updatedA.status,
              note: updatedA.note,
              attendanceMode: updatedA.attendanceMode,
              officeShiftTypeId: updatedA.officeShiftTypeId,
              employeeId: updatedA.employeeId,
              employeeNumber: updatedA.employee?.employeeNumber ?? null,
              previousEmployeeId: a.employeeId,
              previousEmployeeNumber: a.employee?.employeeNumber ?? null,
              previousEmployeeName: a.employee?.fullName ?? 'Unassigned',
              method: 'SWAP',
              swapPairShiftId: updatedB.id,
              swapReason: reason,
              changes: {
                employeeId: { from: a.employeeId, to: updatedA.employeeId },
                note: { from: a.note, to: updatedA.note },
              },
            },
          },
          {
            action: 'UPDATE',
            entityType: 'OfficeShift',
            entityId: updatedB.id,
            actor: 'admin',
            actorId: adminId,
            details: {
              officeShiftTypeName: updatedB.officeShiftType.name,
              employeeName: updatedB.employee?.fullName ?? 'Unassigned',
              date: updatedB.date,
              startsAt: updatedB.startsAt,
              endsAt: updatedB.endsAt,
              status: updatedB.status,
              note: updatedB.note,
              attendanceMode: updatedB.attendanceMode,
              officeShiftTypeId: updatedB.officeShiftTypeId,
              employeeId: updatedB.employeeId,
              employeeNumber: updatedB.employee?.employeeNumber ?? null,
              previousEmployeeId: b.employeeId,
              previousEmployeeNumber: b.employee?.employeeNumber ?? null,
              previousEmployeeName: b.employee?.fullName ?? 'Unassigned',
              method: 'SWAP',
              swapPairShiftId: updatedA.id,
              swapReason: reason,
              changes: {
                employeeId: { from: b.employeeId, to: updatedB.employeeId },
                note: { from: b.note, to: updatedB.note },
              },
            },
          },
        ],
      });

      return { shiftA: updatedA, shiftB: updatedB };
    },
    { timeout: 15000 }
  );

  // Post-commit: notify both employees and reconcile office leaves
  const employeesTouched = Array.from(
    new Set([result.shiftA.employeeId, result.shiftB.employeeId].filter(Boolean) as string[])
  );
  for (const employeeId of employeesTouched) {
    await redis.xadd(`employee:stream:${employeeId}`, 'MAXLEN', '~', 100, '*', 'type', 'shift_updated');
    for (const shift of [result.shiftA, result.shiftB]) {
      if (shift.employeeId === employeeId) {
        const dateKey = formatDateKeyInTimeZone(shift.date, BUSINESS_TIMEZONE);
        await reconcileApprovedOfficeLeavesForCoverage({
          employeeId,
          startDateKey: dateKey,
          endDateKey: dateKey,
          adminId,
        });
      }
    }
  }

  await redis.publish(
    'events:shifts',
    JSON.stringify({ type: 'OFFICE_SHIFT_SWAPPED', ids: [result.shiftA.id, result.shiftB.id] })
  );

  return result;
}

export async function getLatestSwapReplacementChangelogByOfficeShiftIds(
  officeShiftIds: string[]
): Promise<Map<string, LatestOfficeShiftSwapReplacement>> {
  if (officeShiftIds.length === 0) return new Map<string, LatestOfficeShiftSwapReplacement>();

  const changelogs = await prisma.changelog.findMany({
    where: {
      entityType: 'OfficeShift',
      action: 'UPDATE',
      entityId: { in: officeShiftIds },
    },
    orderBy: { createdAt: 'desc' },
  });

  const map = new Map<string, LatestOfficeShiftSwapReplacement>();
  for (const cl of changelogs) {
    if (map.has(cl.entityId)) continue; // keep the most recent per shift
    const d = cl.details as unknown as {
      method?: 'SWAP' | 'REPLACEMENT';
      previousEmployeeName?: string | null;
      replacementReason?: string | null;
    } | null;
    if (d?.method !== 'SWAP' && d?.method !== 'REPLACEMENT') continue;
    if (d.method === 'REPLACEMENT') {
      map.set(cl.entityId, {
        method: 'REPLACEMENT',
        previousEmployeeName: d.previousEmployeeName ?? null,
        replacementReason: d.replacementReason ?? null,
      });
    } else {
      map.set(cl.entityId, {
        method: 'SWAP',
        previousEmployeeName: d.previousEmployeeName ?? null,
      });
    }
  }
  return map;
}
