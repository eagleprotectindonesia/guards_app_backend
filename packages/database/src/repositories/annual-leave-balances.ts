import { EmployeeRole, Prisma } from '@prisma/client';
import { db as prisma } from '../prisma/client';

type TxLike = Prisma.TransactionClient | typeof prisma;

type EmployeeWhereFilter = Prisma.EmployeeWhereInput | undefined;

export const ANNUAL_LEAVE_ADJUSTMENT_ERROR = {
  INVALID_YEAR: 'Invalid year',
  INVALID_DAYS: 'Adjustment days must be a non-zero integer',
  DAYS_TOO_LARGE: 'Adjustment days is too large',
  EMPTY_NOTE: 'Adjustment note is required',
  NEGATIVE_AVAILABLE: 'Adjustment would make available annual leave balance negative',
} as const;

function assertValidYear(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(ANNUAL_LEAVE_ADJUSTMENT_ERROR.INVALID_YEAR);
  }
}

function assertValidAdjustmentDays(days: number) {
  if (!Number.isInteger(days) || days === 0) {
    throw new Error(ANNUAL_LEAVE_ADJUSTMENT_ERROR.INVALID_DAYS);
  }
  if (Math.abs(days) > 365) {
    throw new Error(ANNUAL_LEAVE_ADJUSTMENT_ERROR.DAYS_TOO_LARGE);
  }
}

function assertValidAdjustmentNote(note: string) {
  if (!note.trim()) {
    throw new Error(ANNUAL_LEAVE_ADJUSTMENT_ERROR.EMPTY_NOTE);
  }
}

function buildEmployeeWhere(employeeId?: string, employeeRoleFilter?: EmployeeRole, employeeWhere?: EmployeeWhereFilter) {
  const roleFilter = employeeRoleFilter ? { role: employeeRoleFilter } : {};
  const idFilter = employeeId ? { id: employeeId } : {};

  return {
    deletedAt: null,
    ...roleFilter,
    ...idFilter,
    ...(employeeWhere ?? {}),
  } satisfies Prisma.EmployeeWhereInput;
}

function toAvailableDays(balance: {
  entitledDays: number;
  adjustedDays: number;
  consumedDays: number;
}) {
  return balance.entitledDays + balance.adjustedDays - balance.consumedDays;
}

async function getOrCreateAnnualLeaveBalance(employeeId: string, year: number, tx: Prisma.TransactionClient) {
  return tx.employeeAnnualLeaveBalance.upsert({
    where: {
      employeeId_year: {
        employeeId,
        year,
      },
    },
    update: {},
    create: {
      employeeId,
      year,
      entitledDays: 12,
      adjustedDays: 0,
      consumedDays: 0,
    },
  });
}

export async function getEmployeeAnnualLeaveBalanceForYear(employeeId: string, year: number, tx: TxLike = prisma) {
  assertValidYear(year);

  const targetTx = tx as TxLike;
  const isPrismaClient = '$transaction' in targetTx;
  const loader = async (trx: Prisma.TransactionClient) => getOrCreateAnnualLeaveBalance(employeeId, year, trx);
  const balance = isPrismaClient ? await (targetTx as typeof prisma).$transaction(loader) : await loader(targetTx as Prisma.TransactionClient);

  return {
    ...balance,
    availableDays: toAvailableDays(balance),
  };
}

