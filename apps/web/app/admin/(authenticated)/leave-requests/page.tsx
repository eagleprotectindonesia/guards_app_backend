import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getPaginatedEmployeeLeaveRequestsForAdmin, listLeaveRequestFilterEmployeesForAdmin } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext, buildVisibleEmployeeWhereClause } from '@/lib/auth/leave-ownership';
import { getPaginationParams, serialize } from '@/lib/server-utils';
import LeaveRequestList from './components/leave-request-list';
import { SerializedLeaveRequestAdminListItemDto } from '@/types/leave-requests';
import {
  mergeReasonFilters,
  parseCategoriesParam,
  parseReasonsParam,
  parseSortByParam,
  parseSortOrderParam,
  parseStatusesParam,
} from './filters';
import { AdminListSkeleton } from '../components/loading/admin-list-skeleton';

export const metadata: Metadata = {
  title: 'Leave Requests Management',
};

export const dynamic = 'force-dynamic';

type LeaveRequestsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function LeaveRequestsPage(props: LeaveRequestsPageProps) {
  const session = await requirePermission(PERMISSIONS.LEAVE_REQUESTS.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);
  const statuses = parseStatusesParam(searchParams.statuses);
  const employeeId = typeof searchParams.employeeId === 'string' ? searchParams.employeeId : undefined;
  const startDate = typeof searchParams.startDate === 'string' ? searchParams.startDate : undefined;
  const endDate = typeof searchParams.endDate === 'string' ? searchParams.endDate : undefined;
  const reasonFilters = parseReasonsParam(searchParams.reasons);
  const categoryFilters = parseCategoriesParam(searchParams.categories);
  const reasons = mergeReasonFilters(reasonFilters, categoryFilters);
  const sortBy = parseSortByParam(searchParams.sortBy);
  const sortOrder = parseSortOrderParam(searchParams.sortOrder);

  const accessContext = await resolveLeaveRequestAccessContext(session);
  const employeeWhere = await buildVisibleEmployeeWhereClause(session, accessContext);

  const [{ leaveRequests, totalCount }, filterEmployeeResults] = await Promise.all([
    getPaginatedEmployeeLeaveRequestsForAdmin({
      statuses,
      reasons,
      employeeId,
      startDate,
      endDate,
      employeeRoleFilter: accessContext.employeeRoleFilter,
      employeeWhere,
      sortBy,
      sortOrder,
      skip,
      take: perPage,
    }),
    listLeaveRequestFilterEmployeesForAdmin({
      statuses,
      reasons,
      startDate,
      endDate,
      employeeRoleFilter: accessContext.employeeRoleFilter,
      employeeWhere,
    }),
  ]);

  const employeeOptions = filterEmployeeResults.map(item => item.employee);

  const serializedLeaveRequests = serialize(leaveRequests) as SerializedLeaveRequestAdminListItemDto[];

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<AdminListSkeleton rows={8} />}>
        <LeaveRequestList
          leaveRequests={serializedLeaveRequests}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          employees={employeeOptions}
          initialFilters={{
            statuses,
            employeeId,
            startDate,
            endDate,
            reasons: reasonFilters,
            categories: categoryFilters,
          }}
          sortBy={sortBy}
          sortOrder={sortOrder}
        />
      </Suspense>
    </div>
  );
}
