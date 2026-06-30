import { getPaginationParams } from '@/lib/server-utils';
import OfficeAttendanceList from './components/office-attendance-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';
import { getActiveEmployeesSummary, getActiveOffices } from '@repo/database';
import {
  getPairedOfficeAttendanceSessions,
  getScheduledPaidMinutesForOfficeAttendance,
  resolveOfficeAttendanceContextForEmployee,
} from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessOfficeAttendance } from '@/lib/auth/admin-visibility';
import {
  AttendanceEmployeeSummary,
  AttendanceOfficeSummary,
} from '@/types/attendance';
import { forbidden } from 'next/navigation';
import {
  buildPairedSessionContextMap,
  toDisplayRowsFromPairedSessions,
} from './office-attendance-display';
import { buildCachedAttendanceContextResolvers } from '@/lib/attendance-context-cache';
import { AdminListSkeleton } from '../../components/loading/admin-list-skeleton';

export const dynamic = 'force-dynamic';

type AttendancePageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OfficeAttendancePage(props: AttendancePageProps) {
  const session = await requirePermission(PERMISSIONS.ATTENDANCE.VIEW);
  if (!canAccessOfficeAttendance(session)) {
    forbidden();
  }
  const searchParams = await props.searchParams;
  const { page, perPage } = getPaginationParams(searchParams);

  const employeeNumber = typeof searchParams.employeeNumber === 'string' ? searchParams.employeeNumber : undefined;
  const from = typeof searchParams.from === 'string' ? searchParams.from : undefined;
  const to = typeof searchParams.to === 'string' ? searchParams.to : undefined;
  const todayEnd = endOfDay(new Date());

  const where: Prisma.OfficeAttendanceWhereInput = {};

  if (employeeNumber) {
    where.employee = { employeeNumber };
  }

  if (from || to) {
    where.businessDate = {};
    if (from) {
      where.businessDate.gte = startOfDay(new Date(from));
    }
    if (to) {
      const requestedEnd = endOfDay(new Date(to));
      where.businessDate.lte = requestedEnd < todayEnd ? requestedEnd : todayEnd;
    } else {
      where.businessDate.lte = todayEnd;
    }
  } else {
    where.businessDate = { lte: todayEnd };
  }

  const sortBy = (searchParams.sortBy as string) || 'businessDate';
  const sortOrder =
    typeof searchParams.sortOrder === 'string' && ['asc', 'desc'].includes(searchParams.sortOrder)
      ? (searchParams.sortOrder as 'asc' | 'desc')
      : 'desc';

  const validSortFields = ['businessDate', 'employeeNumber', 'office'] as const;
  type ValidSort = (typeof validSortFields)[number];
  const resolvedSortBy: ValidSort = (validSortFields as readonly string[]).includes(sortBy)
    ? (sortBy as ValidSort)
    : 'businessDate';

  const skip = (page - 1) * perPage;

  const [pairedResult, employees, offices] = await Promise.all([
    getPairedOfficeAttendanceSessions({
      where,
      orderBy: resolvedSortBy,
      orderDirection: sortOrder,
      skip,
      take: perPage,
    }),
    getActiveEmployeesSummary('office'),
    getActiveOffices(),
  ]);

  const { sessions, total } = pairedResult;

  const cachedResolvers = buildCachedAttendanceContextResolvers({
    resolveContext: resolveOfficeAttendanceContextForEmployee,
    getScheduledPaidMinutes: getScheduledPaidMinutesForOfficeAttendance,
  });

  const contextMap = await buildPairedSessionContextMap({
    sessions,
    resolveContext: cachedResolvers.resolveContext,
    getScheduledPaidMinutes: cachedResolvers.getScheduledPaidMinutes,
  });

  const displayRows = toDisplayRowsFromPairedSessions({ sessions, contextMap });

  const serializedEmployees: AttendanceEmployeeSummary[] = employees.map(emp => ({
    id: emp.id,
    fullName: emp.fullName,
    employeeNumber: emp.employeeNumber,
  }));

  const serializedOffices: AttendanceOfficeSummary[] = offices.map(office => ({
    id: office.id,
    name: office.name,
  }));

  const initialFilters = {
    employeeNumber,
    startDate: from,
    endDate: to,
  };

  return (
    <div className="max-w-7xl mx-auto py-8">
      <Suspense fallback={<AdminListSkeleton rows={8} />}>
        <OfficeAttendanceList
          attendances={displayRows}
          page={page}
          perPage={perPage}
          totalCount={total}
          offices={serializedOffices}
          employees={serializedEmployees}
          initialFilters={initialFilters}
          sortBy={sortBy}
          sortOrder={sortOrder}
        />
      </Suspense>
    </div>
  );
}