export async function listEmployeeAnnualLeaveLedgerEntries(params: { employeeId: string; year: number; take?: number }) {
  assertValidYear(params.year);

  const rows = await prisma.employeeLeaveLedgerEntry.findMany({
    where: {
      employeeId: params.employeeId,
      year: params.year,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      leaveRequest: {
        select: {
          id: true,
          reason: true,
          startDate: true,
          endDate: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: params.take ?? 20,
  });

  return rows;
}

export async function getEmployeeAnnualLeaveBalanceWithLedger(params: { employeeId: string; year: number; ledgerTake?: number }) {
  const [balance, ledger] = await Promise.all([
    getEmployeeAnnualLeaveBalanceForYear(params.employeeId, params.year),
    listEmployeeAnnualLeaveLedgerEntries({
      employeeId: params.employeeId,
      year: params.year,
      take: params.ledgerTake ?? 20,
    }),
  ]);

  return { balance, ledger };
}

export async function listPaginatedEmployeeAnnualLeaveBalancesForAdmin(params: {
  year: number;
  employeeId?: string;
  employeeRoleFilter?: EmployeeRole;
  employeeWhere?: EmployeeWhereFilter;
  skip: number;
  take: number;
}) {
  assertValidYear(params.year);
  const employeeFilter = buildEmployeeWhere(params.employeeId, params.employeeRoleFilter, params.employeeWhere);

  const [employees, totalCount, balances] = await Promise.all([
    prisma.employee.findMany({
      where: employeeFilter,
      select: {
        id: true,
        fullName: true,
        employeeNumber: true,
        role: true,
        department: true,
        officeId: true,
      },
      orderBy: {
        fullName: 'asc',
      },
      skip: params.skip,
      take: params.take,
    }),
    prisma.employee.count({
      where: employeeFilter,
    }),
    prisma.employeeAnnualLeaveBalance.findMany({
      where: {
        year: params.year,
        employee: employeeFilter,
      },
      select: {
        id: true,
        employeeId: true,
        year: true,
        entitledDays: true,
        adjustedDays: true,
        consumedDays: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const balanceByEmployeeId = new Map(balances.map(balance => [balance.employeeId, balance]));

  const rows = employees.map(employee => {
    const balance = balanceByEmployeeId.get(employee.id);
    const entitledDays = balance?.entitledDays ?? 12;
    const adjustedDays = balance?.adjustedDays ?? 0;
    const consumedDays = balance?.consumedDays ?? 0;

    return {
      employee,
      year: params.year,
      entitledDays,
      adjustedDays,
      consumedDays,
      availableDays: entitledDays + adjustedDays - consumedDays,
      balanceId: balance?.id ?? null,
      updatedAt: balance?.updatedAt ?? null,
    };
  });

  return {
    rows,
    totalCount,
  };
}

export async function adjustEmployeeAnnualLeaveBalance(
  params: {
    employeeId: string;
    year: number;
    days: number;
    note: string;
    adminId: string;
  },
  tx: TxLike = prisma
) {
  assertValidYear(params.year);
  assertValidAdjustmentDays(params.days);
  assertValidAdjustmentNote(params.note);

  const targetTx = tx as TxLike;
  const isPrismaClient = '$transaction' in targetTx;
  const run = async (trx: Prisma.TransactionClient) => {
    const balance = await getOrCreateAnnualLeaveBalance(params.employeeId, params.year, trx);
    const availableAfter = balance.entitledDays + (balance.adjustedDays + params.days) - balance.consumedDays;

    if (availableAfter < 0) {
      throw new Error(ANNUAL_LEAVE_ADJUSTMENT_ERROR.NEGATIVE_AVAILABLE);
    }

    const updated = await trx.employeeAnnualLeaveBalance.update({
      where: { id: balance.id },
      data: {
        adjustedDays: {
          increment: params.days,
        },
      },
    });

    const ledgerEntry = await trx.employeeLeaveLedgerEntry.create({
      data: {
        employeeId: params.employeeId,
        leaveRequestId: null,
        year: params.year,
        entryType: 'adjustment',
        days: params.days,
        note: params.note.trim(),
        createdById: params.adminId,
      },
    });

    await trx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'EmployeeAnnualLeaveBalance',
        entityId: updated.id,
        actor: 'admin',
        actorId: params.adminId,
        details: {
          employeeId: params.employeeId,
          year: params.year,
          days: params.days,
          note: params.note.trim(),
          availableDaysAfter: toAvailableDays(updated),
          ledgerEntryId: ledgerEntry.id,
        },
      },
    });

    return {
      ...updated,
      availableDays: toAvailableDays(updated),
    };
  };

  return isPrismaClient ? (targetTx as typeof prisma).$transaction(run) : run(targetTx as Prisma.TransactionClient);
}
