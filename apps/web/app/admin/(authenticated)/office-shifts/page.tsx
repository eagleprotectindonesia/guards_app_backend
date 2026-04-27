import { getPaginationParams } from '@/lib/server-utils';
import OfficeShiftList from './components/office-shift-list';
import OfficeShiftsTabs from './components/office-shifts-tabs';
import { parseISO, startOfDay, endOfDay, format } from 'date-fns';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getActiveEmployeesSummary, getDistinctDepartments, getPaginatedOfficeShifts } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { SerializedOfficeShiftWithRelationsDto } from '@/types/office-shifts';
import type { EmployeeSummary } from '@repo/database';

export const metadata: Metadata = {
  title: 'Office Shifts Management',
};

export const dynamic = 'force-dynamic';

export default async function OfficeShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission(PERMISSIONS.OFFICE_SHIFTS.VIEW);
  const resolvedSearchParams = await searchParams;
  const { page, perPage, skip } = getPaginationParams(resolvedSearchParams);

  const startDate =
    typeof resolvedSearchParams.startDate === 'string'
      ? resolvedSearchParams.startDate
      : format(new Date(), 'yyyy-MM-dd');
  const endDate = typeof resolvedSearchParams.endDate === 'string' ? resolvedSearchParams.endDate : undefined;
  const employeeId = typeof resolvedSearchParams.employeeId === 'string' ? resolvedSearchParams.employeeId : undefined;
  const department = typeof resolvedSearchParams.department === 'string' ? resolvedSearchParams.department : undefined;
  const sortBy = typeof resolvedSearchParams.sortBy === 'string' ? resolvedSearchParams.sortBy : 'startsAt';
  const sortOrder: 'asc' | 'desc' =
    typeof resolvedSearchParams.sortOrder === 'string' && ['asc', 'desc'].includes(resolvedSearchParams.sortOrder)
      ? (resolvedSearchParams.sortOrder as 'asc' | 'desc')
      : 'desc';

  const parsedStartDate = startDate ? startOfDay(parseISO(startDate)) : undefined;
  const parsedEndDate = endDate ? endOfDay(parseISO(endDate)) : undefined;

  const { officeShifts, totalCount } = await getPaginatedOfficeShifts({
    where: {
      startsAt: {
        gte: parsedStartDate,
        lte: parsedEndDate,
      },
      employeeId: employeeId || undefined,
      ...(department ? { employee: { department } } : {}),
    },
    orderBy:
      sortBy === 'employee'
        ? { employee: { fullName: sortOrder as 'asc' | 'desc' } }
        : { startsAt: sortOrder as 'asc' | 'desc' },
    skip,
    take: perPage,
  });

  const officeShiftDtos: SerializedOfficeShiftWithRelationsDto[] = officeShifts.map(officeShift => ({
    id: officeShift.id,
    officeShiftTypeId: officeShift.officeShiftTypeId,
    employeeId: officeShift.employeeId,
    date: officeShift.date.toISOString(),
    startsAt: officeShift.startsAt.toISOString(),
    endsAt: officeShift.endsAt.toISOString(),
    status: officeShift.status,
    note: officeShift.note,
    createdAt: officeShift.createdAt.toISOString(),
    updatedAt: officeShift.updatedAt.toISOString(),
    officeShiftType: {
      id: officeShift.officeShiftType.id,
      name: officeShift.officeShiftType.name,
      startTime: officeShift.officeShiftType.startTime,
      endTime: officeShift.officeShiftType.endTime,
    },
    employee: {
      id: officeShift.employee.id,
      fullName: officeShift.employee.fullName,
      employeeNumber: officeShift.employee.employeeNumber,
    },
    officeAttendances: officeShift.officeAttendances.map(attendance => ({
      id: attendance.id,
      officeId: attendance.officeId,
      officeShiftId: attendance.officeShiftId,
      employeeId: attendance.employeeId,
      recordedAt: attendance.recordedAt.toISOString(),
      picture: attendance.picture,
      status: attendance.status,
      metadata: attendance.metadata,
    })),
    createdBy: officeShift.createdBy,
    lastUpdatedBy: officeShift.lastUpdatedBy,
  }));

  const employeeOptions: EmployeeSummary[] = await getActiveEmployeesSummary('office');
  const allDepartments = await getDistinctDepartments();
  const departmentOptions = allDepartments.filter(d => !d.toLowerCase().includes('security'));

  return (
    <div className="max-w-7xl mx-auto">
      <OfficeShiftsTabs />

      <Suspense fallback={<div>Loading office shifts...</div>}>
        <OfficeShiftList
          officeShifts={officeShiftDtos}
          employees={employeeOptions}
          departments={departmentOptions}
          startDate={startDate}
          endDate={endDate}
          employeeId={employeeId}
          department={department}
          sortBy={sortBy}
          sortOrder={sortOrder}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
        />
      </Suspense>
    </div>
  );
}
