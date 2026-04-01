import { getPaginationParams } from '@/lib/server-utils';
import EmployeeDayOffList from '../components/employee-day-off-list';
import OfficeShiftsTabs from '../components/office-shifts-tabs';
import { format } from 'date-fns';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getActiveEmployeesSummary } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { EmployeeSummary } from '@repo/database';

export const metadata: Metadata = {
  title: 'Employee Day Offs',
};

export const dynamic = 'force-dynamic';

export default async function OfficeDayOffsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission(PERMISSIONS.OFFICE_SHIFTS.VIEW);
  const resolvedSearchParams = await searchParams;
  const { page, perPage } = getPaginationParams(resolvedSearchParams);

  const startDate =
    typeof resolvedSearchParams.startDate === 'string'
      ? resolvedSearchParams.startDate
      : format(new Date(), 'yyyy-MM-dd');
  const endDate = typeof resolvedSearchParams.endDate === 'string' ? resolvedSearchParams.endDate : undefined;
  const employeeId = typeof resolvedSearchParams.employeeId === 'string' ? resolvedSearchParams.employeeId : undefined;

  const employeeOptions: EmployeeSummary[] = await getActiveEmployeesSummary('office');

  return (
    <div className="max-w-7xl mx-auto">
      <OfficeShiftsTabs />

      <Suspense fallback={<div>Loading day offs...</div>}>
        <EmployeeDayOffList
          startDate={startDate}
          endDate={endDate || undefined}
          employeeId={employeeId}
          employees={employeeOptions}
          page={page}
          perPage={perPage}
        />
      </Suspense>
    </div>
  );
}
