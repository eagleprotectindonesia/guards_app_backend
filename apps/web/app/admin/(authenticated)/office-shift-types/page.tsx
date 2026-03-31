import { getPaginationParams } from '@/lib/server-utils';
import OfficeShiftTypeList from './components/office-shift-type-list';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getPaginatedOfficeShiftTypes } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { SerializedOfficeShiftTypeWithAdminInfoDto } from '@/types/office-shift-types';

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

  const { officeShiftTypes, totalCount } = await getPaginatedOfficeShiftTypes({
    skip,
    take: perPage,
    orderBy: { createdAt: 'desc' },
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
      <Suspense fallback={<div>Loading office shift types...</div>}>
        <OfficeShiftTypeList
          officeShiftTypes={serializedOfficeShiftTypes}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
        />
      </Suspense>
    </div>
  );
}
