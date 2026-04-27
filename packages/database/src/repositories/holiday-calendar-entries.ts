import { db as prisma, Prisma } from '../prisma/client';

type TxLike = Prisma.TransactionClient | typeof prisma;

export type HolidayCalendarEntryInput = {
  startDate: string;
  endDate: string;
  title: string;
  type: HolidayCalendarType;
  scope: HolidayCalendarScope;
  departmentKeys?: string[];
  isPaid: boolean;
  affectsAttendance: boolean;
  notificationRequired: boolean;
  note?: string | null;
};

export type HolidayPolicyResolution = {
  entry: {
    id: string;
    title: string;
    type: HolidayCalendarType;
    isPaid: boolean;
    affectsAttendance: boolean;
    notificationRequired: boolean;
    scope: HolidayCalendarScope;
    departmentKeys: string[];
  };
  marksAsWorkingDay: boolean;
};

function dateKeyToDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function normalizeDepartmentKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeDepartmentKeys(values: string[] = []) {
  return Array.from(new Set(values.map(normalizeDepartmentKey).filter(Boolean)));
}

function validateDepartmentScope(scope: HolidayCalendarScope, departmentKeys: string[]) {
  if (scope === 'all' && departmentKeys.length > 0) {
    throw new Error('Department keys must be empty when scope is all.');
  }

  if (scope === 'department' && departmentKeys.length === 0) {
    throw new Error('At least one department key is required for department scope.');
  }
}

async function validateNoOverlappingEntries(
  startDate: string,
  endDate: string,
  scope: HolidayCalendarScope,
  departmentKeys: string[],
  excludeId?: string,
  tx: TxLike = prisma
) {
  const start = dateKeyToDate(startDate);
  const end = dateKeyToDate(endDate);

  if (start > end) {
    throw new Error('Start date must be before or equal to end date.');
  }

  const overlapping = await (tx as any).holidayCalendarEntry.findFirst({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      startDate: { lte: end },
      endDate: { gte: start },
      ...(scope === 'all'
        ? {}
        : {
            OR: [{ scope: 'all' }, { departmentKeys: { hasSome: departmentKeys } }],
          }),
    },
  });

  if (overlapping) {
    const startStr = overlapping.startDate.toISOString().slice(0, 10);
    const endStr = overlapping.endDate.toISOString().slice(0, 10);
    throw new Error(
      `Holiday overlaps with existing entry: ${overlapping.title} (${startStr} to ${endStr})`
    );
  }
}

export async function listHolidayCalendarEntriesForDateRange(
  startDate: Date,
  endDate: Date,
  filters?: {
    type?: HolidayCalendarType;
    scope?: HolidayCalendarScope;
    departmentKey?: string;
  },
  tx: TxLike = prisma
) {
  const normalizedDepartmentKey = filters?.departmentKey ? normalizeDepartmentKey(filters.departmentKey) : undefined;

  return (tx as any).holidayCalendarEntry.findMany({
    where: {
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      ...(filters?.type ? { type: filters.type } : {}),
      ...(filters?.scope ? { scope: filters.scope } : {}),
      ...(normalizedDepartmentKey ? { departmentKeys: { has: normalizedDepartmentKey } } : {}),
    },
    orderBy: [{ startDate: 'asc' }, { title: 'asc' }],
  });
}

export async function getHolidayCalendarEntryById(id: string, tx: TxLike = prisma) {
  return (tx as any).holidayCalendarEntry.findUnique({ where: { id } });
}

export async function createHolidayCalendarEntry(input: HolidayCalendarEntryInput, adminId?: string, tx: TxLike = prisma) {
  const departmentKeys = normalizeDepartmentKeys(input.departmentKeys || []);
  validateDepartmentScope(input.scope, departmentKeys);
  await validateNoOverlappingEntries(input.startDate, input.endDate, input.scope, departmentKeys, undefined, tx);

  const created = await (tx as any).holidayCalendarEntry.create({
    data: {
      startDate: dateKeyToDate(input.startDate),
      endDate: dateKeyToDate(input.endDate),
      title: input.title,
      type: input.type,
      scope: input.scope,
      departmentKeys,
      isPaid: input.isPaid,
      affectsAttendance: input.affectsAttendance,
      notificationRequired: input.notificationRequired,
      note: input.note ?? null,
      ...(adminId
        ? {
            createdById: adminId,
            lastUpdatedById: adminId,
          }
        : {}),
    },
  });

  await tx.changelog.create({
    data: {
      action: 'CREATE',
      entityType: 'HolidayCalendarEntry',
      entityId: created.id,
      actor: adminId ? 'admin' : 'system',
      actorId: adminId ?? undefined,
      details: {
        startDate: input.startDate,
        endDate: input.endDate,
        title: input.title,
        type: input.type,
        scope: input.scope,
        departmentKeys,
        isPaid: input.isPaid,
        affectsAttendance: input.affectsAttendance,
        notificationRequired: input.notificationRequired,
      },
    },
  });

  return created;
}

