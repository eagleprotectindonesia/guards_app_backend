import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Prisma, db, getPaginatedEmployeeLeaveRequestsForAdmin, listEmployeeLeaveRequestsForAdmin } from '@repo/database';
import type { LeaveRequestStatus } from '@repo/types';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { resolveLeaveRequestAccessContext } from '@/lib/auth/leave-ownership';
import { getPaginationParams, serialize } from '@/lib/server-utils';
import LeaveRequestList from './components/leave-request-list';
import { SerializedLeaveRequestAdminListItemDto } from '@/types/leave-requests';

export const metadata: Metadata = {
  title: 'Leave Requests Management',
};

export const dynamic = 'force-dynamic';

const ALLOWED_STATUSES: LeaveRequestStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];
const ALLOWED_SORT_FIELDS = ['startDate', 'status'] as const;
type LeaveRequestSortField = (typeof ALLOWED_SORT_FIELDS)[number];

function parseStatusesParam(rawStatuses: string | string[] | undefined): LeaveRequestStatus[] {
  const raw = Array.isArray(rawStatuses) ? rawStatuses[0] : rawStatuses;
  if (!raw) return ALLOWED_STATUSES;

  const parsed = raw
    .split(',')
    .map(value => value.trim())
    .filter((status): status is LeaveRequestStatus => ALLOWED_STATUSES.includes(status as LeaveRequestStatus));

  return parsed.length > 0 ? parsed : ALLOWED_STATUSES;
}

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
  const sortByRaw = typeof searchParams.sortBy === 'string' ? searchParams.sortBy : undefined;
  const sortBy: LeaveRequestSortField = ALLOWED_SORT_FIELDS.includes(sortByRaw as LeaveRequestSortField)
    ? (sortByRaw as LeaveRequestSortField)
    : 'startDate';
  const sortOrder: 'asc' | 'desc' =
    typeof searchParams.sortOrder === 'string' && ['asc', 'desc'].includes(searchParams.sortOrder)
      ? (searchParams.sortOrder as 'asc' | 'desc')
      : 'desc';

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

  const [{ leaveRequests, totalCount }, filterEmployeeResults] = await Promise.all([
    getPaginatedEmployeeLeaveRequestsForAdmin({
      statuses,
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
    listEmployeeLeaveRequestsForAdmin({
      statuses,
      startDate,
      endDate,
      employeeRoleFilter: accessContext.employeeRoleFilter,
      employeeWhere,
    }),
  ]);

  const employeeOptions = Array.from(
    new Map(
      filterEmployeeResults.map(request => [
        request.employee.id,
        {
          id: request.employee.id,
          fullName: request.employee.fullName,
          employeeNumber: request.employee.employeeNumber,
        },
      ])
    ).values()
  ).sort((a, b) => a.fullName.localeCompare(b.fullName));

  const serializedLeaveRequests = serialize(leaveRequests) as SerializedLeaveRequestAdminListItemDto[];

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading leave requests...</div>}>
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
          }}
          sortBy={sortBy}
          sortOrder={sortOrder}
        />
      </Suspense>
    </div>
  );
}
