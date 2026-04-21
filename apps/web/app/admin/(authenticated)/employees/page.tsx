import { serialize, getPaginationParams } from '@/lib/server-utils';
import EmployeeList from './components/employee-list';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import {
  db,
  getPaginatedEmployees,
  getLastEmployeeSyncDuplicateWarning,
  getLastEmployeeSyncTimestamp,
  getEmployeeSearchWhere,
} from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { applyEmployeeVisibilityScope } from '@/lib/auth/admin-visibility';
import { isOfficeWorkSchedulesEnabled } from '@/lib/feature-flags';
import { resolveEmployeeVisibilityAccessContext } from '@/lib/auth/leave-ownership';

export const metadata: Metadata = {
  title: 'Employees Management',
};

export const dynamic = 'force-dynamic';

type EmployeesPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function EmployeesPage(props: EmployeesPageProps) {
  const session = await requirePermission(PERMISSIONS.EMPLOYEES.VIEW);
  const officeWorkSchedulesEnabled = isOfficeWorkSchedulesEnabled();
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);
  const query = searchParams.q as string | undefined;

  // Handle sorting parameters
  const sortBy = typeof searchParams.sortBy === 'string' ? searchParams.sortBy : 'fullName';

  const sortOrder =
    typeof searchParams.sortOrder === 'string' && ['asc', 'desc'].includes(searchParams.sortOrder)
      ? (searchParams.sortOrder as 'asc' | 'desc')
      : 'asc';

  // Validate sortBy field to prevent SQL injection
  const validSortFields = ['fullName', 'employeeNumber', 'department', 'jobTitle'];
  const sortField: string = validSortFields.includes(sortBy) ? sortBy : 'fullName';

  const baseWhere = applyEmployeeVisibilityScope(getEmployeeSearchWhere(query), session);
  const ownershipContext = await resolveEmployeeVisibilityAccessContext(session);
  let where = baseWhere;

  if (!session.isSuperAdmin) {
    const ownershipCandidates = await db.employee.findMany({
      where: {
        ...baseWhere,
        deletedAt: null,
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
        ownershipContext.isEmployeeVisible({
          id: candidate.id,
          role: candidate.role,
          department: candidate.department,
          officeId: candidate.officeId,
        })
      )
      .map(candidate => candidate.id);

    where = {
      AND: [baseWhere, { id: { in: visibleEmployeeIds.length > 0 ? visibleEmployeeIds : ['__none__'] } }],
    };
  }

  const { employees, totalCount } = await getPaginatedEmployees({
    where,
    orderBy: { [sortField]: sortOrder as 'asc' | 'desc' },
    skip,
    take: perPage,
    includeActiveOfficeWorkScheduleName: officeWorkSchedulesEnabled,
  });

  const [lastSyncTimestamp, lastSyncDuplicateWarning] = await Promise.all([
    getLastEmployeeSyncTimestamp(),
    getLastEmployeeSyncDuplicateWarning(),
  ]);

  const serializedEmployees = serialize(employees);

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading employees...</div>}>
        <EmployeeList
          employees={serializedEmployees}
          showOfficeWorkSchedules={officeWorkSchedulesEnabled}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          sortBy={sortField}
          sortOrder={sortOrder}
          lastSyncTimestamp={lastSyncTimestamp}
          lastSyncDuplicateWarning={lastSyncDuplicateWarning}
        />
      </Suspense>
    </div>
  );
}
