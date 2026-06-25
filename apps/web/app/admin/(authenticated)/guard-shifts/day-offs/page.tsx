import { getPaginationParams } from '@/lib/server-utils';
import { format } from 'date-fns';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getActiveEmployeesSummary } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { EmployeeSummary } from '@repo/database';
import GuardShiftsTabs from '../components/guard-shifts-tabs';
import OnsiteDayOffList from '../components/onsite-day-off-list';
import { AdminListSkeleton } from '../../components/loading/admin-list-skeleton';

export const metadata: Metadata = {
  title: 'Onsite Employee Days Off',
};

export const dynamic = 'force-dynamic';

export default async function GuardDayOffsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission(PERMISSIONS.SHIFTS.VIEW);
  const resolvedSearchParams = await searchParams;
  const { page, perPage } = getPaginationParams(resolvedSearchParams);

  const startDate =
    typeof resolvedSearchParams.startDate === 'string'
      ? resolvedSearchParams.startDate
      : format(new Date(), 'yyyy-MM-dd');
  const endDate = typeof resolvedSearchParams.endDate === 'string' ? resolvedSearchParams.endDate : undefined;
  const employeeId = typeof resolvedSearchParams.employeeId === 'string' ? resolvedSearchParams.employeeId : undefined;

  const employeeOptions: EmployeeSummary[] = await getActiveEmployeesSummary('on_site');

  return (
    <div className="max-w-7xl mx-auto">
      <GuardShiftsTabs />

      <Suspense fallback={<AdminListSkeleton rows={7} />}>
        <OnsiteDayOffList
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
