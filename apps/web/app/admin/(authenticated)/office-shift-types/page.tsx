import { getPaginationParams } from '@/lib/server-utils';
import OfficeShiftTypeList from './components/office-shift-type-list';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getPaginatedOfficeShiftTypes } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { SerializedOfficeShiftTypeWithAdminInfoDto } from '@/types/office-shift-types';
import { AdminListSkeleton } from '../components/loading/admin-list-skeleton';

export const metadata: Metadata = {
  title: 'Office Shift Types Management',
};

export const dynamic = 'force-dynamic';

export default async function OfficeShiftTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requirePermission(PERMISSIONS.OFFICE_SHIFT_TYPES.VIEW);
  const resolvedSearchParams = await searchParams;
  const { page, perPage, skip } = getPaginationParams(resolvedSearchParams);

  const sortBy = (resolvedSearchParams.sortBy as string) || 'name';
  const sortOrder =
    typeof resolvedSearchParams.sortOrder === 'string' && ['asc', 'desc'].includes(resolvedSearchParams.sortOrder)
      ? (resolvedSearchParams.sortOrder as 'asc' | 'desc')
      : 'asc';
  const validSortFields = ['name', 'startTime', 'endTime'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';

  const { officeShiftTypes, totalCount } = await getPaginatedOfficeShiftTypes({
    skip,
    take: perPage,
    orderBy: { [sortField]: sortOrder },
  });

  const serializedOfficeShiftTypes: SerializedOfficeShiftTypeWithAdminInfoDto[] = officeShiftTypes.map(item => ({
    id: item.id,
    name: item.name,
    startTime: item.startTime,
    endTime: item.endTime,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    createdBy: item.createdBy ? { name: item.createdBy.name } : null,
    lastUpdatedBy: item.lastUpdatedBy ? { name: item.lastUpdatedBy.name } : null,
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<AdminListSkeleton rows={7} />}>
        <OfficeShiftTypeList
          officeShiftTypes={serializedOfficeShiftTypes}
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
