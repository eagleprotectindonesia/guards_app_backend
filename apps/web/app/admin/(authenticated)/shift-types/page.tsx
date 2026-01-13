import { serialize, getPaginationParams } from '@/lib/utils';
import ShiftTypeList from './components/shift-type-list';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getPaginatedShiftTypes } from '@/lib/data-access/shift-types';
import { getAdminSession } from '@/lib/admin-auth';

export const metadata: Metadata = {
  title: 'Shift Types Management',
};

export const dynamic = 'force-dynamic';

type ShiftTypesPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ShiftTypesPage(props: ShiftTypesPageProps) {
  const session = await getAdminSession();
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);

  const { shiftTypes, totalCount } = await getPaginatedShiftTypes({
    skip,
    take: perPage,
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading shift types...</div>}>
        <ShiftTypeList
          shiftTypes={serialize(shiftTypes)}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          isSuperAdmin={session?.isSuperAdmin}
        />
      </Suspense>
    </div>
  );
}
