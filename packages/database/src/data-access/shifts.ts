import { db as prisma } from '../client';
import { Prisma } from '@prisma/client';
import { redis } from '../redis';

export async function getShiftById(id: string, include?: Prisma.ShiftInclude) {
  return prisma.shift.findUnique({
    where: { id, deletedAt: null },
    include: include || {
      site: true,
      shiftType: true,
      employee: true,
    },
  });
}

export async function getPaginatedShifts(params: {
  where: Prisma.ShiftWhereInput;
  orderBy: Prisma.ShiftOrderByWithRelationInput;
  skip: number;
  take: number;
  include?: Prisma.ShiftInclude;
}) {
  const { where, orderBy, skip, take, include } = params;
  const finalWhere = { ...where, deletedAt: null };

  const [shifts, totalCount] = await prisma.$transaction(
    async tx => {
      return Promise.all([
        tx.shift.findMany({
          where: finalWhere,
          orderBy,
          skip,
          take,
          include: include || {
            site: { select: { name: true } },
            shiftType: { select: { name: true, startTime: true, endTime: true } },
            employee: { select: { firstName: true, lastName: true } },
            createdBy: { select: { name: true } },
            lastUpdatedBy: { select: { name: true } },
          },
        }),
        tx.shift.count({ where: finalWhere }),
      ]);
    },
    { timeout: 5000 }
  );

  return { shifts, totalCount };
}

export async function checkOverlappingShift(params: {
  employeeId?: string;
  guardId?: string;
  startsAt: Date;
  endsAt: Date;
  excludeShiftId?: string;
}) {
  const { employeeId, guardId, startsAt, endsAt, excludeShiftId } = params;
  const targetEmployeeId = employeeId || guardId;

  if (!targetEmployeeId) {
    throw new Error('employeeId or guardId is required');
  }

  return prisma.shift.findFirst({
    where: {
      employeeId: targetEmployeeId,
      deletedAt: null,
      id: excludeShiftId ? { not: excludeShiftId } : undefined,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
}

export async function createShiftWithChangelog(data: Prisma.ShiftCreateInput, adminId: string) {
  const result = await prisma.$transaction(
    async tx => {
      const createdShift = await tx.shift.create({
        data: {
          ...data,
          createdBy: { connect: { id: adminId } },
          lastUpdatedBy: { connect: { id: adminId } },
        },
        include: {
          site: true,
          shiftType: true,
          employee: true,
        },
      });

      const emp = createdShift.employee as any;

      await tx.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'Shift',
          entityId: createdShift.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            siteName: createdShift.site.name,
            typeName: createdShift.shiftType.name,
            employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unassigned',
            date: createdShift.date,
            startsAt: createdShift.startsAt,
            endsAt: createdShift.endsAt,
            requiredCheckinIntervalMins: createdShift.requiredCheckinIntervalMins,
            status: createdShift.status,
            note: createdShift.note,
            siteId: createdShift.siteId,
            shiftTypeId: createdShift.shiftTypeId,
            employeeId: createdShift.employeeId,
          },
        },
      });

      return createdShift;
    },
    { timeout: 10000 }
  );

  if (result.employeeId) {
    await redis.xadd(
      `employee:stream:${result.employeeId}`,
      'MAXLEN',
      '~',
      100,
      '*',
      'type',
      'shift_updated',
      'shiftId',
      result.id
    );
  }

  await redis.publish('events:shifts', JSON.stringify({ type: 'SHIFT_CREATED', id: result.id }));

  return result;
}

export const SHIFT_TRACKED_FIELDS = [
  'employeeName',
  'siteName',
  'typeName',
  'date',
  'startsAt',
  'endsAt',
  'requiredCheckinIntervalMins',
  'status',
  'note',
] as const;

