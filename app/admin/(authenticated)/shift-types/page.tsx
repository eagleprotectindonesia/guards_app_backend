import { serialize, getPaginationParams } from '@/lib/utils';
import ShiftTypeList from './components/shift-type-list';
import { Suspense } from 'react';
import { getPaginatedShiftTypes } from '@/lib/data-access/shift-types';

export const dynamic = 'force-dynamic';

type ShiftTypesPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ShiftTypesPage(props: ShiftTypesPageProps) {
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);

  const { shiftTypes, totalCount } = await getPaginatedShiftTypes({
    orderBy: { name: 'asc' },
    skip,
    take: perPage,
  });

  const serializedShiftTypes = serialize(shiftTypes);

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading shift types...</div>}>
        <ShiftTypeList shiftTypes={serializedShiftTypes} page={page} perPage={perPage} totalCount={totalCount} />
      </Suspense>
    </div>
  );
}
