import { prisma } from '@/lib/prisma';
import { serialize, getPaginationParams } from '@/lib/utils';
import SiteList from './components/site-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sites Management',
};

export const dynamic = 'force-dynamic';

type SitesPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SitesPage(props: SitesPageProps) {
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);
  const query = searchParams.q as string | undefined;

  const where: Prisma.SiteWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { clientName: { contains: query, mode: 'insensitive' } },
        ],
      }
    : {};

  const [sites, totalCount] = await prisma.$transaction([
    prisma.site.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take: perPage,
      include: {
        lastUpdatedBy: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.site.count({ where }),
  ]);

  const serializedSites = serialize(sites);

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading sites...</div>}>
        <SiteList sites={serializedSites} page={page} perPage={perPage} totalCount={totalCount} />
      </Suspense>
    </div>
  );
}