export async function updateShiftWithChangelog(id: string, data: Prisma.ShiftUpdateInput, adminId: string) {
  const result = await prisma.$transaction(
    async tx => {
      const beforeShift = await tx.shift.findUnique({
        where: { id, deletedAt: null },
        include: {
          site: true,
          shiftType: true,
          employee: true,
        },
      });

      if (!beforeShift) {
        throw new Error('Shift not found');
      }

      const updatedShift = await tx.shift.update({
        where: { id, deletedAt: null },
        data: {
          ...data,
          lastUpdatedBy: { connect: { id: adminId } },
        },
        include: {
          site: true,
          shiftType: true,
          employee: true,
        },
      });

      const emp = updatedShift.employee as any;
      const prevEmp = beforeShift.employee as any;

      const updatedEmpName = emp ? `${emp.firstName} ${emp.lastName}` : 'Unassigned';
      const beforeEmpName = prevEmp ? `${prevEmp.firstName} ${prevEmp.lastName}` : 'Unassigned';

      // Calculate changes
      const changes: Record<string, { from: any; to: any }> = {};
      const fieldsToTrack = [
        'siteId',
        'shiftTypeId',
        'employeeId',
        'date',
        'startsAt',
        'endsAt',
        'requiredCheckinIntervalMins',
        'graceMinutes',
        'status',
        'note',
      ] as const;

      for (const field of fieldsToTrack) {
        const oldValue = (beforeShift as any)[field];
        const newValue = (updatedShift as any)[field];

        if (oldValue instanceof Date && newValue instanceof Date) {
          if (oldValue.getTime() !== newValue.getTime()) {
            changes[field] = { from: oldValue, to: newValue };
          }
        } else if (oldValue !== newValue) {
          changes[field] = { from: oldValue, to: newValue };
        }
      }

      if (updatedEmpName !== beforeEmpName) {
        changes['employeeName'] = { from: beforeEmpName, to: updatedEmpName };
      }
      if (beforeShift.site.name !== updatedShift.site.name) {
        changes['siteName'] = { from: beforeShift.site.name, to: updatedShift.site.name };
      }
      if (beforeShift.shiftType.name !== updatedShift.shiftType.name) {
        changes['typeName'] = { from: beforeShift.shiftType.name, to: updatedShift.shiftType.name };
      }

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Shift',
          entityId: updatedShift.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            siteName: updatedShift.site.name,
            typeName: updatedShift.shiftType.name,
            employeeName: updatedEmpName,
            date: updatedShift.date,
            startsAt: updatedShift.startsAt,
            endsAt: updatedShift.endsAt,
            requiredCheckinIntervalMins: updatedShift.requiredCheckinIntervalMins,
            status: updatedShift.status,
            note: updatedShift.note,
            siteId: updatedShift.siteId,
            shiftTypeId: updatedShift.shiftTypeId,
            employeeId: updatedShift.employeeId,
            changes: Object.keys(changes).length > 0 ? changes : undefined,
          },
        },
      });

      return updatedShift;
    },
    { timeout: 10000 }
  );

  if (result.employeeId) {
    await redis.xadd(
      `employee:stream:${result.employeeId}`,
      'MAXLEN',
      '~',
      100,
      '*',
      'type',
      'shift_updated',
      'shiftId',
      result.id
    );
  }

  await redis.publish('events:shifts', JSON.stringify({ type: 'SHIFT_UPDATED', id: result.id }));

  return result;
}

export async function deleteShiftWithChangelog(id: string, adminId: string) {
  const result = await prisma.$transaction(
    async tx => {
      const shiftToDelete = await tx.shift.findUnique({
        where: { id, deletedAt: null },
        include: { site: true, shiftType: true, employee: true },
      });

      if (!shiftToDelete) return null;

      await tx.shift.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          lastUpdatedBy: { connect: { id: adminId } },
        },
      });

      const emp = shiftToDelete.employee as any;

      await tx.changelog.create({
        data: {
          action: 'DELETE',
          entityType: 'Shift',
          entityId: id,
          actor: 'admin',
          actorId: adminId,
          details: {
            siteName: shiftToDelete.site.name,
            typeName: shiftToDelete.shiftType.name,
            employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unassigned',
            date: shiftToDelete.date,
            startsAt: shiftToDelete.startsAt,
            endsAt: shiftToDelete.endsAt,
            requiredCheckinIntervalMins: shiftToDelete.requiredCheckinIntervalMins,
            status: shiftToDelete.status,
            note: shiftToDelete.note,
            siteId: shiftToDelete.siteId,
            shiftTypeId: shiftToDelete.shiftTypeId,
            employeeId: shiftToDelete.employeeId,
            deletedAt: new Date(),
          },
        },
      });

      return shiftToDelete;
    },
    { timeout: 10000 }
  );

  if (result?.employeeId) {
    await redis.xadd(
      `employee:stream:${result.employeeId}`,
      'MAXLEN',
      '~',
      100,
      '*',
      'type',
      'shift_updated',
      'shiftId',
      id
    );
  }

  await redis.publish('events:shifts', JSON.stringify({ type: 'SHIFT_DELETED', id: id }));

  return result;
}

/**
 * Soft deletes all future shifts for an employee.
 * Used when an employee's role changes from on_site to office.
 */
