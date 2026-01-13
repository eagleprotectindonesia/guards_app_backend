import { serialize, getPaginationParams } from '@/lib/utils';
import SiteList from './components/site-list';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getPaginatedSites } from '@/lib/data-access/sites';
import { getAdminSession } from '@/lib/admin-auth';

export const metadata: Metadata = {
  title: 'Sites Management',
};

export const dynamic = 'force-dynamic';

type SitesPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SitesPage(props: SitesPageProps) {
  const session = await getAdminSession();
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);
  const query = searchParams.q as string | undefined;

  const { sites, totalCount } = await getPaginatedSites({
    query,
    skip,
    take: perPage,
  });

  const serializedSites = serialize(sites);

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading sites...</div>}>
        <SiteList
          sites={serializedSites}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          isSuperAdmin={session?.isSuperAdmin}
        />
      </Suspense>
    </div>
  );
}
