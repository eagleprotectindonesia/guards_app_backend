import { getPaginationParams } from '@/lib/server-utils';
import ShiftTypeList from './components/shift-type-list';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getPaginatedShiftTypes } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { SerializedShiftTypeWithAdminInfoDto } from '@/types/shift-types';
import { AdminListSkeleton } from '../components/loading/admin-list-skeleton';

export const metadata: Metadata = {
  title: 'Guard Shift Types Management',
};

export const dynamic = 'force-dynamic';

type ShiftTypesPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ShiftTypesPage(props: ShiftTypesPageProps) {
  await requirePermission(PERMISSIONS.SHIFT_TYPES.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);

  const sortBy = (searchParams.sortBy as string) || 'name';
  const sortOrder =
    typeof searchParams.sortOrder === 'string' && ['asc', 'desc'].includes(searchParams.sortOrder)
      ? (searchParams.sortOrder as 'asc' | 'desc')
      : 'asc';
  const validSortFields = ['name', 'startTime', 'endTime'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';

  const { shiftTypes, totalCount } = await getPaginatedShiftTypes({
    skip,
    take: perPage,
    orderBy: { [sortField]: sortOrder },
  });

  const serializedShiftTypes: SerializedShiftTypeWithAdminInfoDto[] = shiftTypes.map(
    st => ({
      id: st.id,
      name: st.name,
      startTime: st.startTime,
      endTime: st.endTime,
      createdAt: st.createdAt.toISOString(),
      updatedAt: st.updatedAt.toISOString(),
      createdBy: st.createdBy ? { name: st.createdBy.name } : null,
      lastUpdatedBy: st.lastUpdatedBy ? { name: st.lastUpdatedBy.name } : null,
    })
  );

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<AdminListSkeleton rows={7} />}>
        <ShiftTypeList
          shiftTypes={serializedShiftTypes}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          sortBy={sortField}
          sortOrder={sortOrder}
        />
      </Suspense>
    </div>
  );
}