export async function deleteFutureShiftsByEmployee(employeeId: string, adminId: string, tx: any) {
  const now = new Date();

  // Find future shifts to log them (optional but good for history)
  const futureShifts: { id: string }[] = await tx.shift.findMany({
    where: {
      employeeId,
      startsAt: { gt: now },
      deletedAt: null,
    },
    select: { id: true },
  });

  if (futureShifts.length === 0) return 0;

  const shiftIds = futureShifts.map((s: { id: string }) => s.id);

  await tx.shift.updateMany({
    where: {
      id: { in: shiftIds },
    },
    data: {
      deletedAt: now,
      lastUpdatedById: adminId,
    },
  });

  // Log in changelog
  await tx.changelog.create({
    data: {
      action: 'BULK_DELETE',
      entityType: 'Shift',
      entityId: `employee:${employeeId}`,
      actor: 'admin',
      actorId: adminId,
      details: {
        reason: 'ROLE_CHANGE_TO_OFFICE',
        count: shiftIds.length,
        shiftIds,
      },
    },
  });

  // Notify employee via stream
  await redis.xadd(
    `employee:stream:${employeeId}`,
    'MAXLEN',
    '~',
    100,
    '*',
    'type',
    'shifts_deleted',
    'reason',
    'role_change'
  );

  return shiftIds.length;
}

/**
 * Soft deletes all future shifts for all employees of a designation.
 * Used when a designation's role changes from on_site to office.
 */
export async function deleteFutureShiftsByDesignation(designationId: string, adminId: string, tx: any) {
  const now = new Date();

  const futureShifts: { id: string; employeeId: string | null }[] = await tx.shift.findMany({
    where: {
      employee: {
        designationId,
      },
      startsAt: { gt: now },
      deletedAt: null,
    },
    select: { id: true, employeeId: true },
  });

  if (futureShifts.length === 0) return 0;

  const shiftIds = futureShifts.map((s: { id: string }) => s.id);
  const employeeIds = Array.from(
    new Set(
      futureShifts
        .map((s: { employeeId: string | null }) => s.employeeId)
        .filter((id: string | null): id is string => !!id)
    )
  );

  await tx.shift.updateMany({
    where: {
      id: { in: shiftIds },
    },
    data: {
      deletedAt: now,
      lastUpdatedById: adminId,
    },
  });

  await tx.changelog.create({
    data: {
      action: 'BULK_DELETE',
      entityType: 'Shift',
      entityId: `designation:${designationId}`,
      actor: 'admin',
      actorId: adminId,
      details: {
        reason: 'DESIGNATION_ROLE_CHANGE_TO_OFFICE',
        count: shiftIds.length,
        shiftIds,
      },
    },
  });

  // Notify all affected employees
  for (const employeeId of employeeIds) {
    await redis.xadd(
      `employee:stream:${employeeId}`,
      'MAXLEN',
      '~',
      100,
      '*',
      'type',
      'shifts_deleted',
      'reason',
      'role_change'
    );
  }

  return shiftIds.length;
}

export async function bulkCreateShiftsWithChangelog(shiftsToCreate: Prisma.ShiftCreateManyInput[], adminId: string) {
  const createdShifts = await prisma.$transaction(
    async tx => {
      const results = await tx.shift.createManyAndReturn({
        data: shiftsToCreate.map(s => ({ ...s, lastUpdatedById: adminId })),
        include: {
          site: { select: { name: true } },
          shiftType: { select: { name: true } },
          employee: { select: { firstName: true, lastName: true } },
        },
      });

      await tx.changelog.createMany({
        data: results.map(s => {
          const emp = s.employee as any;
          return {
            action: 'CREATE',
            entityType: 'Shift',
            entityId: s.id,
            actor: 'admin',
            actorId: adminId,
            details: {
              method: 'BULK_UPLOAD',
              siteName: s.site.name,
              typeName: s.shiftType.name,
              employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unassigned',
              date: s.date,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              requiredCheckinIntervalMins: s.requiredCheckinIntervalMins,
              status: s.status,
              note: s.note,
              siteId: s.siteId,
              shiftTypeId: s.shiftTypeId,
              employeeId: s.employeeId,
            },
          };
        }),
      });

      return results;
    },
    { timeout: 30000 }
  );

  // Notify all affected employees
  const employeeIds = new Set(createdShifts.map(s => s.employeeId).filter(Boolean) as string[]);
  for (const employeeId of employeeIds) {
    await redis.xadd(`employee:stream:${employeeId}`, 'MAXLEN', '~', 100, '*', 'type', 'shift_updated');
  }

  return createdShifts;
}

export async function getExportShiftsBatch(params: { where: Prisma.ShiftWhereInput; take: number; cursor?: string }) {
  const { where, take, cursor } = params;
  return prisma.shift.findMany({
    take,
    where: { ...where, deletedAt: null },
    orderBy: { id: 'asc' },
    include: {
      site: true,
      shiftType: true,
      employee: true,
      createdBy: { select: { name: true } },
    },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });
}

