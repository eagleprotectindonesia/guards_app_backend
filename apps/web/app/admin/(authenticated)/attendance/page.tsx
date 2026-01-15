import { serialize, getPaginationParams, Serialized } from '@/lib/utils';
import AttendanceList, { AttendanceWithRelations } from './components/attendance-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';
import { getAllEmployees } from '@/lib/data-access/employees';
import { getPaginatedAttendance } from '@/lib/data-access/attendance';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

type AttendancePageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AttendancePage(props: AttendancePageProps) {
  await requirePermission(PERMISSIONS.ATTENDANCE.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);

  // Extract filters from searchParams
  const employeeId = typeof searchParams.employeeId === 'string' ? searchParams.employeeId : undefined;
  const from = typeof searchParams.from === 'string' ? searchParams.from : undefined;
  const to = typeof searchParams.to === 'string' ? searchParams.to : undefined;

  // Build where clause for attendance records
  const where: Prisma.AttendanceWhereInput = {};

  if (employeeId) {
    where.employeeId = employeeId;
  }

  if (from || to) {
    where.recordedAt = {};
    if (from) {
      where.recordedAt.gte = startOfDay(new Date(from));
    }
    if (to) {
      where.recordedAt.lte = endOfDay(new Date(to));
    }
  }

  const [{ attendances, totalCount }, employees] = await Promise.all([
    getPaginatedAttendance({
      where,
      orderBy: { recordedAt: 'desc' },
      skip,
      take: perPage,
    }),
    getAllEmployees({ firstName: 'asc' }),
  ]);

  const serializedAttendances = serialize(attendances) as unknown as Serialized<AttendanceWithRelations>[];
  const serializedEmployees = serialize(employees);

  const initialFilters = {
    employeeId,
    startDate: from,
    endDate: to,
  };

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading attendances...</div>}>
        <AttendanceList
          attendances={serializedAttendances}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          employees={serializedEmployees}
          initialFilters={initialFilters}
        />
      </Suspense>
    </div>
  );
}
