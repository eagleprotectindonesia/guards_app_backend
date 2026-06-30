import { getPaginationParams } from '@/lib/server-utils';
import AttendanceList from './components/attendance-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';
import { getActiveEmployeesSummary } from '@repo/database';
import { getPaginatedAttendance } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { applyAttendanceVisibilityScope, getEmployeeRoleFilter } from '@/lib/auth/admin-visibility';
import {
  AttendanceEmployeeSummary,
  AttendanceMetadataDto,
  SerializedAttendanceWithRelationsDto,
} from '@/types/attendance';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';
import { AdminListSkeleton } from '../components/loading/admin-list-skeleton';

export const dynamic = 'force-dynamic';

type AttendancePageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AttendancePage(props: AttendancePageProps) {
  const session = await requirePermission(PERMISSIONS.ATTENDANCE.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);

  // Extract filters from searchParams
  const employeeNumber = typeof searchParams.employeeNumber === 'string' ? searchParams.employeeNumber : undefined;
  const from = typeof searchParams.from === 'string' ? searchParams.from : undefined;
  const to = typeof searchParams.to === 'string' ? searchParams.to : undefined;

  // Build where clause for attendance records
  const baseWhere: Prisma.AttendanceWhereInput = {};

  if (employeeNumber) {
    baseWhere.employee = { employeeNumber };
  }

  if (from || to) {
    baseWhere.recordedAt = {};
    if (from) {
      baseWhere.recordedAt.gte = startOfDay(new Date(from));
    }
    if (to) {
      baseWhere.recordedAt.lte = endOfDay(new Date(to));
    }
  }

  const where = applyAttendanceVisibilityScope(baseWhere, session);
  const employeeRoleFilter = getEmployeeRoleFilter(session.rolePolicy);

  const sortBy = (searchParams.sortBy as string) || 'date';
  const sortOrder =
    typeof searchParams.sortOrder === 'string' && ['asc', 'desc'].includes(searchParams.sortOrder)
      ? (searchParams.sortOrder as 'asc' | 'desc')
      : 'desc';

  const sortFieldMap: Record<string, Prisma.AttendanceOrderByWithRelationInput> = {
    date: { shift: { date: sortOrder } },
    employeeNumber: { employee: { employeeNumber: sortOrder } },
    site: { shift: { site: { name: sortOrder } } },
    shift: { shift: { shiftType: { name: sortOrder } } },
  };
  const validSortFields = Object.keys(sortFieldMap);
  const orderBy = sortFieldMap[validSortFields.includes(sortBy) ? sortBy : 'date'];

  const [{ attendances, totalCount }, employees] = await Promise.all([
    getPaginatedAttendance({
      where,
      orderBy,
      skip,
      take: perPage,
    }),
    getActiveEmployeesSummary(employeeRoleFilter),
  ]);

  const serializedAttendances: SerializedAttendanceWithRelationsDto[] = attendances.map(att => ({
    id: att.id,
    recordedAt: att.recordedAt.toISOString(),
    status: att.status,
    employeeId: att.employeeId,
    shiftId: att.shiftId,
    metadata: att.metadata as AttendanceMetadataDto | null,
    shift: {
      id: att.shift.id,
      date: att.shift.date.toISOString(),
      site: {
        id: att.shift.site.id,
        name: att.shift.site.name,
      },
      shiftType: {
        id: att.shift.shiftType.id,
        name: att.shift.shiftType.name,
      },
    },
    employee: att.employee
      ? {
          id: att.employee.id,
          fullName: att.employee.fullName,
          employeeNumber: att.employee.employeeNumber,
        }
      : null,
    picture: att.picture ?? null,
  }));

  await Promise.all(
    serializedAttendances.map(async attendance => {
      if (!attendance.picture || attendance.picture.startsWith('http')) return;
      attendance.picture = await getCachedPresignedDownloadUrl(attendance.picture);
    })
  );

  const serializedEmployees: AttendanceEmployeeSummary[] = employees.map(emp => ({
    id: emp.id,
    fullName: emp.fullName,
    employeeNumber: emp.employeeNumber,
  }));

  const initialFilters = {
    employeeNumber,
    startDate: from,
    endDate: to,
  };

  return (
    <div className="max-w-7xl mx-auto py-8">
      <Suspense fallback={<AdminListSkeleton rows={8} />}>
        <AttendanceList
          attendances={serializedAttendances}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          employees={serializedEmployees}
          initialFilters={initialFilters}
          sortBy={sortBy}
          sortOrder={sortOrder}
        />
      </Suspense>
    </div>
  );
}
