import { db as prisma, Prisma } from '../prisma/client';
import { BUSINESS_TIMEZONE, getBusinessDayRange } from './office-work-schedules';

type TxLike = Prisma.TransactionClient | typeof prisma;

function getDateKeyInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to resolve date key for timezone ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function shiftDateToDateKey(date: Date) {
  return getDateKeyInTimeZone(date, BUSINESS_TIMEZONE);
}

export function getOfficeDayOverrideAnchorDates(at = new Date()) {
  const businessDay = getBusinessDayRange(at, BUSINESS_TIMEZONE);
  const currentDateKey = businessDay.dateKey;
  const previousDate = new Date(`${currentDateKey}T00:00:00Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const previousDateKey = previousDate.toISOString().slice(0, 10);

  return {
    businessDay,
    currentDateKey,
    previousDateKey,
  };
}

export async function listEmployeeOfficeDayOverridesForDates(
  employeeId: string,
  dateKeys: string[],
  tx: TxLike = prisma
) {
  if (dateKeys.length === 0) return [];

  return (tx as any).employeeOfficeDayOverride.findMany({
    where: {
      employeeId,
      date: {
        in: dateKeys.map(dateKeyToDate),
      },
    },
  });
}

export async function getEmployeeOfficeDayOverrideForDate(
  employeeId: string,
  dateKey: string,
  tx: TxLike = prisma
) {
  return (tx as any).employeeOfficeDayOverride.findUnique({
    where: {
      employeeId_date: {
        employeeId,
        date: dateKeyToDate(dateKey),
      },
    },
  });
}

export async function resolveOfficeDayOverrideAnchorsForEmployee(employeeId: string, at = new Date(), tx: TxLike = prisma) {
  const { businessDay, currentDateKey, previousDateKey } = getOfficeDayOverrideAnchorDates(at);
  const overrides = await listEmployeeOfficeDayOverridesForDates(employeeId, [currentDateKey, previousDateKey], tx);
  const overridesByDate = new Map(
    overrides.map((override: { date: Date }) => [shiftDateToDateKey(override.date), override])
  );

  return {
    businessDay,
    currentDateKey,
    previousDateKey,
    currentOverride: overridesByDate.get(currentDateKey) ?? null,
    previousOverride: overridesByDate.get(previousDateKey) ?? null,
  };
}

export async function upsertEmployeeOfficeDayOverride(
  params: {
    employeeId: string;
    date: string;
    overrideType: 'off' | 'shift_override';
    note?: string | null;
    adminId?: string | null;
  },
  tx: TxLike = prisma
) {
  const existing = await getEmployeeOfficeDayOverrideForDate(params.employeeId, params.date, tx);

  if (existing) {
    const updated = await (tx as any).employeeOfficeDayOverride.update({
      where: { id: existing.id },
      data: {
        overrideType: params.overrideType,
        note: params.note ?? null,
        ...(params.adminId ? { lastUpdatedById: params.adminId } : {}),
      },
    });

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'EmployeeOfficeDayOverride',
        entityId: updated.id,
        actor: params.adminId ? 'admin' : 'system',
        actorId: params.adminId ?? undefined,
        details: {
          employeeId: params.employeeId,
          date: params.date,
          overrideType: params.overrideType,
          note: params.note ?? null,
        },
      },
    });

    return updated;
  }

  const created = await (tx as any).employeeOfficeDayOverride.create({
    data: {
      employeeId: params.employeeId,
      date: dateKeyToDate(params.date),
      overrideType: params.overrideType,
      note: params.note ?? null,
      ...(params.adminId
        ? {
            createdById: params.adminId,
            lastUpdatedById: params.adminId,
          }
        : {}),
    },
  });

  await tx.changelog.create({
    data: {
      action: 'CREATE',
      entityType: 'EmployeeOfficeDayOverride',
      entityId: created.id,
      actor: params.adminId ? 'admin' : 'system',
      actorId: params.adminId ?? undefined,
      details: {
        employeeId: params.employeeId,
        date: params.date,
        overrideType: params.overrideType,
        note: params.note ?? null,
      },
    },
  });

  return created;
}

export async function deleteEmployeeOfficeDayOverride(
  employeeId: string,
  dateKey: string,
  adminId?: string | null,
  tx: TxLike = prisma
) {
  const existing = await getEmployeeOfficeDayOverrideForDate(employeeId, dateKey, tx);
  if (!existing) return null;

  await (tx as any).employeeOfficeDayOverride.delete({
    where: { id: existing.id },
  });

  await tx.changelog.create({
    data: {
      action: 'DELETE',
      entityType: 'EmployeeOfficeDayOverride',
      entityId: existing.id,
      actor: adminId ? 'admin' : 'system',
      actorId: adminId ?? undefined,
      details: {
        employeeId,
        date: dateKey,
        overrideType: existing.overrideType,
        note: existing.note ?? null,
      },
    },
  });

  return existing;
}

export async function deleteEmployeeOfficeDayOverridesByEmployeeAndDates(
  employeeId: string,
  dateKeys: string[],
  adminId?: string | null,
  tx: TxLike = prisma
) {
  if (dateKeys.length === 0) return 0;

  const existing = await listEmployeeOfficeDayOverridesForDates(employeeId, dateKeys, tx);
  if (existing.length === 0) return 0;

  await (tx as any).employeeOfficeDayOverride.deleteMany({
    where: {
      employeeId,
      date: {
        in: dateKeys.map(dateKeyToDate),
      },
    },
  });

  await tx.changelog.createMany({
    data: existing.map((override: any) => ({
      action: 'DELETE',
      entityType: 'EmployeeOfficeDayOverride',
      entityId: override.id,
      actor: adminId ? 'admin' : 'system',
      actorId: adminId ?? undefined,
      details: {
        employeeId,
        date: shiftDateToDateKey(override.date),
        overrideType: override.overrideType,
        note: override.note ?? null,
      },
    })),
  });

  return existing.length;
}
