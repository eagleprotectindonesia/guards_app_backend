import { prisma } from '@/lib/prisma';
import { serialize, getPaginationParams } from '@/lib/utils';
import ShiftList from './components/shift-list';
import { parseISO, startOfDay, endOfDay } from 'date-fns';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getActiveSites } from '@/lib/data-access/sites';
import { getActiveGuards } from '@/lib/data-access/guards';
import { getPaginatedShifts } from '@/lib/data-access/shifts';
import { getCurrentAdmin } from '@/lib/admin-auth';

export const metadata: Metadata = {
  title: 'Shifts Management',
};

export const dynamic = 'force-dynamic';

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const currentAdmin = await getCurrentAdmin();
  const resolvedSearchParams = await searchParams;
  const { page, perPage, skip } = getPaginationParams(resolvedSearchParams);

  const startDate = typeof resolvedSearchParams.startDate === 'string' ? resolvedSearchParams.startDate : undefined;
  const endDate = typeof resolvedSearchParams.endDate === 'string' ? resolvedSearchParams.endDate : undefined;
  const guardId = typeof resolvedSearchParams.guardId === 'string' ? resolvedSearchParams.guardId : undefined;
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
    guardId: guardId || undefined,
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
      guard: true,
      attendance: true,
      createdBy: { select: { name: true } },
      lastUpdatedBy: { select: { name: true } },
    },
  });

  const sites = await getActiveSites();
  const shiftTypes = await prisma.shiftType.findMany({ orderBy: { name: 'asc' } });
  const guards = await getActiveGuards();

  const serializedShifts = serialize(shifts);
  const serializedSites = serialize(sites);
  const serializedShiftTypes = serialize(shiftTypes);
  const serializedGuards = serialize(guards);

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading shifts...</div>}>
        <ShiftList
          shifts={serializedShifts}
          sites={serializedSites}
          shiftTypes={serializedShiftTypes}
          guards={serializedGuards}
          startDate={startDate}
          endDate={endDate}
          guardId={guardId}
          siteId={siteId}
          sort={sort}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          isSuperAdmin={currentAdmin?.role === 'superadmin'}
        />
      </Suspense>
    </div>
  );
}
