import { db as prisma, Prisma } from '../prisma/client';

type TxLike = Prisma.TransactionClient | typeof prisma;

export type OfficeMemoScope = 'all' | 'department';

export type OfficeMemoInput = {
  startDate: string;
  endDate: string;
  title: string;
  message?: string;
  scope: OfficeMemoScope;
  departmentKeys?: string[];
  isActive: boolean;
};

export type OfficeMemoAnnouncementItem = {
  id: string;
  title: string;
  message: string | null;
  startDate: Date;
  endDate: Date;
  scope: OfficeMemoScope;
  departmentKeys: string[];
  createdAt: Date;
};

function normalizeDepartmentKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeDepartmentKeys(values: string[] = []) {
  return Array.from(new Set(values.map(normalizeDepartmentKey).filter(Boolean)));
}

function dateKeyToDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function validateDateRange(startDate: string, endDate: string) {
  if (startDate > endDate) {
    throw new Error('endDate must be on or after startDate');
  }
}

function validateDepartmentScope(scope: OfficeMemoScope, departmentKeys: string[]) {
  if (scope === 'all' && departmentKeys.length > 0) {
    throw new Error('Department keys must be empty when scope is all.');
  }

  if (scope === 'department' && departmentKeys.length === 0) {
    throw new Error('At least one department key is required for department scope.');
  }
}

export async function listOfficeMemos(
  params?: {
    skip?: number;
    take?: number;
    scope?: OfficeMemoScope;
    isActive?: boolean;
  },
  tx: TxLike = prisma
) {
  return (tx as any).officeMemo.findMany({
    where: {
      ...(params?.scope ? { scope: params.scope } : {}),
      ...(typeof params?.isActive === 'boolean' ? { isActive: params.isActive } : {}),
    },
    orderBy: [{ startDate: 'desc' }, { updatedAt: 'desc' }],
    include: {
      createdBy: { select: { name: true } },
      lastUpdatedBy: { select: { name: true } },
    },
    ...(typeof params?.skip === 'number' ? { skip: params.skip } : {}),
    ...(typeof params?.take === 'number' ? { take: params.take } : {}),
  });
}

export async function getOfficeMemoById(id: string, tx: TxLike = prisma) {
  return (tx as any).officeMemo.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      lastUpdatedBy: { select: { name: true } },
    },
  });
}

export async function createOfficeMemo(input: OfficeMemoInput, adminId?: string, tx: TxLike = prisma) {
  validateDateRange(input.startDate, input.endDate);

  const departmentKeys = normalizeDepartmentKeys(input.departmentKeys || []);
  validateDepartmentScope(input.scope, departmentKeys);

  const created = await (tx as any).officeMemo.create({
    data: {
      startDate: dateKeyToDate(input.startDate),
      endDate: dateKeyToDate(input.endDate),
      title: input.title,
      message: input.message?.trim() || null,
      scope: input.scope,
      departmentKeys,
      isActive: input.isActive,
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
      entityType: 'OfficeMemo',
      entityId: created.id,
      actor: adminId ? 'admin' : 'system',
      actorId: adminId ?? undefined,
      details: {
        startDate: input.startDate,
        endDate: input.endDate,
        title: input.title,
        scope: input.scope,
        departmentKeys,
        isActive: input.isActive,
      },
    },
  });

  return created;
}

export async function updateOfficeMemo(id: string, input: OfficeMemoInput, adminId?: string, tx: TxLike = prisma) {
  validateDateRange(input.startDate, input.endDate);

  const departmentKeys = normalizeDepartmentKeys(input.departmentKeys || []);
  validateDepartmentScope(input.scope, departmentKeys);

  const updated = await (tx as any).officeMemo.update({
    where: { id },
    data: {
      startDate: dateKeyToDate(input.startDate),
      endDate: dateKeyToDate(input.endDate),
      title: input.title,
      message: input.message?.trim() || null,
      scope: input.scope,
      departmentKeys,
      isActive: input.isActive,
      ...(adminId ? { lastUpdatedById: adminId } : {}),
    },
  });

  await tx.changelog.create({
    data: {
      action: 'UPDATE',
      entityType: 'OfficeMemo',
      entityId: updated.id,
      actor: adminId ? 'admin' : 'system',
      actorId: adminId ?? undefined,
      details: {
        startDate: input.startDate,
        endDate: input.endDate,
        title: input.title,
        scope: input.scope,
        departmentKeys,
        isActive: input.isActive,
      },
    },
  });

  return updated;
}

export async function deleteOfficeMemo(id: string, adminId?: string, tx: TxLike = prisma) {
  const existing = await getOfficeMemoById(id, tx);
  if (!existing) return null;

  await (tx as any).officeMemo.delete({ where: { id } });

  await tx.changelog.create({
    data: {
      action: 'DELETE',
      entityType: 'OfficeMemo',
      entityId: id,
      actor: adminId ? 'admin' : 'system',
      actorId: adminId ?? undefined,
      details: {
        title: existing.title,
        startDate: existing.startDate,
        endDate: existing.endDate,
        scope: existing.scope,
        isActive: existing.isActive,
      },
    },
  });

  return existing;
}

export async function listActiveOfficeMemosForEmployee(
  params: {
    department?: string | null;
    fromDate: Date;
    toDate: Date;
  },
  tx: TxLike = prisma
): Promise<OfficeMemoAnnouncementItem[]> {
  const fromDateStart = new Date(`${params.fromDate.toISOString().slice(0, 10)}T00:00:00Z`);
  const toDateStart = new Date(`${params.toDate.toISOString().slice(0, 10)}T00:00:00Z`);
  const departmentKey = params.department ? normalizeDepartmentKey(params.department) : null;

  return (tx as any).officeMemo.findMany({
    where: {
      isActive: true,
      startDate: { lte: toDateStart },
      endDate: { gte: fromDateStart },
      OR: [{ scope: 'all' }, ...(departmentKey ? [{ scope: 'department', departmentKeys: { has: departmentKey } }] : [])],
    },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      message: true,
      startDate: true,
      endDate: true,
      scope: true,
      departmentKeys: true,
      createdAt: true,
    },
  });
}
