import type { Metadata } from 'next';
import { Prisma, db, listPaginatedEmployeeAnnualLeaveBalancesForAdmin } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';
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

  let employeeWhere: Prisma.EmployeeWhereInput | undefined;

  if (!session.isSuperAdmin) {
    const ownershipCandidates = await db.employee.findMany({
      where: {
        deletedAt: null,
        role: accessContext.employeeRoleFilter,
      },
      select: {
        id: true,
        role: true,
        department: true,
        officeId: true,
      },
    });

    const visibleEmployeeIds = ownershipCandidates
      .filter(candidate =>
        accessContext.isEmployeeVisible({
          id: candidate.id,
          role: candidate.role,
          department: candidate.department,
          officeId: candidate.officeId,
        })
      )
      .map(candidate => candidate.id);

    employeeWhere = {
      id: {
        in: visibleEmployeeIds.length > 0 ? visibleEmployeeIds : ['__none__'],
      },
    };
  }

  const { rows, totalCount } = await listPaginatedEmployeeAnnualLeaveBalancesForAdmin({
    year,
    employeeId,
    employeeRoleFilter: accessContext.employeeRoleFilter,
    employeeWhere,
    skip,
    take: perPage,
  });

  const employees = Array.from(
    new Map(
      rows.map(row => [
        row.employee.id,
        {
          id: row.employee.id,
          fullName: row.employee.fullName,
          employeeNumber: row.employee.employeeNumber,
        },
      ])
    ).values()
  ).sort((a, b) => a.fullName.localeCompare(b.fullName));

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
