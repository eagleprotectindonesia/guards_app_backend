import { serialize, getPaginationParams } from '@/lib/server-utils';
import SiteList from './components/site-list';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getPaginatedSites } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { AdminListSkeleton } from '../components/loading/admin-list-skeleton';

export const metadata: Metadata = {
  title: 'Sites Management',
};

export const dynamic = 'force-dynamic';

type SitesPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SitesPage(props: SitesPageProps) {
  await requirePermission(PERMISSIONS.SITES.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);
  const query = searchParams.q as string | undefined;

  const sortBy = (searchParams.sortBy as string) || 'name';
  const sortOrder =
    typeof searchParams.sortOrder === 'string' && ['asc', 'desc'].includes(searchParams.sortOrder)
      ? (searchParams.sortOrder as 'asc' | 'desc')
      : 'asc';
  const validSortFields = ['name', 'clientName', 'status', 'posts'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';

  const { sites, totalCount } = await getPaginatedSites({
    query,
    skip,
    take: perPage,
    sortBy: sortField,
    sortOrder,
  });

  const serializedSites = serialize(sites);

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<AdminListSkeleton rows={7} />}>
        <SiteList
          sites={serializedSites}
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