export async function updateHolidayCalendarEntry(
  id: string,
  input: HolidayCalendarEntryInput,
  adminId?: string,
  tx: TxLike = prisma
) {
  const departmentKeys = normalizeDepartmentKeys(input.departmentKeys || []);
  validateDepartmentScope(input.scope, departmentKeys);
  await validateNoOverlappingEntries(input.startDate, input.endDate, input.scope, departmentKeys, id, tx);

  const updated = await (tx as any).holidayCalendarEntry.update({
    where: { id },
    data: {
      startDate: dateKeyToDate(input.startDate),
      endDate: dateKeyToDate(input.endDate),
      title: input.title,
      type: input.type,
      scope: input.scope,
      departmentKeys,
      isPaid: input.isPaid,
      affectsAttendance: input.affectsAttendance,
      notificationRequired: input.notificationRequired,
      note: input.note ?? null,
      ...(adminId ? { lastUpdatedById: adminId } : {}),
    },
  });

  await tx.changelog.create({
    data: {
      action: 'UPDATE',
      entityType: 'HolidayCalendarEntry',
      entityId: updated.id,
      actor: adminId ? 'admin' : 'system',
      actorId: adminId ?? undefined,
      details: {
        startDate: input.startDate,
        endDate: input.endDate,
        title: input.title,
        type: input.type,
        scope: input.scope,
        departmentKeys,
        isPaid: input.isPaid,
        affectsAttendance: input.affectsAttendance,
        notificationRequired: input.notificationRequired,
      },
    },
  });

  return updated;
}

export async function deleteHolidayCalendarEntry(id: string, adminId?: string, tx: TxLike = prisma) {
  const existing = await getHolidayCalendarEntryById(id, tx);
  if (!existing) return null;

  await (tx as any).holidayCalendarEntry.delete({ where: { id } });

  await tx.changelog.create({
    data: {
      action: 'DELETE',
      entityType: 'HolidayCalendarEntry',
      entityId: id,
      actor: adminId ? 'admin' : 'system',
      actorId: adminId ?? undefined,
      details: {
        startDate: existing.startDate,
        endDate: existing.endDate,
        title: existing.title,
        type: existing.type,
      },
    },
  });

  return existing;
}

export async function resolveHolidayPolicyForEmployeeDate(
  params: {
    date: Date;
    department?: string | null;
  },
  tx: TxLike = prisma
): Promise<HolidayPolicyResolution | null> {
  const dateStart = new Date(params.date.toISOString().slice(0, 10) + 'T00:00:00Z');
  const departmentKey = params.department ? normalizeDepartmentKey(params.department) : null;

  const candidates = await (tx as any).holidayCalendarEntry.findMany({
    where: {
      startDate: { lte: dateStart },
      endDate: { gte: dateStart },
      OR: [{ scope: 'all' }, ...(departmentKey ? [{ scope: 'department', departmentKeys: { has: departmentKey } }] : [])],
    },
    orderBy: [{ scope: 'desc' }, { createdAt: 'desc' }],
  });

  const selected = candidates.find((entry: any) => entry.type === 'special_working_day') ?? candidates[0] ?? null;
  if (!selected) return null;

  return {
    entry: {
      id: selected.id,
      title: selected.title,
      type: selected.type,
      isPaid: selected.isPaid,
      affectsAttendance: selected.affectsAttendance,
      notificationRequired: selected.notificationRequired,
      scope: selected.scope,
      departmentKeys: selected.departmentKeys,
    },
    marksAsWorkingDay: selected.type === 'special_working_day',
  };
}

export type HolidayAnnouncementItem = {
  id: string;
  title: string;
  type: HolidayCalendarType;
  isPaid: boolean;
  affectsAttendance: boolean;
  notificationRequired: boolean;
  scope: HolidayCalendarScope;
  departmentKeys: string[];
  note: string | null;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
};

export async function listFutureHolidayAnnouncementsForEmployee(
  params: {
    department?: string | null;
    fromDate: Date;
    toDate: Date;
  },
  tx: TxLike = prisma
): Promise<HolidayAnnouncementItem[]> {
  const fromDateStart = new Date(`${params.fromDate.toISOString().slice(0, 10)}T00:00:00Z`);
  const toDateStart = new Date(`${params.toDate.toISOString().slice(0, 10)}T00:00:00Z`);
  const departmentKey = params.department ? normalizeDepartmentKey(params.department) : null;

  return (tx as any).holidayCalendarEntry.findMany({
    where: {
      startDate: { gt: fromDateStart, lte: toDateStart },
      OR: [{ scope: 'all' }, ...(departmentKey ? [{ scope: 'department', departmentKeys: { has: departmentKey } }] : [])],
    },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      type: true,
      isPaid: true,
      affectsAttendance: true,
      notificationRequired: true,
      scope: true,
      departmentKeys: true,
      note: true,
      startDate: true,
      endDate: true,
      createdAt: true,
    },
  });
}
export type HolidayCalendarType = 'holiday' | 'week_off' | 'emergency' | 'special_working_day';
export type HolidayCalendarScope = 'all' | 'department';
