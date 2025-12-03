import { prisma } from '@/lib/prisma';
import SiteList from './components/site-list';

export const dynamic = 'force-dynamic';

export default async function SitesPage() {
  const sites = await prisma.site.findMany({
    orderBy: { name: 'asc' },
  });

  // Serialize dates for Client Component
  const serializedSites = sites.map(site => ({
    ...site,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <SiteList sites={serializedSites} />
    </div>
  );
}
