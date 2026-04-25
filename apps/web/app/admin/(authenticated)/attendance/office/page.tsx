import { getPaginationParams } from '@/lib/server-utils';
import OfficeAttendanceList from './components/office-attendance-list';
import AttendanceTabs from '../components/attendance-tabs';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';
import { getActiveEmployeesSummary, getActiveOffices } from '@repo/database';
import { getScheduledPaidMinutesForOfficeAttendance, listOfficeAttendance } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessOfficeAttendance } from '@/lib/auth/admin-visibility';
import {
  AttendanceEmployeeSummary,
  AttendanceOfficeSummary,
  OfficeAttendanceMetadataDto,
  SerializedOfficeAttendanceWithRelationsDto,
} from '@/types/attendance';
import { forbidden } from 'next/navigation';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';
import {
  buildOfficeAttendanceDisplayRows,
  paginateOfficeAttendanceDisplayRows,
} from './office-attendance-display';

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

  const [attendances, employees, offices] = await Promise.all([
    listOfficeAttendance({
      where,
      orderBy: { recordedAt: 'asc' },
    }),
    getActiveEmployeesSummary('office'),
    getActiveOffices(),
  ]);

  const serializedAttendances: SerializedOfficeAttendanceWithRelationsDto[] = attendances.map(att => ({
    id: att.id,
    recordedAt: att.recordedAt.toISOString(),
    status: att.status,
    employeeId: att.employeeId,
    officeId: att.officeId,
    picture: att.picture ?? null,
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
          employeeNumber: att.employee.employeeNumber,
        }
      : null,
  }));

  await Promise.all(
    serializedAttendances.map(async attendance => {
      if (!attendance.picture || attendance.picture.startsWith('http')) return;
      attendance.picture = await getCachedPresignedDownloadUrl(attendance.picture);
    })
  );

  const unifiedAttendances = await buildOfficeAttendanceDisplayRows(
    serializedAttendances,
    getScheduledPaidMinutesForOfficeAttendance
  );
  const totalCount = unifiedAttendances.length;
  const paginatedAttendances = paginateOfficeAttendanceDisplayRows(unifiedAttendances, page, perPage);

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
    employeeId,
    startDate: from,
    endDate: to,
  };

  return (
    <div className="max-w-7xl mx-auto py-8">
      <AttendanceTabs />
      <Suspense fallback={<div>Loading office attendances...</div>}>
        <OfficeAttendanceList
          attendances={paginatedAttendances}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          offices={serializedOffices}
          employees={serializedEmployees}
          initialFilters={initialFilters}
        />
      </Suspense>
    </div>
  );
}