export async function getActiveShifts(now: Date) {
  const LOOKAHEAD_MS = 10 * 60 * 1000; // 10 minutes
  const lookaheadDate = new Date(now.getTime() + LOOKAHEAD_MS);

  return prisma.shift.findMany({
    where: {
      status: { in: ['scheduled', 'in_progress'] },
      startsAt: { lte: lookaheadDate },
      employeeId: { not: null },
      deletedAt: null,
    },
    include: { shiftType: true, employee: true, site: true, attendance: true },
  });
}

export async function getShiftsUpdates(ids: string[]) {
  return prisma.shift.findMany({
    where: {
      id: { in: ids },
      deletedAt: null,
    },
    select: {
      id: true,
      lastHeartbeatAt: true,
      missedCount: true,
      status: true,
      attendance: true,
    },
  });
}

export async function getUpcomingShifts(now: Date, take = 50) {
  const upcomingEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return prisma.shift.findMany({
    where: {
      status: 'scheduled',
      startsAt: { gt: now, lte: upcomingEnd },
      deletedAt: null,
    },
    include: {
      shiftType: true,
      employee: true,
      site: true,
    },
    orderBy: {
      startsAt: 'asc',
    },
    take,
  });
}

/**
 * Fetches the active shift (including 5-min lead-up) and upcoming shifts for an employee.
 * Addresses soft-delete and overlap ordering.
 */
export async function getEmployeeActiveAndUpcomingShifts(employeeId: string, now: Date) {
  const LEADUP_MS = 5 * 60000;

  // Find shifts that are either currently active or starting within the next 5 minutes
  // Ordered by startsAt asc to pick the current shift first (if multiple are in range during handovers)
  const activeShift = await prisma.shift.findFirst({
    where: {
      employeeId,
      deletedAt: null,
      status: { in: ['scheduled', 'in_progress'] },
      startsAt: { lte: new Date(now.getTime() + LEADUP_MS) },
      endsAt: { gte: new Date(now.getTime() - LEADUP_MS) },
    },
    include: { site: true, shiftType: true, employee: true, attendance: true },
    orderBy: { startsAt: 'asc' },
  });

  // Find the next upcoming shifts
  const nextShifts = await prisma.shift.findMany({
    where: {
      employeeId,
      deletedAt: null,
      status: 'scheduled',
      startsAt: { gt: now },
      ...(activeShift ? { NOT: { id: activeShift.id } } : {}),
    },
    orderBy: {
      startsAt: 'asc',
    },
    take: 4,
    include: { site: true, shiftType: true, employee: true, attendance: true },
  });

  return { activeShift, nextShifts };
}

/** @deprecated Use getEmployeeActiveAndUpcomingShifts */
export const getGuardActiveAndUpcomingShifts = getEmployeeActiveAndUpcomingShifts;

export async function createMissedCheckinAlert(params: {
  shiftId: string;
  siteId: string;
  reason: 'missed_attendance' | 'missed_checkin' | 'location_services_disabled';
  windowStart: Date;
  incrementMissedCount: boolean;
}) {
  const { shiftId, siteId, reason, windowStart, incrementMissedCount } = params;

  return prisma.$transaction(async tx => {
    const newAlert = await tx.alert.create({
      data: {
        shiftId,
        siteId,
        reason,
        severity: 'critical',
        windowStart,
      },
    });

    if (incrementMissedCount) {
      await tx.shift.update({
        where: { id: shiftId },
        data: { missedCount: { increment: 1 } },
      });
    }

    return tx.alert.findUnique({
      where: { id: newAlert.id },
      include: {
        site: true,
        shift: { include: { employee: true, shiftType: true } },
      },
    });
  });
}
export async function recordHeartbeat(params: { shiftId: string; employeeId: string }) {
  const { shiftId, employeeId } = params;

  return prisma.$transaction(async tx => {
    // 1. Update Shift Heartbeat
    const updatedShift = await tx.shift.update({
      where: { id: shiftId, employeeId, deletedAt: null },
      data: { lastHeartbeatAt: new Date() },
      include: { site: true },
    });

    // 2. Auto-resolve any open 'location_services_disabled' alerts for this shift
    const openAlert = await tx.alert.findFirst({
      where: {
        shiftId,
        reason: 'location_services_disabled',
        resolvedAt: null,
      },
    });

    let resolvedAlert = null;
    if (openAlert) {
      resolvedAlert = await tx.alert.update({
        where: { id: openAlert.id },
        data: {
          resolvedAt: new Date(),
          resolutionType: 'auto',
          resolutionNote: 'Resolved by heartbeat receipt.',
        },
      });
    }

    return { updatedShift, resolvedAlert };
  });
}
