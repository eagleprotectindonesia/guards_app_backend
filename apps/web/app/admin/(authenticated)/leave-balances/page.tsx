import type { Metadata } from 'next';
import { db, listPaginatedEmployeeAnnualLeaveBalancesForAdmin } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext, buildVisibleEmployeeWhereClause } from '@/lib/auth/leave-ownership';
import { getPaginationParams, serialize } from '@/lib/server-utils';
import LeaveBalanceList from './components/leave-balance-list';

export const metadata: Metadata = {
  title: 'Annual Leave Balances',
};

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function parseYear(raw: string | string[] | undefined) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    return new Date().getFullYear();
  }
  return parsed;
}

export default async function LeaveBalancesPage(props: PageProps) {
  const session = await requirePermission(PERMISSIONS.LEAVE_REQUESTS.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);
  const year = parseYear(searchParams.year);
  const employeeId = typeof searchParams.employeeId === 'string' ? searchParams.employeeId : undefined;
  const accessContext = await resolveLeaveRequestAccessContext(session);
  const employeeWhere = await buildVisibleEmployeeWhereClause(session, accessContext);

  const [{ rows, totalCount }, visibleEmployees] = await Promise.all([
    listPaginatedEmployeeAnnualLeaveBalancesForAdmin({
      year,
      employeeId,
      employeeRoleFilter: accessContext.employeeRoleFilter,
      employeeWhere,
      skip,
      take: perPage,
    }),
    db.employee.findMany({
      where: {
        deletedAt: null,
        role: accessContext.employeeRoleFilter,
        ...employeeWhere,
      },
      select: {
        id: true,
        fullName: true,
        employeeNumber: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    }),
  ]);

  const employees = visibleEmployees.map(emp => ({
    id: emp.id,
    fullName: emp.fullName,
    employeeNumber: emp.employeeNumber,
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <LeaveBalanceList
        rows={serialize(rows)}
        page={page}
        perPage={perPage}
        totalCount={totalCount}
        year={year}
        employeeId={employeeId}
        employees={serialize(employees)}
      />
    </div>
  );
}
