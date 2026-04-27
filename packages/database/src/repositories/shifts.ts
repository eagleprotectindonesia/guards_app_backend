import { db as prisma } from '../prisma/client';
import { Prisma } from '@prisma/client';
import { redis } from '../redis/client';
import { parseShiftTypeTimeOnDate } from '@repo/shared';
import { getShiftTypeDurationInMins } from './shift-types';

export async function getShiftById(id: string, include?: Prisma.ShiftInclude) {
  return prisma.shift.findUnique({
    where: { id, deletedAt: null },
    include: include || {
      site: true,
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
      return Promise.all([
        tx.shift.findMany({
          where: finalWhere,
          orderBy,
          skip,
          take,
          include: include || {
            site: { select: { name: true } },
            shiftType: { select: { name: true, startTime: true, endTime: true } },
            employee: { include: { office: { select: { name: true } } } },
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
          employee: { include: { office: { select: { name: true } } } },
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
          shiftType: true,
          employee: { include: { office: { select: { name: true } } } },
        },
      });

      const emp = updatedShift.employee as any;
      const prevEmp = beforeShift.employee as any;

      const updatedEmpName = emp ? emp.fullName : 'Unassigned';
      const beforeEmpName = prevEmp ? prevEmp.fullName : 'Unassigned';

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
        include: { site: true, shiftType: true, employee: { include: { office: { select: { name: true } } } } },
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
          shiftType: { select: { name: true } },
          employee: { include: { office: { select: { name: true } } } },
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

function getShiftBulkDateKey(employeeId: string, date: string) {
  return `${employeeId}:${date}`;
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
      where: { deletedAt: null },
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

  const datesAsDate = uniqueDates
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .map(value => new Date(`${value}T00:00:00Z`));

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
  const createInputs: Prisma.ShiftCreateManyInput[] = [];
  const updates: Array<{ id: string; data: Prisma.ShiftUpdateManyMutationInput; employeeId: string }> = [];
  const deleteIds = new Set<string>();
  let rowsProcessed = 0;
  let pastDatesSkipped = 0;

  for (const row of rows) {
    const siteId = siteByName.get(row.site.toLowerCase());
    if (!siteId) {
      errors.push(`Row ${row.rowNumber}: site '${row.site}' not found.`);
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
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
      existingForKey.forEach(shift => deleteIds.add(shift.id));
      rowsProcessed++;
      continue;
    }

    const shiftType = shiftTypeByName.get(row.shiftTypeName.toLowerCase());
    if (!shiftType) {
      errors.push(`Row ${row.rowNumber}: shift_type_name '${row.shiftTypeName}' not found.`);
      continue;
    }

    const interval = Number.parseInt(row.interval, 10);
    const grace = Number.parseInt(row.grace, 10);
    if (Number.isNaN(interval) || interval <= 0) {
      errors.push(`Row ${row.rowNumber}: interval '${row.interval}' must be a positive integer.`);
      continue;
    }
    if (Number.isNaN(grace) || grace < 0) {
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
      if (durationInMins < 2 * interval) {
        errors.push(
          `Row ${row.rowNumber}: shift duration (${durationInMins} mins) must allow at least 2 check-in slots for interval ${interval}.`
        );
        continue;
      }

      createInputs.push({
        siteId,
        shiftTypeId: shiftType.id,
        employeeId,
        date: new Date(`${row.date}T00:00:00Z`),
        startsAt,
        endsAt,
        requiredCheckinIntervalMins: interval,
        graceMinutes: grace,
        status: 'scheduled',
        note: row.note ?? null,
      });
      rowsProcessed++;
      continue;
    }

    const existingShift = existingForKey[0];
    updates.push({
      id: existingShift.id,
      employeeId,
      data: {
        siteId,
        shiftTypeId: shiftType.id,
        date: new Date(`${row.date}T00:00:00Z`),
        startsAt,
        endsAt,
        status: 'scheduled',
        note: row.note ?? null,
        requiredCheckinIntervalMins: existingShift.requiredCheckinIntervalMins,
        graceMinutes: existingShift.graceMinutes,
      },
    });
    rowsProcessed++;
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
    for (const shiftId of deleteIds) {
      const deleted = await deleteShiftWithChangelog(shiftId, adminId);
      if (deleted) deletedOff++;
    }

    for (const update of updates) {
      await updateShiftWithChangelog(
        update.id,
        {
          site: { connect: { id: update.data.siteId as string } },
          shiftType: { connect: { id: update.data.shiftTypeId as string } },
          employee: { connect: { id: update.employeeId } },
          date: update.data.date as Date,
          startsAt: update.data.startsAt as Date,
          endsAt: update.data.endsAt as Date,
          requiredCheckinIntervalMins: update.data.requiredCheckinIntervalMins as number,
          graceMinutes: update.data.graceMinutes as number,
          note: (update.data.note as string | null | undefined) ?? null,
          status: 'scheduled',
        },
        adminId
      );
      updated++;
    }

    if (createInputs.length > 0) {
      const createdRows = await bulkCreateShiftsWithChangelog(createInputs, adminId);
      created = createdRows.length;
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

      for (const update of updates) {
        const updateResult = await tx.shift.updateMany({
          where: { id: update.id, deletedAt: null },
          data: update.data,
        });
        updated += updateResult.count;
      }

      if (createInputs.length > 0) {
        const createdResult = await tx.shift.createMany({ data: createInputs });
        created = createdResult.count;
      }
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
      shiftType: true,
      employee: { include: { office: { select: { name: true } } } },
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
      attendance: true,
    },
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
      OR: [
        {
          // For scheduled shifts, we only show them if they are current (within 5 min buffer)
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

  return prisma.shift.findMany({
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
      attendance: true,
    },
  });
}

/**
 * Gets upcoming shifts for the admin dashboard (next 24 hours).
 */
export async function getUpcomingShiftsForDashboard(now: Date, take = 50) {
  return getUpcomingShifts(now, take);
}
