import { db as prisma, Prisma } from '../prisma/client';

type TxLike = Prisma.TransactionClient | typeof prisma;

function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function dateToDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function upsertEmployeeOnsiteDayOff(
  params: {
    employeeId: string;
    date: string;
    note?: string | null;
    adminId?: string;
  },
  tx: TxLike = prisma
) {
  const existing = await tx.employeeOnsiteDayOff.findUnique({
    where: {
      employeeId_date: {
        employeeId: params.employeeId,
        date: dateKeyToDate(params.date),
      },
    },
  });

  if (existing) {
    const updated = await tx.employeeOnsiteDayOff.update({
      where: { id: existing.id },
      data: {
        note: params.note ?? existing.note ?? null,
        ...(params.adminId ? { lastUpdatedById: params.adminId } : {}),
      },
    });

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'EmployeeOnsiteDayOff',
        entityId: updated.id,
        actor: params.adminId ? 'admin' : 'system',
        actorId: params.adminId ?? undefined,
        details: {
          employeeId: params.employeeId,
          date: params.date,
          note: updated.note ?? null,
          dayOffType: 'off',
        },
      },
    });

    return updated;
  }

  const created = await tx.employeeOnsiteDayOff.create({
    data: {
      employeeId: params.employeeId,
      date: dateKeyToDate(params.date),
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
      entityType: 'EmployeeOnsiteDayOff',
      entityId: created.id,
      actor: params.adminId ? 'admin' : 'system',
      actorId: params.adminId ?? undefined,
      details: {
        employeeId: params.employeeId,
        date: params.date,
        note: created.note ?? null,
        dayOffType: 'off',
      },
    },
  });

  return created;
}

export async function deleteEmployeeOnsiteDayOffsByEmployeeAndDates(
  employeeId: string,
  dateKeys: string[],
  adminIdOrTx?: string | TxLike,
  tx: TxLike = prisma
) {
  if (dateKeys.length === 0) return 0;

  const adminId = typeof adminIdOrTx === 'string' ? adminIdOrTx : undefined;
  const client = typeof adminIdOrTx === 'string' ? tx : adminIdOrTx ?? tx;

  const existing = await client.employeeOnsiteDayOff.findMany({
    where: {
      employeeId,
      date: { in: dateKeys.map(dateKeyToDate) },
    },
  });

  if (existing.length === 0) return 0;

  const result = await client.employeeOnsiteDayOff.deleteMany({
    where: {
      employeeId,
      date: { in: dateKeys.map(dateKeyToDate) },
    },
  });

  await client.changelog.createMany({
    data: existing.map(dayOff => ({
      action: 'DELETE',
      entityType: 'EmployeeOnsiteDayOff',
      entityId: dayOff.id,
      actor: adminId ? 'admin' : 'system',
      actorId: adminId ?? undefined,
      details: {
        employeeId,
        date: dateToDateKey(dayOff.date),
        note: dayOff.note ?? null,
        dayOffType: 'off',
      },
    })),
  });

  return result.count;
}

export async function listEmployeeOnsiteDayOffDateKeysInRange(
  employeeId: string,
  startDateKey: string,
  endDateKey: string,
  tx: TxLike = prisma
) {
  const rows = await tx.employeeOnsiteDayOff.findMany({
    where: {
      employeeId,
      date: {
        gte: dateKeyToDate(startDateKey),
        lte: dateKeyToDate(endDateKey),
      },
    },
    select: { date: true },
  });

  return rows.map(row => row.date.toISOString().slice(0, 10));
}

export type EmployeeOnsiteDayOffWithEmployee = {
  id: string;
  employeeId: string;
  date: Date;
  note: string | null;
  employee: {
    id: string;
    fullName: string;
    employeeNumber: string | null;
  };
};

export async function getEmployeeOnsiteDayOffsForDateRange(
  startDate: Date,
  endDate: Date | undefined,
  employeeId?: string,
  tx: TxLike = prisma
): Promise<EmployeeOnsiteDayOffWithEmployee[]> {
  return tx.employeeOnsiteDayOff.findMany({
    where: {
      employeeId: employeeId || undefined,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          employeeNumber: true,
        },
      },
    },
    orderBy: {
      date: 'asc',
    },
  });
}

export async function getApprovedOnsiteLeaveDateKeysInRange(
  employeeIds: string[],
  startDate: Date,
  endDate: Date,
  tx: TxLike = prisma
): Promise<Set<string>> {
  if (employeeIds.length === 0) return new Set<string>();

  const requests = await tx.employeeLeaveRequest.findMany({
    where: {
      status: 'approved',
      employeeId: { in: employeeIds },
      employee: { role: 'on_site' },
      endDate: { gte: startDate },
      startDate: { lte: endDate },
    },
    select: {
      employeeId: true,
      startDate: true,
      endDate: true,
    },
  });

  const leaveDateKeys = new Set<string>();
  const rangeStart = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const rangeEnd = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());

  for (const request of requests) {
    const startUtc = Date.UTC(
      request.startDate.getUTCFullYear(),
      request.startDate.getUTCMonth(),
      request.startDate.getUTCDate()
    );
    const endUtc = Date.UTC(request.endDate.getUTCFullYear(), request.endDate.getUTCMonth(), request.endDate.getUTCDate());
    const overlapStart = Math.max(startUtc, rangeStart);
    const overlapEnd = Math.min(endUtc, rangeEnd);

    for (let day = overlapStart; day <= overlapEnd; day += 24 * 60 * 60 * 1000) {
      const dateKey = new Date(day).toISOString().slice(0, 10);
      leaveDateKeys.add(`${request.employeeId}:${dateKey}`);
    }
  }

  return leaveDateKeys;
}
