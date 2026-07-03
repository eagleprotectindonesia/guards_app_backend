import { db as prisma } from '../prisma/client';
import { Prisma } from '@prisma/client';
import { redis } from '../redis/client';
import { parseShiftTypeTimeOnDate } from '@repo/shared';
import { getShiftTypeDurationInMins } from './shift-types';
import { deleteEmployeeOnsiteDayOffsByEmployeeAndDates, upsertEmployeeOnsiteDayOff } from './onsite-day-offs';
import { isBefore } from 'date-fns';
import { reconcileApprovedOnsiteLeavesForCoverage } from './leave-requests';
import { isSecurityStandbyTitle } from './employees';

export async function getShiftById(id: string, include?: Prisma.ShiftInclude) {
  return prisma.shift.findUnique({
    where: { id, deletedAt: null },
    include: include || {
      site: {
        include: {
          posts: {
            where: {
              status: true,
              deletedAt: null,
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
      },
      escortEndSite: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
      shiftType: true,
      employee: { include: { office: { select: { name: true } } } },
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
      const shifts = await tx.shift.findMany({
        where: finalWhere,
        orderBy,
        skip,
        take,
        include: include || {
          site: { select: { name: true } },
          escortEndSite: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
          shiftType: { select: { name: true, startTime: true, endTime: true } },
          employee: { include: { office: { select: { name: true } } } },
          createdBy: { select: { name: true } },
          lastUpdatedBy: { select: { name: true } },
        },
      });
      const totalCount = await tx.shift.count({ where: finalWhere });
      return [shifts, totalCount] as const;
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

async function cancelShiftIfOverlapsApprovedLeave(params: { shiftId: string; employeeId?: string | null; adminId: string }) {
  const { shiftId, employeeId, adminId } = params;
  if (!employeeId) return;

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId, deletedAt: null },
    select: {
      id: true,
      employeeId: true,
      date: true,
      status: true,
      note: true,
    },
  });

  if (!shift || shift.status !== 'scheduled') return;

  const approvedLeave = await prisma.employeeLeaveRequest.findFirst({
    where: {
      employeeId,
      status: 'approved',
      startDate: { lte: shift.date },
      endDate: { gte: shift.date },
      employee: { role: 'on_site' },
    },
    select: {
      id: true,
    },
  });

  if (!approvedLeave) return;

  const cancellationNote = `Cancelled due to approved leave request ${approvedLeave.id}`;
  await prisma.$transaction(async tx => {
    const cancelled = await tx.shift.update({
      where: { id: shift.id },
      data: {
        status: 'cancelled',
        note: cancellationNote,
        lastUpdatedBy: { connect: { id: adminId } },
      },
    });

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'Shift',
        entityId: cancelled.id,
        actor: 'admin',
        actorId: adminId,
        details: {
          status: cancelled.status,
          note: cancelled.note,
          employeeId: cancelled.employeeId,
          cancelledByApprovedLeaveRequestId: approvedLeave.id,
        },
      },
    });
  });
}

export async function createShiftInTransaction(
  tx: Prisma.TransactionClient,
  data: Prisma.ShiftCreateInput,
  adminId: string
) {
  const createdShift = await tx.shift.create({
    data: {
      ...data,
      createdBy: { connect: { id: adminId } },
      lastUpdatedBy: { connect: { id: adminId } },
    },
    include: {
      site: true,
      escortEndSite: { select: { id: true, name: true } },
      shiftType: true,
      employee: { include: { office: { select: { name: true } } } },
    },
  });

  const emp = createdShift.employee as any;
  const endSite = createdShift.escortEndSite as any;

  await tx.changelog.create({
    data: {
      action: 'CREATE',
      entityType: 'Shift',
      entityId: createdShift.id,
      actor: 'admin',
      actorId: adminId,
      details: {
        kind: createdShift.kind,
        siteName: createdShift.site.name,
        typeName: createdShift.shiftType.name,
        employeeName: emp ? emp.fullName : 'Unassigned',
        date: createdShift.date,
        startsAt: createdShift.startsAt,
        endsAt: createdShift.endsAt,
        requiredCheckinIntervalMins: createdShift.requiredCheckinIntervalMins,
        status: createdShift.status,
        note: createdShift.note,
        siteId: createdShift.siteId,
        shiftTypeId: createdShift.shiftTypeId,
        employeeId: createdShift.employeeId,
        escortEndSiteId: createdShift.escortEndSiteId,
        escortEndSiteName: endSite ? endSite.name : undefined,
      },
    },
  });

  return createdShift;
}

export async function createShiftWithChangelog(data: Prisma.ShiftCreateInput, adminId: string) {
  const result = await prisma.$transaction(
    async tx => createShiftInTransaction(tx, data, adminId),
    { timeout: 10000 }
  );

  if (result.employeeId) {
    await cancelShiftIfOverlapsApprovedLeave({ shiftId: result.id, employeeId: result.employeeId, adminId });

    const dateKey = result.date.toISOString().slice(0, 10);
    await reconcileApprovedOnsiteLeavesForCoverage({
      employeeId: result.employeeId,
      startDateKey: dateKey,
      endDateKey: dateKey,
      adminId,
    });

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

export async function bulkCreateShiftsFromForm(
  input: {
    siteId: string;
    shiftTypeId: string;
    kind: 'onsite' | 'escort';
    escortEndSiteId?: string;
    employeeIds: string[];
    dates: string[];
    requiredCheckinIntervalMins: number;
    graceMinutes: number;
    note?: string | null;
    groupShiftIds?: Record<string, string>;
  },
  adminId: string
) {
  const results: Awaited<ReturnType<typeof createShiftInTransaction>>[] = [];

  if (input.employeeIds.length === 0) throw new Error('At least one employee is required');
  if (input.dates.length === 0) throw new Error('At least one date is required');

  const shiftType = await prisma.shiftType.findUnique({
    where: { id: input.shiftTypeId },
  });
  if (!shiftType) throw new Error('Shift type not found');

  const durationInMins = getShiftTypeDurationInMins(shiftType.startTime, shiftType.endTime);
  if (durationInMins % input.requiredCheckinIntervalMins !== 0) {
    throw new Error(`Shift duration (${durationInMins} mins) must be a multiple of check-in interval (${input.requiredCheckinIntervalMins} mins)`);
  }
  if (durationInMins < input.requiredCheckinIntervalMins) {
    throw new Error(`Shift duration (${durationInMins} mins) does not allow at least 1 check-in`);
  }

  // Pre-compute all planned shifts
  type PlannedShift = { employeeId: string; dateStr: string; startsAt: Date; endsAt: Date };
  const planned: PlannedShift[] = [];
  const seenKeys = new Set<string>();

  let minStartsAt: Date | null = null;
  let maxEndsAt: Date | null = null;

  for (const empId of input.employeeIds) {
    for (const dateStr of input.dates) {
      const pairKey = `${empId}::${dateStr}`;
      if (seenKeys.has(pairKey)) {
        throw new Error(`Duplicate employee/date pair (${empId}, ${dateStr}) in the input.`);
      }
      seenKeys.add(pairKey);

      const startDateTime = parseShiftTypeTimeOnDate(dateStr, shiftType.startTime);
      let endDateTime = parseShiftTypeTimeOnDate(dateStr, shiftType.endTime);

      if (isBefore(endDateTime, startDateTime)) {
        endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000);
      }

      if (!minStartsAt || startDateTime < minStartsAt) minStartsAt = startDateTime;
      if (!maxEndsAt || endDateTime > maxEndsAt) maxEndsAt = endDateTime;

      planned.push({ employeeId: empId, dateStr, startsAt: startDateTime, endsAt: endDateTime });
    }
  }

  // External overlap check: find existing shifts for these employees in the planned time range
  const uniqueEmployeeIds = [...new Set(planned.map(p => p.employeeId))];
  if (minStartsAt && maxEndsAt && uniqueEmployeeIds.length > 0) {
    const existingShifts = await prisma.shift.findMany({
      where: {
        deletedAt: null,
        employeeId: { in: uniqueEmployeeIds },
        startsAt: { lt: maxEndsAt },
        endsAt: { gt: minStartsAt },
      },
      select: { id: true, employeeId: true, startsAt: true, endsAt: true },
    });

    for (const plannedShift of planned) {
      const conflict = existingShifts.find(
        existing =>
          existing.employeeId === plannedShift.employeeId &&
          existing.startsAt.getTime() < plannedShift.endsAt.getTime() &&
          existing.endsAt.getTime() > plannedShift.startsAt.getTime()
      );
      if (conflict) {
        throw new Error(
          `Overlap detected: employee ${plannedShift.employeeId} already has shift ${conflict.id} during ` +
          `${plannedShift.startsAt.toISOString()} – ${plannedShift.endsAt.toISOString()}.`
        );
      }
    }
  }

  // Internal overlap check: planned shifts must not overlap each other for the same employee
  const byEmployee = new Map<string, PlannedShift[]>();
  for (const p of planned) {
    const list = byEmployee.get(p.employeeId) ?? [];
    list.push(p);
    byEmployee.set(p.employeeId, list);
  }
  for (const [, list] of byEmployee) {
    const sorted = [...list].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].endsAt.getTime() > sorted[i + 1].startsAt.getTime()) {
        throw new Error(
          `Internal overlap: the planned shifts on ${sorted[i].dateStr} and ${sorted[i + 1].dateStr} for employee ` +
          `${sorted[i].employeeId} overlap in time.`
        );
      }
    }
  }

  // Transaction: create all shifts atomically
  await prisma.$transaction(
    async tx => {
      for (const p of planned) {
        const dateObj = new Date(`${p.dateStr}T00:00:00Z`);
        const shiftData: Prisma.ShiftCreateInput = {
          site: { connect: { id: input.siteId } },
          shiftType: { connect: { id: input.shiftTypeId } },
          employee: { connect: { id: p.employeeId } },
          kind: input.kind,
          escortEndSite: input.escortEndSiteId ? { connect: { id: input.escortEndSiteId } } : undefined,
          date: dateObj,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          requiredCheckinIntervalMins: input.requiredCheckinIntervalMins,
          graceMinutes: input.graceMinutes,
          note: input.note || undefined,
          status: 'scheduled' as const,
          groupShift: input.groupShiftIds?.[p.dateStr]
            ? { connect: { id: input.groupShiftIds[p.dateStr] } }
            : undefined,
        };

        const created = await createShiftInTransaction(tx, shiftData, adminId);
        results.push(created);
      }
    },
    { timeout: 30000 }
  );

  for (const result of results) {
    if (result.employeeId) {
      try {
        await cancelShiftIfOverlapsApprovedLeave({ shiftId: result.id, employeeId: result.employeeId, adminId });

        const dateKey = result.date.toISOString().slice(0, 10);
        await reconcileApprovedOnsiteLeavesForCoverage({
          employeeId: result.employeeId,
          startDateKey: dateKey,
          endDateKey: dateKey,
          adminId,
        });

        await redis.xadd(
          `employee:stream:${result.employeeId}`,
          'MAXLEN', '~', 100, '*',
          'type', 'shift_updated', 'shiftId', result.id
        );
      } catch (err) {
        console.error(`[bulkCreateShiftsFromForm] Post-create side effect failed for shift ${result.id}:`, err);
      }
    }

    await redis.publish('events:shifts', JSON.stringify({ type: 'SHIFT_CREATED', id: result.id }));
  }

  return { created: results.length, ids: results.map(r => r.id) };
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
          escortEndSite: { select: { id: true, name: true } },
          shiftType: true,
          employee: { include: { office: { select: { name: true } } } },
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
          escortEndSite: { select: { id: true, name: true } },
          shiftType: true,
          employee: { include: { office: { select: { name: true } } } },
        },
      });

      const emp = updatedShift.employee as any;
      const prevEmp = beforeShift.employee as any;

      const updatedEmpName = emp ? emp.fullName : 'Unassigned';
      const beforeEmpName = prevEmp ? prevEmp.fullName : 'Unassigned';

      const endSite = updatedShift.escortEndSite as any;
      const prevEndSite = beforeShift.escortEndSite as any;

      // Calculate changes
      const changes: Record<string, { from: any; to: any }> = {};
      const fieldsToTrack = [
        'siteId',
        'shiftTypeId',
        'employeeId',
        'kind',
        'escortEndSiteId',
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
      const prevEndSiteName = prevEndSite ? prevEndSite.name : null;
      const endSiteName = endSite ? endSite.name : null;
      if (prevEndSiteName !== endSiteName) {
        changes['escortEndSiteName'] = { from: prevEndSiteName, to: endSiteName };
      }

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Shift',
          entityId: updatedShift.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            kind: updatedShift.kind,
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
            escortEndSiteId: updatedShift.escortEndSiteId,
            escortEndSiteName: endSite ? endSite.name : undefined,
            changes: Object.keys(changes).length > 0 ? changes : undefined,
          },
        },
      });

      return updatedShift;
    },
    { timeout: 10000 }
  );

  if (result.employeeId) {
    await cancelShiftIfOverlapsApprovedLeave({ shiftId: result.id, employeeId: result.employeeId, adminId });

    const dateKey = result.date.toISOString().slice(0, 10);
    await reconcileApprovedOnsiteLeavesForCoverage({
      employeeId: result.employeeId,
      startDateKey: dateKey,
      endDateKey: dateKey,
      adminId,
    });

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
        include: { site: true, escortEndSite: { select: { id: true, name: true } }, shiftType: true, employee: { include: { office: { select: { name: true } } } } },
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
      const endSite = shiftToDelete.escortEndSite as any;

      await tx.changelog.create({
        data: {
          action: 'DELETE',
          entityType: 'Shift',
          entityId: id,
          actor: 'admin',
          actorId: adminId,
          details: {
            kind: shiftToDelete.kind,
            siteName: shiftToDelete.site.name,
            typeName: shiftToDelete.shiftType.name,
            employeeName: emp ? emp.fullName : 'Unassigned',
            date: shiftToDelete.date,
            startsAt: shiftToDelete.startsAt,
            endsAt: shiftToDelete.endsAt,
            requiredCheckinIntervalMins: shiftToDelete.requiredCheckinIntervalMins,
            status: shiftToDelete.status,
            note: shiftToDelete.note,
            siteId: shiftToDelete.siteId,
            shiftTypeId: shiftToDelete.shiftTypeId,
            employeeId: shiftToDelete.employeeId,
            escortEndSiteId: shiftToDelete.escortEndSiteId,
            escortEndSiteName: endSite ? endSite.name : undefined,
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
export async function deleteFutureShiftsByEmployee(employeeId: string, tx: any) {
  const now = new Date();

  // Find future shifts to log them (optional but good for history)
  const futureShifts: { id: string }[] = await tx.shift.findMany({
    where: {
      employeeId,
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
    },
  });

  // Log in changelog
  await tx.changelog.create({
    data: {
      action: 'BULK_DELETE',
      entityType: 'Shift',
      entityId: `employee:${employeeId}`,
      actor: 'system',
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

export async function bulkCreateShiftsWithChangelog(shiftsToCreate: Prisma.ShiftCreateManyInput[], adminId: string) {
  const createdShifts = await prisma.$transaction(
    async tx => {
      const results = await tx.shift.createManyAndReturn({
        data: shiftsToCreate.map(s => ({ ...s, createdById: adminId, lastUpdatedById: adminId })),
        include: {
          site: { select: { name: true } },
          escortEndSite: { select: { id: true, name: true } },
          shiftType: { select: { name: true } },
          employee: { include: { office: { select: { name: true } } } },
        },
      });

      await tx.changelog.createMany({
        data: results.map(s => {
          const emp = s.employee as any;
          const endSite = s.escortEndSite as any;
          return {
            action: 'CREATE',
            entityType: 'Shift',
            entityId: s.id,
            actor: 'admin',
            actorId: adminId,
            details: {
              method: 'BULK_UPLOAD',
              kind: s.kind,
              siteName: s.site.name,
              typeName: s.shiftType.name,
              employeeName: emp ? emp.fullName : 'Unassigned',
              date: s.date,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              requiredCheckinIntervalMins: s.requiredCheckinIntervalMins,
              status: s.status,
              note: s.note,
              siteId: s.siteId,
              shiftTypeId: s.shiftTypeId,
              employeeId: s.employeeId,
              escortEndSiteId: s.escortEndSiteId,
              escortEndSiteName: endSite ? endSite.name : undefined,
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

export type GuardShiftBulkImportRowInput = {
  rowNumber: number;
  site: string;
  shiftTypeName: string;
  date: string;
  employeeCode: string;
  interval: string;
  grace: string;
  note?: string | null;
};

export type GuardShiftBulkImportSummary = {
  rows_processed: number;
  rows_failed: number;
  created: number;
  updated: number;
  deleted_off: number;
  past_dates_skipped: number;
};

export type GuardShiftBulkImportResult = {
  success: boolean;
  errors: string[];
  summary: GuardShiftBulkImportSummary;
};

type GuardBulkPlannedOp = {
  rowNumber: number;
  employeeId: string;
  startsAt: Date;
  endsAt: Date;
  updateTargetId?: string;
};

function getShiftBulkDateKey(employeeId: string, date: string) {
  return `${employeeId}:${date}`;
}

function parseDateKeyStrict(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function parseStrictInt(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return null;
  return parsed;
}

function minDateKey(keys: Set<string>) {
  return Array.from(keys).sort((a, b) => a.localeCompare(b))[0];
}

function maxDateKey(keys: Set<string>) {
  const sorted = Array.from(keys).sort((a, b) => a.localeCompare(b));
  return sorted[sorted.length - 1];
}

export async function processGuardShiftBulkImport(
  rows: GuardShiftBulkImportRowInput[],
  options?: { adminId?: string; now?: Date }
): Promise<GuardShiftBulkImportResult> {
  const errors: string[] = [];

  if (rows.length === 0) {
    return {
      success: false,
      errors: ['No data rows provided.'],
      summary: {
        rows_processed: 0,
        rows_failed: 1,
        created: 0,
        updated: 0,
        deleted_off: 0,
        past_dates_skipped: 0,
      },
    };
  }

  const uniqueSites = Array.from(new Set(rows.map(row => row.site.toLowerCase())));
  const uniqueShiftTypes = Array.from(
    new Set(rows.filter(row => row.shiftTypeName.toLowerCase() !== 'off').map(row => row.shiftTypeName.toLowerCase()))
  );
  const uniqueEmployeeCodes = Array.from(new Set(rows.map(row => row.employeeCode.toUpperCase())));
  const uniqueDates = Array.from(new Set(rows.map(row => row.date)));

  const [sites, shiftTypes, employees] = await Promise.all([
    prisma.site.findMany({
      where: { deletedAt: null, status: true },
      select: { id: true, name: true },
    }),
    prisma.shiftType.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, startTime: true, endTime: true },
    }),
    prisma.employee.findMany({
      where: {
        deletedAt: null,
        status: true,
        role: 'on_site',
        employeeNumber: { in: uniqueEmployeeCodes },
      },
      select: { id: true, employeeNumber: true },
    }),
  ]);

  const siteByName = new Map(
    sites
      .map(site => [site.name.toLowerCase(), site.id] as const)
      .filter(([name]) => uniqueSites.includes(name))
  );
  const shiftTypeByName = new Map(
    shiftTypes
      .map(shiftType => [shiftType.name.toLowerCase(), shiftType] as const)
      .filter(([name]) => uniqueShiftTypes.includes(name))
  );
  const employeeByCode = new Map(
    employees
      .filter(employee => employee.employeeNumber)
      .map(employee => [employee.employeeNumber!.toUpperCase(), employee.id] as const)
  );

  const datesAsDate = uniqueDates.map(parseDateKeyStrict).filter((date): date is Date => date !== null);

  const existingShifts = await prisma.shift.findMany({
    where: {
      deletedAt: null,
      employeeId: { in: Array.from(employeeByCode.values()) },
      date: { in: datesAsDate },
    },
    select: {
      id: true,
      employeeId: true,
      date: true,
      requiredCheckinIntervalMins: true,
      graceMinutes: true,
    },
  });

  const existingByKey = new Map<string, typeof existingShifts>();
  for (const shift of existingShifts) {
    const key = getShiftBulkDateKey(shift.employeeId!, shift.date.toISOString().slice(0, 10));
    const current = existingByKey.get(key) ?? [];
    current.push(shift);
    existingByKey.set(key, current);
  }

  const seenKeys = new Set<string>();
  const now = options?.now ?? new Date();
  const nowDateKey = now.toISOString().slice(0, 10);
  const createInputs: Prisma.ShiftCreateManyInput[] = [];
  const updates: Array<{
    id: string;
    employeeId: string;
    siteId: string;
    shiftTypeId: string;
    date: Date;
    startsAt: Date;
    endsAt: Date;
    requiredCheckinIntervalMins: number;
    graceMinutes: number;
    note: string | null;
  }> = [];
  const deleteIds = new Set<string>();
  const offDateKeysByEmployee = new Map<string, Set<string>>();
  const workingDateKeysByEmployee = new Map<string, Set<string>>();
  let rowsProcessed = 0;
  let pastDatesSkipped = 0;
  const plannedOps: GuardBulkPlannedOp[] = [];

  for (const row of rows) {
    const siteId = siteByName.get(row.site.toLowerCase());
    if (!siteId) {
      errors.push(`Row ${row.rowNumber}: site '${row.site}' not found.`);
      continue;
    }

    const rowDate = parseDateKeyStrict(row.date);
    if (!rowDate) {
      errors.push(`Row ${row.rowNumber}: invalid date '${row.date}'. Expected YYYY-MM-DD.`);
      continue;
    }

    const employeeId = employeeByCode.get(row.employeeCode.toUpperCase());
    if (!employeeId) {
      errors.push(`Row ${row.rowNumber}: employee_code '${row.employeeCode}' not found.`);
      continue;
    }

    const rowKey = getShiftBulkDateKey(employeeId, row.date);
    if (seenKeys.has(rowKey)) {
      errors.push(`Row ${row.rowNumber}: duplicate employee/date pair in CSV (${row.employeeCode}, ${row.date}).`);
      continue;
    }
    seenKeys.add(rowKey);

    const existingForKey = existingByKey.get(rowKey) ?? [];
    if (row.shiftTypeName.toLowerCase() === 'off') {
      if (row.date < nowDateKey) {
        pastDatesSkipped++;
        continue;
      }
      existingForKey.forEach(shift => deleteIds.add(shift.id));
      const existing = offDateKeysByEmployee.get(employeeId) ?? new Set<string>();
      existing.add(row.date);
      offDateKeysByEmployee.set(employeeId, existing);
      rowsProcessed++;
      continue;
    }

    const shiftType = shiftTypeByName.get(row.shiftTypeName.toLowerCase());
    if (!shiftType) {
      errors.push(`Row ${row.rowNumber}: shift_type_name '${row.shiftTypeName}' not found.`);
      continue;
    }

    const interval = parseStrictInt(row.interval);
    const grace = parseStrictInt(row.grace);
    if (interval === null || interval <= 0) {
      errors.push(`Row ${row.rowNumber}: interval '${row.interval}' must be a positive integer.`);
      continue;
    }
    if (grace === null || grace < 0) {
      errors.push(`Row ${row.rowNumber}: grace '${row.grace}' must be a non-negative integer.`);
      continue;
    }

    const startsAt = parseShiftTypeTimeOnDate(row.date, shiftType.startTime);
    let endsAt = parseShiftTypeTimeOnDate(row.date, shiftType.endTime);
    if (endsAt.getTime() < startsAt.getTime()) {
      endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
    }

    if (startsAt.getTime() < now.getTime()) {
      pastDatesSkipped++;
      continue;
    }

    if (existingForKey.length > 1) {
      errors.push(
        `Row ${row.rowNumber}: multiple existing shifts found for employee '${row.employeeCode}' on ${row.date}; cannot upsert safely.`
      );
      continue;
    }

    if (existingForKey.length === 0) {
      const durationInMins = getShiftTypeDurationInMins(shiftType.startTime, shiftType.endTime);
      if (durationInMins % interval !== 0) {
        errors.push(
          `Row ${row.rowNumber}: shift duration (${durationInMins} mins) must be a multiple of interval (${interval} mins).`
        );
        continue;
      }
      if (durationInMins < interval) {
        errors.push(
          `Row ${row.rowNumber}: shift duration (${durationInMins} mins) must allow at least 1 check-in slot for interval ${interval}.`
        );
        continue;
      }

      createInputs.push({
        siteId,
        shiftTypeId: shiftType.id,
        employeeId,
        date: rowDate,
        startsAt,
        endsAt,
        requiredCheckinIntervalMins: interval,
        graceMinutes: grace,
        status: 'scheduled',
        note: row.note ?? null,
      });
      const existing = workingDateKeysByEmployee.get(employeeId) ?? new Set<string>();
      existing.add(row.date);
      workingDateKeysByEmployee.set(employeeId, existing);
      plannedOps.push({
        rowNumber: row.rowNumber,
        employeeId,
        startsAt,
        endsAt,
      });
      rowsProcessed++;
      continue;
    }

    const existingShift = existingForKey[0];
    updates.push({
      id: existingShift.id,
      employeeId,
      siteId,
      shiftTypeId: shiftType.id,
      date: rowDate,
      startsAt,
      endsAt,
      note: row.note ?? null,
      requiredCheckinIntervalMins: interval,
      graceMinutes: grace,
    });
    const existing = workingDateKeysByEmployee.get(employeeId) ?? new Set<string>();
    existing.add(row.date);
    workingDateKeysByEmployee.set(employeeId, existing);
    plannedOps.push({
      rowNumber: row.rowNumber,
      employeeId,
      startsAt,
      endsAt,
      updateTargetId: existingShift.id,
    });
    rowsProcessed++;
  }

  if (plannedOps.length > 0) {
    const employeeIds = Array.from(new Set(plannedOps.map(op => op.employeeId)));
    const minStartsAt = new Date(Math.min(...plannedOps.map(op => op.startsAt.getTime())));
    const maxEndsAt = new Date(Math.max(...plannedOps.map(op => op.endsAt.getTime())));

    const overlapCandidates = await prisma.shift.findMany({
      where: {
        deletedAt: null,
        employeeId: { in: employeeIds },
        startsAt: { lt: maxEndsAt },
        endsAt: { gt: minStartsAt },
      },
      select: {
        id: true,
        employeeId: true,
        startsAt: true,
        endsAt: true,
      },
    });

    const candidatesByEmployee = new Map<string, typeof overlapCandidates>();
    for (const shift of overlapCandidates) {
      const current = candidatesByEmployee.get(shift.employeeId!) ?? [];
      current.push(shift);
      candidatesByEmployee.set(shift.employeeId!, current);
    }

    for (const op of plannedOps) {
      const existingForEmployee = candidatesByEmployee.get(op.employeeId) ?? [];
      const conflict = existingForEmployee.find(shift => {
        if (op.updateTargetId && shift.id === op.updateTargetId) return false;
        if (deleteIds.has(shift.id)) return false;
        return shift.startsAt.getTime() < op.endsAt.getTime() && shift.endsAt.getTime() > op.startsAt.getTime();
      });

      if (conflict) {
        errors.push(
          `Row ${op.rowNumber}: overlaps existing shift (${conflict.id}) for this employee during ${op.startsAt.toISOString()} - ${op.endsAt.toISOString()}.`
        );
      }
    }

    const plannedByEmployee = new Map<string, GuardBulkPlannedOp[]>();
    for (const op of plannedOps) {
      const current = plannedByEmployee.get(op.employeeId) ?? [];
      current.push(op);
      plannedByEmployee.set(op.employeeId, current);
    }

    for (const employeeOps of plannedByEmployee.values()) {
      const sorted = [...employeeOps].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          if (sorted[j].startsAt.getTime() >= sorted[i].endsAt.getTime()) break;
          if (sorted[j].endsAt.getTime() > sorted[i].startsAt.getTime()) {
            errors.push(
              `Row ${sorted[i].rowNumber} and Row ${sorted[j].rowNumber}: overlapping shifts in the same import for this employee.`
            );
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
      summary: {
        rows_processed: rowsProcessed,
        rows_failed: errors.length,
        created: 0,
        updated: 0,
        deleted_off: 0,
        past_dates_skipped: pastDatesSkipped,
      },
    };
  }

  let created = 0;
  let updated = 0;
  let deletedOff = 0;
  const adminId = options?.adminId;

  if (adminId) {
    const deletedNotificationTargets: Array<{ shiftId: string; employeeId?: string | null }> = [];
    const updatedNotificationTargets: Array<{ shiftId: string; employeeId?: string | null }> = [];
    const createdNotificationTargets: Array<{ shiftId: string; employeeId?: string | null }> = [];

    await prisma.$transaction(async tx => {
      const employeeIdsToLock = Array.from(
        new Set([...offDateKeysByEmployee.keys(), ...workingDateKeysByEmployee.keys()])
      ).sort((a, b) => a.localeCompare(b));
      if (employeeIdsToLock.length > 0) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM employees WHERE id IN (${Prisma.join(employeeIdsToLock)}) ORDER BY id FOR UPDATE`
        );
      }

      if (deleteIds.size > 0) {
        const shiftsToDelete = await tx.shift.findMany({
          where: { id: { in: Array.from(deleteIds) }, deletedAt: null },
          include: { site: true, escortEndSite: { select: { id: true, name: true } }, shiftType: true, employee: { include: { office: { select: { name: true } } } } },
        });

        if (shiftsToDelete.length > 0) {
          const nowDeletedAt = new Date();
          await tx.shift.updateMany({
            where: { id: { in: shiftsToDelete.map(shift => shift.id) }, deletedAt: null },
            data: { deletedAt: nowDeletedAt, lastUpdatedById: adminId },
          });

          await tx.changelog.createMany({
            data: shiftsToDelete.map(shift => {
              const emp = shift.employee as any;
              const endSite = shift.escortEndSite as any;
              return {
                action: 'DELETE',
                entityType: 'Shift',
                entityId: shift.id,
                actor: 'admin',
                actorId: adminId,
                details: {
                  kind: shift.kind,
                  siteName: shift.site.name,
                  typeName: shift.shiftType.name,
                  employeeName: emp ? emp.fullName : 'Unassigned',
                  date: shift.date,
                  startsAt: shift.startsAt,
                  endsAt: shift.endsAt,
                  requiredCheckinIntervalMins: shift.requiredCheckinIntervalMins,
                  status: shift.status,
                  note: shift.note,
                  siteId: shift.siteId,
                  shiftTypeId: shift.shiftTypeId,
                  employeeId: shift.employeeId,
                  escortEndSiteId: shift.escortEndSiteId,
                  escortEndSiteName: endSite ? endSite.name : undefined,
                  deletedAt: nowDeletedAt,
                },
              };
            }),
          });
        }

        deletedOff = shiftsToDelete.length;
        deletedNotificationTargets.push(
          ...shiftsToDelete.map(shift => ({
            shiftId: shift.id,
            employeeId: shift.employeeId,
          }))
        );
      }

      for (const [employeeId, dates] of offDateKeysByEmployee.entries()) {
        for (const dateKey of dates) {
          await upsertEmployeeOnsiteDayOff(
            {
              employeeId,
              date: dateKey,
              adminId,
              note: 'OFF from guard bulk import',
            },
            tx
          );
        }
      }

      for (const update of updates) {
        const beforeShift = await tx.shift.findUnique({
          where: { id: update.id, deletedAt: null },
          include: {
            site: true,
            escortEndSite: { select: { id: true, name: true } },
            shiftType: true,
            employee: { include: { office: { select: { name: true } } } },
          },
        });
        if (!beforeShift) continue;

        const updatedShift = await tx.shift.update({
          where: { id: update.id, deletedAt: null },
          data: {
            site: { connect: { id: update.siteId } },
            shiftType: { connect: { id: update.shiftTypeId } },
            employee: { connect: { id: update.employeeId } },
            date: update.date,
            startsAt: update.startsAt,
            endsAt: update.endsAt,
            requiredCheckinIntervalMins: update.requiredCheckinIntervalMins,
            graceMinutes: update.graceMinutes,
            note: update.note,
            status: 'scheduled',
            groupShift: { disconnect: true },
            lastUpdatedBy: { connect: { id: adminId } },
          },
          include: {
            site: true,
            escortEndSite: { select: { id: true, name: true } },
            shiftType: true,
            employee: { include: { office: { select: { name: true } } } },
          },
        });

        if (beforeShift.groupShiftId && updatedShift.employeeId) {
          const gc = await tx.groupChat.findUnique({
            where: { groupShiftId: beforeShift.groupShiftId },
            include: { participants: { where: { status: 'active' } } },
          });
          if (gc) {
            const participant = gc.participants.find(
              p => p.employeeId === updatedShift.employeeId
            );
            if (participant) {
              await tx.groupChatParticipant.update({
                where: { id: participant.id },
                data: { status: 'removed', removedAt: new Date() },
              });
            }
          }
        }

        const emp = updatedShift.employee as any;
        const prevEmp = beforeShift.employee as any;
        const endSite = updatedShift.escortEndSite as any;
        const prevEndSite = beforeShift.escortEndSite as any;
        const updatedEmpName = emp ? emp.fullName : 'Unassigned';
        const beforeEmpName = prevEmp ? prevEmp.fullName : 'Unassigned';
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
          'groupShiftId',
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
              kind: updatedShift.kind,
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
              escortEndSiteId: updatedShift.escortEndSiteId,
              escortEndSiteName: endSite ? endSite.name : undefined,
              changes: Object.keys(changes).length > 0 ? changes : undefined,
            },
          },
        });

        updatedNotificationTargets.push({
          shiftId: updatedShift.id,
          employeeId: updatedShift.employeeId,
        });
        updated++;
      }

      for (const [employeeId, dates] of workingDateKeysByEmployee.entries()) {
        await deleteEmployeeOnsiteDayOffsByEmployeeAndDates(employeeId, Array.from(dates), tx);
      }

      if (createInputs.length > 0) {
        const createdRows = await tx.shift.createManyAndReturn({
          data: createInputs.map(row => ({ ...row, createdById: adminId, lastUpdatedById: adminId })),
          include: {
            site: { select: { name: true } },
            escortEndSite: { select: { id: true, name: true } },
            shiftType: { select: { name: true } },
            employee: { include: { office: { select: { name: true } } } },
          },
        });

        await tx.changelog.createMany({
          data: createdRows.map(shift => {
            const emp = shift.employee as any;
            const endSite = shift.escortEndSite as any;
            return {
              action: 'CREATE',
              entityType: 'Shift',
              entityId: shift.id,
              actor: 'admin',
              actorId: adminId,
              details: {
                method: 'BULK_UPLOAD',
                kind: shift.kind,
                siteName: shift.site.name,
                typeName: shift.shiftType.name,
                employeeName: emp ? emp.fullName : 'Unassigned',
                date: shift.date,
                startsAt: shift.startsAt,
                endsAt: shift.endsAt,
                requiredCheckinIntervalMins: shift.requiredCheckinIntervalMins,
                status: shift.status,
                note: shift.note,
                siteId: shift.siteId,
                shiftTypeId: shift.shiftTypeId,
                employeeId: shift.employeeId,
                escortEndSiteId: shift.escortEndSiteId,
                escortEndSiteName: endSite ? endSite.name : undefined,
              },
            };
          }),
        });

        created = createdRows.length;
        createdNotificationTargets.push(
          ...createdRows.map(shift => ({
            shiftId: shift.id,
            employeeId: shift.employeeId,
          }))
        );
      }
    });

    try {
      for (const target of deletedNotificationTargets) {
        if (target.employeeId) {
          await redis.xadd(
            `employee:stream:${target.employeeId}`,
            'MAXLEN',
            '~',
            100,
            '*',
            'type',
            'shift_updated',
            'shiftId',
            target.shiftId
          );
        }
        await redis.publish('events:shifts', JSON.stringify({ type: 'SHIFT_DELETED', id: target.shiftId }));
      }

      for (const target of updatedNotificationTargets) {
        if (target.employeeId) {
          await redis.xadd(
            `employee:stream:${target.employeeId}`,
            'MAXLEN',
            '~',
            100,
            '*',
            'type',
            'shift_updated',
            'shiftId',
            target.shiftId
          );
        }
        await redis.publish('events:shifts', JSON.stringify({ type: 'SHIFT_UPDATED', id: target.shiftId }));
      }

      for (const target of createdNotificationTargets) {
        if (target.employeeId) {
          await redis.xadd(
            `employee:stream:${target.employeeId}`,
            'MAXLEN',
            '~',
            100,
            '*',
            'type',
            'shift_updated',
            'shiftId',
            target.shiftId
          );
        }
        await redis.publish('events:shifts', JSON.stringify({ type: 'SHIFT_CREATED', id: target.shiftId }));
      }
    } catch (notificationError) {
      console.warn('[processGuardShiftBulkImport] committed DB changes, but failed to publish notifications.', notificationError);
    }
  } else {
    const nowDeletedAt = new Date();
    await prisma.$transaction(async tx => {
      if (deleteIds.size > 0) {
        const deletedResult = await tx.shift.updateMany({
          where: { id: { in: Array.from(deleteIds) }, deletedAt: null },
          data: { deletedAt: nowDeletedAt, status: 'cancelled' },
        });
        deletedOff = deletedResult.count;
      }

      for (const [employeeId, dates] of offDateKeysByEmployee.entries()) {
        for (const dateKey of dates) {
          await upsertEmployeeOnsiteDayOff(
            {
              employeeId,
              date: dateKey,
              note: 'OFF from guard bulk import',
            },
            tx
          );
        }
      }

      for (const update of updates) {
        await tx.shift.update({
          where: { id: update.id },
          data: {
            site: { connect: { id: update.siteId } },
            shiftType: { connect: { id: update.shiftTypeId } },
            employee: { connect: { id: update.employeeId } },
            date: update.date,
            startsAt: update.startsAt,
            endsAt: update.endsAt,
            status: 'scheduled',
            note: update.note,
            requiredCheckinIntervalMins: update.requiredCheckinIntervalMins,
            graceMinutes: update.graceMinutes,
          },
        });
        updated++;
      }

      for (const [employeeId, dates] of workingDateKeysByEmployee.entries()) {
        await deleteEmployeeOnsiteDayOffsByEmployeeAndDates(employeeId, Array.from(dates), tx);
      }

      if (createInputs.length > 0) {
        const createdResult = await tx.shift.createMany({ data: createInputs });
        created = createdResult.count;
      }
    });
  }

  const affectedDatesByEmployee = new Map<string, Set<string>>();
  for (const [employeeId, dates] of offDateKeysByEmployee.entries()) {
    const existing = affectedDatesByEmployee.get(employeeId) ?? new Set<string>();
    for (const dateKey of dates) existing.add(dateKey);
    affectedDatesByEmployee.set(employeeId, existing);
  }
  for (const [employeeId, dates] of workingDateKeysByEmployee.entries()) {
    const existing = affectedDatesByEmployee.get(employeeId) ?? new Set<string>();
    for (const dateKey of dates) existing.add(dateKey);
    affectedDatesByEmployee.set(employeeId, existing);
  }
  for (const [employeeId, dates] of affectedDatesByEmployee.entries()) {
    const startDateKey = minDateKey(dates);
    const endDateKey = maxDateKey(dates);
    if (!startDateKey || !endDateKey) continue;
    await reconcileApprovedOnsiteLeavesForCoverage({
      employeeId,
      startDateKey,
      endDateKey,
      adminId,
    });
  }

  return {
    success: true,
    errors: [],
    summary: {
      rows_processed: rowsProcessed,
      rows_failed: 0,
      created,
      updated,
      deleted_off: deletedOff,
      past_dates_skipped: pastDatesSkipped,
    },
  };
}

export async function getExportShiftsBatch(params: { where: Prisma.ShiftWhereInput; take: number; cursor?: string }) {
  const { where, take, cursor } = params;
  return prisma.shift.findMany({
    take,
    where: { ...where, deletedAt: null },
    orderBy: { id: 'asc' },
    include: {
      site: true,
      escortEndSite: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
      shiftType: true,
      employee: { include: { office: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });
}

export async function getActiveShifts(now: Date) {
  const LOOKAHEAD_MS = 10 * 60 * 1000; // 10 minutes
  const MISSED_WINDOW_MS = 8 * 60 * 60 * 1000; // 8 hours
  const lookaheadDate = new Date(now.getTime() + LOOKAHEAD_MS);
  const missedCutoff = new Date(now.getTime() - MISSED_WINDOW_MS);
  const nowMs = now.getTime();

  const shifts = await prisma.shift.findMany({
    where: {
      deletedAt: null,
      employeeId: { not: null },
      OR: [
        {
          status: 'scheduled',
          startsAt: { lte: lookaheadDate },
          endsAt: { gt: now },
        },
        {
          status: 'in_progress',
        },
        {
          status: 'missed',
          endsAt: { gte: missedCutoff },
        },
      ],
    },
    include: {
      shiftType: true,
      employee: { include: { office: { select: { name: true } } } },
      site: true,
      escortEndSite: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
      attendance: true,
    },
  });

  return shifts.filter(shift => {
    if (shift.status === 'scheduled') return true;
    if (shift.status === 'missed') return true;
    if (shift.status !== 'in_progress') return false;
    const cutoffMs = shift.endsAt.getTime() + shift.graceMinutes * 60000;
    return nowMs < cutoffMs;
  });
}

/**
 * Transitions 'scheduled' shifts that have reached their 'endsAt' time to 'missed' status.
 * Also auto-resolves any open alerts for these shifts.
 */
export async function markOverdueScheduledShiftsAsMissed(now: Date, batchSize = 200) {
  return prisma.$transaction(
    async tx => {
      // 1. Select a batch of candidate shifts
      const overdueShifts = await tx.shift.findMany({
        where: {
          status: 'scheduled',
          endsAt: { lte: now },
          deletedAt: null,
          employeeId: { not: null },
        },
        select: { id: true, siteId: true },
        orderBy: { endsAt: 'asc' },
        take: batchSize,
      });

      if (overdueShifts.length === 0) {
        return { updatedShiftIds: [], resolvedAlerts: [] };
      }

      const shiftIds = overdueShifts.map(s => s.id);

      // 2. Update selected shifts to status = 'missed'
      await tx.shift.updateMany({
        where: { id: { in: shiftIds } },
        data: { status: 'missed' },
      });

      // 3. Resolve open related alerts for those shift IDs
      const resolvedAlerts = await tx.alert.updateManyAndReturn({
        where: {
          shiftId: { in: shiftIds },
          resolvedAt: null,
        },
        data: {
          resolvedAt: now,
          resolutionType: 'auto',
          resolutionNote: 'Auto-resolved: shift ended without attendance/check-in (status moved to missed)',
        },
        include: {
          site: true,
          shift: { include: { employee: { include: { office: { select: { name: true } } } }, shiftType: true } },
        },
      });

      return {
        updatedShiftIds: shiftIds,
        resolvedAlerts,
      };
    },
    { timeout: 15000 }
  );
}

/**
 * Transitions 'in_progress' shifts that have ended at least `thresholdMins` ago to 'completed' status.
 * Also auto-resolves any open alerts for these shifts.
 */
export async function autoCompleteOverdueInProgressShifts(
  now: Date,
  thresholdMins = 60,
  batchSize = 200
) {
  const thresholdMs = thresholdMins * 60000;
  const cutoff = new Date(now.getTime() - thresholdMs);

  return prisma.$transaction(
    async tx => {
      // 1. Select a batch of candidate shifts
      const overdueShifts = await tx.shift.findMany({
        where: {
          status: 'in_progress',
          endsAt: { lte: cutoff },
          deletedAt: null,
          employeeId: { not: null },
        },
        select: { id: true, siteId: true },
        orderBy: { endsAt: 'asc' },
        take: batchSize,
      });

      if (overdueShifts.length === 0) {
        return { updatedShiftIds: [], resolvedAlerts: [] };
      }

      const shiftIds = overdueShifts.map(s => s.id);

      // 2. Update selected shifts to status = 'completed'
      await tx.shift.updateMany({
        where: { id: { in: shiftIds } },
        data: { status: 'completed' },
      });

      // 3. Resolve open related alerts for those shift IDs
      const resolvedAlerts = await tx.alert.updateManyAndReturn({
        where: {
          shiftId: { in: shiftIds },
          resolvedAt: null,
        },
        data: {
          resolvedAt: now,
          resolutionType: 'auto',
          resolutionNote: `Auto-resolved: shift ended and was auto-completed ${thresholdMins} minutes past end time`,
        },
        include: {
          site: true,
          shift: { include: { employee: { include: { office: { select: { name: true } } } }, shiftType: true } },
        },
      });

      return {
        updatedShiftIds: shiftIds,
        resolvedAlerts,
      };
    },
    { timeout: 15000 }
  );
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
      employee: { include: { office: { select: { name: true } } } },
      site: true,
      escortEndSite: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
    },
    orderBy: {
      startsAt: 'asc',
    },
    take,
  });
}

/**
 * Fetches the active shift (including 30-min lead-up) and upcoming shifts for an employee.
 * Addresses soft-delete and overlap ordering.
 */
export async function getEmployeeActiveAndUpcomingShifts(employeeId: string, now: Date) {
  const LEADUP_MS = 30 * 60000;

  // Find shifts that are either currently active or starting within the next 30 minutes
  // Ordered by startsAt asc to pick the current shift first (if multiple are in range during handovers)
  const activeShift = await prisma.shift.findFirst({
    where: {
      employeeId,
      deletedAt: null,
      OR: [
        {
          // For scheduled shifts, we only show them if they are current (within 30 min buffer)
          status: 'scheduled',
          startsAt: { lte: new Date(now.getTime() + LEADUP_MS) },
          endsAt: { gte: new Date(now.getTime() - LEADUP_MS) },
        },
        {
          // For in_progress shifts, we show them regardless of end time (to allow late check-ins)
          status: 'in_progress',
        },
      ],
    },
    include: {
      site: true,
      escortEndSite: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
      shiftType: true,
      employee: { include: { office: { select: { name: true } } } },
      attendance: true,
    },
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
    include: {
      site: true,
      escortEndSite: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
      shiftType: true,
      employee: { include: { office: { select: { name: true } } } },
      attendance: true,
    },
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
        shift: { include: { employee: { include: { office: { select: { name: true } } } }, shiftType: true } },
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
      data: { lastDeviceHeartbeatAt: new Date() },
      include: { site: true },
    });

    // 2. Auto-resolve ALL open 'location_services_disabled' alerts for this shift
    const resolvedAlerts = await tx.alert.updateManyAndReturn({
      where: {
        shiftId,
        reason: 'location_services_disabled',
        resolvedAt: null,
      },
      data: {
        resolvedAt: new Date(),
        resolutionType: 'auto',
        resolutionNote: 'Resolved by heartbeat receipt.',
      },
    });

    return { updatedShift, resolvedAlerts };
  });
}

/**
 * Cancels all in-progress shifts for a deactivated employee.
 * Also resolves all open alerts for those shifts.
 */
export async function cancelInProgressShiftsForDeactivatedEmployee(employeeId: string, tx: any) {
  const now = new Date();

  // Find in-progress shifts for this employee
  const inProgressShifts = await tx.shift.findMany({
    where: {
      employeeId,
      status: 'in_progress',
      deletedAt: null,
    },
    select: { id: true },
  });

  if (inProgressShifts.length === 0) return { cancelledCount: 0, resolvedAlertsCount: 0 };

  const shiftIds = inProgressShifts.map((s: { id: string }) => s.id);

  // Cancel the shifts
  await tx.shift.updateMany({
    where: {
      id: { in: shiftIds },
    },
    data: {
      status: 'cancelled',
      deletedAt: now,
    },
  });

  // Resolve all open alerts for these shifts
  const resolvedAlertsResult = await tx.alert.updateMany({
    where: {
      shiftId: { in: shiftIds },
      resolvedAt: null,
    },
    data: {
      resolvedAt: now,
      resolutionType: 'auto',
      resolutionNote: 'Auto-resolved: Employee deactivated, shift cancelled.',
    },
  });

  // Log in changelog
  await tx.changelog.create({
    data: {
      action: 'BULK_CANCEL',
      entityType: 'Shift',
      entityId: `employee:${employeeId}`,
      actor: 'system',
      actorId: null,
      details: {
        reason: 'EMPLOYEE_DEACTIVATED',
        count: shiftIds.length,
        shiftIds,
        resolvedAlertsCount: resolvedAlertsResult.count,
      },
    },
  });

  return {
    cancelledCount: shiftIds.length,
    resolvedAlertsCount: resolvedAlertsResult.count,
  };
}

/**
 * Gets active shifts for the admin dashboard.
 * Returns shifts grouped by site with their associated data.
 */
export async function getActiveShiftsForDashboard(now: Date) {
  const LOOKAHEAD_MS = 10 * 60 * 1000; // 10 minutes
  const lookaheadDate = new Date(now.getTime() + LOOKAHEAD_MS);
  const nowMs = now.getTime();

  const shifts = await prisma.shift.findMany({
    where: {
      deletedAt: null,
      employeeId: { not: null },
      OR: [
        {
          status: 'scheduled',
          startsAt: { lte: lookaheadDate },
          endsAt: { gt: now },
        },
        {
          status: 'in_progress',
        },
      ],
    },
    include: {
      shiftType: true,
      employee: { include: { office: { select: { name: true } } } },
      site: true,
      escortEndSite: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
      attendance: true,
      checkins: { orderBy: { at: 'desc' }, take: 1 },
    },
  });

  return shifts.filter(shift => {
    if (shift.status === 'scheduled') return true;
    if (shift.status !== 'in_progress') return false;
    const cutoffMs = shift.endsAt.getTime() + shift.graceMinutes * 60000;
    return nowMs < cutoffMs;
  });
}

/**
 * Gets upcoming shifts for the admin dashboard (next 24 hours).
 */
export async function getUpcomingShiftsForDashboard(now: Date, take = 50) {
  return getUpcomingShifts(now, take);
}

export type ShiftOverviewForDashboard = {
  dateKey: string;
  onDuty: number;
  onDutySiteGuards: number;
  onDutyPatrol: number;
  upcoming: number;
  completed: number;
  absent: number;
  absentSiteGuards: number;
  absentPatrol: number;
  carryoverOnDuty: number;
  total: number;
  lastUpdatedAt: string;
};

export async function getShiftOverviewForDashboard(now: Date): Promise<ShiftOverviewForDashboard> {
  const dateKey = now.toISOString().slice(0, 10);
  const dayStart = new Date(`${dateKey}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [todayShifts, activeShifts] = await Promise.all([
    prisma.shift.findMany({
      where: {
        deletedAt: null,
        employeeId: { not: null },
        date: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      select: {
        id: true,
        status: true,
        startsAt: true,
        employee: {
          select: {
            jobTitle: true,
          },
        },
      },
    }),
    getActiveShiftsForDashboard(now),
  ]);

  const activeIds = new Set(activeShifts.map(shift => shift.id));

  let upcoming = 0;
  let completed = 0;
  let absent = 0;
  let absentSiteGuards = 0;
  let absentPatrol = 0;
  for (const shift of todayShifts) {
    if (activeIds.has(shift.id)) {
      continue;
    }
    if (shift.status === 'scheduled' && shift.startsAt > now) {
      upcoming += 1;
      continue;
    }
    if (shift.status === 'completed') {
      completed += 1;
      continue;
    }
    if (shift.status === 'missed') {
      absent += 1;
      if (isSecurityStandbyTitle(shift.employee?.jobTitle)) {
        absentSiteGuards += 1;
      } else {
        absentPatrol += 1;
      }
    }
  }

  let onDuty = 0;
  let onDutySiteGuards = 0;
  let onDutyPatrol = 0;
  let carryoverOnDuty = 0;
  for (const shift of activeShifts) {
    if (!(shift.attendance && shift.attendance.status !== 'absent')) {
      continue;
    }
    const shiftDateKey = shift.date.toISOString().slice(0, 10);
    onDuty += 1;
    if (isSecurityStandbyTitle(shift.employee?.jobTitle)) {
      onDutySiteGuards += 1;
    } else {
      onDutyPatrol += 1;
    }
    if (shiftDateKey < dateKey) {
      carryoverOnDuty += 1;
    }
  }

  return {
    dateKey,
    onDuty,
    onDutySiteGuards,
    onDutyPatrol,
    upcoming,
    completed,
    absent,
    absentSiteGuards,
    absentPatrol,
    carryoverOnDuty,
    total: onDuty + upcoming + completed + absent,
    lastUpdatedAt: new Date().toISOString(),
  };
}

const DELETE_BATCH_SIZE = 500;

export async function deleteOldShiftsAndRelated(olderThan: Date) {
  let shifts = 0;
  let checkins = 0;
  let alerts = 0;
  let attendances = 0;
  let photoReports = 0;
  let changelogs = 0;
  const s3Keys = new Set<string>();

  while (true) {
    const batch = await prisma.shift.findMany({
      where: { endsAt: { lt: olderThan } },
      select: { id: true },
      take: DELETE_BATCH_SIZE,
      orderBy: { endsAt: 'asc' },
    });

    if (batch.length === 0) break;
    const shiftIds = batch.map(s => s.id);

    await prisma.$transaction(async tx => {
      const attRows = await tx.attendance.findMany({
        where: { shiftId: { in: shiftIds } },
        select: { id: true, picture: true },
      });
      for (const a of attRows) {
        if (a.picture && !a.picture.startsWith('http')) s3Keys.add(a.picture);
      }
      if (attRows.length > 0) {
        const { count } = await tx.attendance.deleteMany({
          where: { id: { in: attRows.map(a => a.id) } },
        });
        attendances += count;
      }

      const prRows = await tx.shiftPhotoReport.findMany({
        where: { shiftId: { in: shiftIds } },
        select: { id: true, pdfS3Key: true },
      });
      for (const r of prRows) {
        if (r.pdfS3Key) s3Keys.add(r.pdfS3Key);
      }
      if (prRows.length > 0) {
        await tx.shift.updateMany({
          where: { id: { in: shiftIds }, lastAutoPhotoReportId: { not: null } },
          data: { lastAutoPhotoReportId: null, lastAutoPhotoReportAt: null },
        });
        const { count } = await tx.shiftPhotoReport.deleteMany({
          where: { id: { in: prRows.map(r => r.id) } },
        });
        photoReports += count;
      }

      const { count: ckCount } = await tx.checkin.deleteMany({
        where: { shiftId: { in: shiftIds } },
      });
      checkins += ckCount;

      const { count: alCount } = await tx.alert.deleteMany({
        where: { shiftId: { in: shiftIds } },
      });
      alerts += alCount;

      const { count: clCount } = await tx.changelog.deleteMany({
        where: { entityType: 'Shift', entityId: { in: shiftIds } },
      });
      changelogs += clCount;

      const { count: shCount } = await tx.shift.deleteMany({
        where: { id: { in: shiftIds } },
      });
      shifts += shCount;
    });
  }

  return { shifts, checkins, alerts, attendances, photoReports, changelogs, s3Keys: Array.from(s3Keys) };
}

export async function departShift(shiftId: string, employeeId: string) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId, deletedAt: null } });
  if (!shift) throw new Error('Shift not found');
  if (shift.employeeId !== employeeId) throw new Error('Not assigned to this shift');
  if (shift.status !== 'in_progress') throw new Error('Shift is not in progress');
  if (shift.departedAt) throw new Error('Already departed');
  if (shift.kind !== 'escort') throw new Error('Only escort shifts can depart');

  return prisma.shift.update({
    where: { id: shiftId },
    data: { departedAt: new Date() },
  });
}

export async function arriveShift(shiftId: string, employeeId: string) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId, deletedAt: null } });
  if (!shift) throw new Error('Shift not found');
  if (shift.employeeId !== employeeId) throw new Error('Not assigned to this shift');
  if (shift.status !== 'in_progress') throw new Error('Shift is not in progress');
  if (!shift.departedAt) throw new Error('Must depart before arriving');
  if (shift.arrivedAt) throw new Error('Already arrived');
  if (shift.kind !== 'escort') throw new Error('Only escort shifts can arrive');

  return prisma.shift.update({
    where: { id: shiftId },
    data: { arrivedAt: new Date() },
  });
}

export async function completeShift(shiftId: string, employeeId: string) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId, deletedAt: null } });
  if (!shift) throw new Error('Shift not found');
  if (shift.employeeId !== employeeId) throw new Error('Not assigned to this shift');
  if (shift.status === 'completed') return shift;
  if (shift.status === 'missed' || shift.status === 'cancelled') throw new Error('Shift is already missed or cancelled');

  return prisma.shift.update({
    where: { id: shiftId },
    data: { status: 'completed' },
  });
}
