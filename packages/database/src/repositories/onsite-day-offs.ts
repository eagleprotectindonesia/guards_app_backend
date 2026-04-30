import { db as prisma, Prisma } from '../prisma/client';

type TxLike = Prisma.TransactionClient | typeof prisma;

function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`);
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
    return tx.employeeOnsiteDayOff.update({
      where: { id: existing.id },
      data: {
        note: params.note ?? existing.note ?? null,
        ...(params.adminId ? { lastUpdatedById: params.adminId } : {}),
      },
    });
  }

  return tx.employeeOnsiteDayOff.create({
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
}

export async function deleteEmployeeOnsiteDayOffsByEmployeeAndDates(
  employeeId: string,
  dateKeys: string[],
  tx: TxLike = prisma
) {
  if (dateKeys.length === 0) return 0;

  const result = await tx.employeeOnsiteDayOff.deleteMany({
    where: {
      employeeId,
      date: { in: dateKeys.map(dateKeyToDate) },
    },
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
