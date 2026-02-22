import { getPaginationParams } from '@/lib/utils';
import OfficeAttendanceList from './components/office-attendance-list';
import AttendanceTabs from '../components/attendance-tabs';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';
import { getAllEmployees } from '@/lib/data-access/employees';
import { getPaginatedOfficeAttendance } from '@/lib/data-access/office-attendance';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import {
  AttendanceEmployeeSummary,
  OfficeAttendanceMetadataDto,
  SerializedOfficeAttendanceWithRelationsDto,
} from '@/types/attendance';

export const dynamic = 'force-dynamic';

type AttendancePageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OfficeAttendancePage(props: AttendancePageProps) {
  await requirePermission(PERMISSIONS.ATTENDANCE.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);

  // Extract filters from searchParams
  const employeeId = typeof searchParams.employeeId === 'string' ? searchParams.employeeId : undefined;
  const from = typeof searchParams.from === 'string' ? searchParams.from : undefined;
  const to = typeof searchParams.to === 'string' ? searchParams.to : undefined;

  // Build where clause for attendance records
  const where: Prisma.OfficeAttendanceWhereInput = {};

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
    getPaginatedOfficeAttendance({
      where,
      orderBy: { recordedAt: 'desc' },
      skip,
      take: perPage,
    }),
    getAllEmployees({ orderBy: { fullName: 'asc' } }),
  ]);

  const serializedAttendances: SerializedOfficeAttendanceWithRelationsDto[] = attendances.map(att => ({
    id: att.id,
    recordedAt: att.recordedAt.toISOString(),
    status: att.status,
    employeeId: att.employeeId,
    officeId: att.officeId,
    metadata: att.metadata as OfficeAttendanceMetadataDto | null,
    office: att.office
      ? {
          id: att.office.id,
          name: att.office.name,
        }
      : null,
    employee: att.employee
      ? {
          id: att.employee.id,
          fullName: att.employee.fullName,
        }
      : null,
  }));

  const serializedEmployees: AttendanceEmployeeSummary[] = employees.map(emp => ({
    id: emp.id,
    fullName: emp.fullName,
  }));

  const initialFilters = {
    employeeId,
    startDate: from,
    endDate: to,
  };

  return (
    <div className="max-w-7xl mx-auto py-8">
      <AttendanceTabs />
      <Suspense fallback={<div>Loading office attendances...</div>}>
        <OfficeAttendanceList
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
