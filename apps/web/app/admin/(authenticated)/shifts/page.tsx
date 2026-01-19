import { prisma } from '@/lib/prisma';
import { serialize, getPaginationParams } from '@/lib/utils';
import ShiftList from './components/shift-list';
import { parseISO, startOfDay, endOfDay, format } from 'date-fns';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getActiveSites } from '@/lib/data-access/sites';
import { getActiveEmployees } from '@/lib/data-access/employees';
import { getPaginatedShifts } from '@/lib/data-access/shifts';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const metadata: Metadata = {
  title: 'Shifts Management',
};

export const dynamic = 'force-dynamic';

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission(PERMISSIONS.SHIFTS.VIEW);
  const resolvedSearchParams = await searchParams;
  const { page, perPage, skip } = getPaginationParams(resolvedSearchParams);

  // Default startDate to today if not provided
  const startDate =
    typeof resolvedSearchParams.startDate === 'string'
      ? resolvedSearchParams.startDate
      : format(new Date(), 'yyyy-MM-dd');
  const endDate = typeof resolvedSearchParams.endDate === 'string' ? resolvedSearchParams.endDate : undefined;
  const employeeId = typeof resolvedSearchParams.employeeId === 'string' ? resolvedSearchParams.employeeId : undefined;
  const siteId = typeof resolvedSearchParams.siteId === 'string' ? resolvedSearchParams.siteId : undefined;
  const sort =
    typeof resolvedSearchParams.sort === 'string' && ['asc', 'desc'].includes(resolvedSearchParams.sort)
      ? resolvedSearchParams.sort
      : 'desc';

  const parsedStartDate = startDate ? startOfDay(parseISO(startDate)) : undefined;
  const parsedEndDate = endDate ? endOfDay(parseISO(endDate)) : undefined;

  const where = {
    startsAt: {
      gte: parsedStartDate,
      lte: parsedEndDate,
    },
    employeeId: employeeId || undefined,
    siteId: siteId || undefined,
  };

  const { shifts, totalCount } = await getPaginatedShifts({
    where,
    orderBy: { startsAt: sort as 'asc' | 'desc' },
    skip,
    take: perPage,
    include: {
      site: true,
      shiftType: true,
      employee: true,
      attendance: true,
      createdBy: { select: { name: true } },
      lastUpdatedBy: { select: { name: true } },
    },
  });

  const sites = await getActiveSites();
  const shiftTypes = await prisma.shiftType.findMany({ orderBy: { name: 'asc' } });
  const employees = await getActiveEmployees();

  const serializedShifts = serialize(shifts);
  const serializedSites = serialize(sites);
  const serializedShiftTypes = serialize(shiftTypes);
  const serializedEmployees = serialize(employees);

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading shifts...</div>}>
        <ShiftList
          shifts={serializedShifts}
          sites={serializedSites}
          shiftTypes={serializedShiftTypes}
          employees={serializedEmployees}
          startDate={startDate}
          endDate={endDate}
          employeeId={employeeId}
          siteId={siteId}
          sort={sort}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
        />
      </Suspense>
    </div>
  );
}
