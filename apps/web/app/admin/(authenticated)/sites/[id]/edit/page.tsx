import { serialize } from '@/lib/utils';
import SiteForm from '../../components/site-form';
import { notFound } from 'next/navigation';
import { getSiteById } from '@/lib/data-access/sites';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.SITES.EDIT);
  const { id } = await params;

  const site = await getSiteById(id);

  if (!site) {
    notFound();
  }

  const serializedSite = serialize(site);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <SiteForm site={serializedSite} />
    </div>
  );
}
