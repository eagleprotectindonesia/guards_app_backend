import { serialize, getPaginationParams } from '@/lib/server-utils';
import type { Serialized } from '@/lib/server-utils';
import OfficeList from './components/office-list';
import { Suspense } from 'react';
import { getPaginatedOffices } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { Office } from '@prisma/client';
import { AdminListSkeleton } from '../components/loading/admin-list-skeleton';

export const dynamic = 'force-dynamic';

type OfficePageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OfficePage(props: OfficePageProps) {
  await requirePermission(PERMISSIONS.OFFICES.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);
  const query = typeof searchParams.query === 'string' ? searchParams.query : undefined;

  const { offices, totalCount } = await getPaginatedOffices({
    query,
    skip,
    take: perPage,
  });

  const serializedOffices = serialize(offices) as unknown as Serialized<
    Office & { lastUpdatedBy?: { name: string } | null; createdBy?: { name: string } | null }
  >[];

  return (
    <div className="max-w-7xl mx-auto py-8">
      <Suspense fallback={<AdminListSkeleton rows={7} />}>
        <OfficeList
          offices={serializedOffices}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
        />
      </Suspense>
    </div>
  );
}
