import { getPaginationParams } from '@/lib/server-utils';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { prisma, getPaginatedGroupShifts, getSystemSetting } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import GuardShiftsTabs from '../components/guard-shifts-tabs';
import GroupShiftList from '../components/group-shift-list';
import { AdminListSkeleton } from '../../components/loading/admin-list-skeleton';

export const metadata: Metadata = {
  title: 'Group Shifts',
};

export const dynamic = 'force-dynamic';

export default async function GroupShiftsPage({
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
  const siteId = typeof resolvedSearchParams.siteId === 'string' ? resolvedSearchParams.siteId : undefined;
  const endSiteId = typeof resolvedSearchParams.endSiteId === 'string' ? resolvedSearchParams.endSiteId : undefined;
  const sortBy =
    typeof resolvedSearchParams.sortBy === 'string' ? resolvedSearchParams.sortBy : 'date';
  const sortOrder =
    typeof resolvedSearchParams.sortOrder === 'string' && ['asc', 'desc'].includes(resolvedSearchParams.sortOrder)
      ? (resolvedSearchParams.sortOrder as 'asc' | 'desc')
      : 'desc';

  const parsedStartDate = startDate ? startOfDay(parseISO(startDate)) : undefined;
  const parsedEndDate = endDate ? endOfDay(parseISO(endDate)) : undefined;

  const [groupShiftsResult, hideEscortSetting] = await Promise.all([
    getPaginatedGroupShifts({
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      siteId,
      endSiteId,
      page,
      perPage,
      sortBy,
      sortOrder,
    }),
    getSystemSetting('HIDE_ESCORT_SITES'),
  ]);
  const hideEscortSites = hideEscortSetting?.value === '1';
  const { groupShifts, totalCount } = groupShiftsResult;

  const sites = await prisma.site.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
  const escortSites = sites.filter(s => s.kind === 'escort');

  const siteOptions = sites.map(s => ({ id: s.id, name: s.name }));
  const escortSiteOptions = escortSites.map(s => ({ id: s.id, name: s.name }));

  return (
    <div className="max-w-7xl mx-auto">
      <GuardShiftsTabs />
      <Suspense fallback={<AdminListSkeleton rows={8} />}>
        <GroupShiftList
          groupShifts={groupShifts}
          sites={siteOptions}
          escortSites={escortSiteOptions}
          startDate={startDate}
          endDate={endDate}
          siteId={siteId}
          endSiteId={endSiteId}
          sortBy={sortBy}
          sortOrder={sortOrder}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          hideEscortSites={hideEscortSites}
        />
      </Suspense>
    </div>
  );
}
