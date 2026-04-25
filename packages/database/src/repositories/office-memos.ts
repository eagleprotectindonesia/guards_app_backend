import { db as prisma, Prisma } from '../prisma/client';

type TxLike = Prisma.TransactionClient | typeof prisma;

export type OfficeMemoScope = 'all' | 'department';

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
