import { serialize } from '@/lib/server-utils';
import SiteForm from '../../components/site-form';
import { notFound } from 'next/navigation';
import { getSiteByIdWithPosts } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getSystemSetting } from '@repo/database';

export const dynamic = 'force-dynamic';

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.SITES.EDIT);
  const { id } = await params;

  const [site, monitoringSetting, hideEscortSetting] = await Promise.all([
    getSiteByIdWithPosts(id),
    getSystemSetting('ENABLE_LOCATION_MONITORING'),
    getSystemSetting('HIDE_ESCORT_SITES'),
  ]);

  if (!site) {
    notFound();
  }

  const serializedSite = serialize(site);
  const isMonitoringEnabled = monitoringSetting?.value === '1';
  const hideEscortSites = hideEscortSetting?.value === '1';

  return (
    <div className="max-w-6xl mx-auto py-8">
      <SiteForm site={serializedSite} isMonitoringEnabled={isMonitoringEnabled} hideEscortSites={hideEscortSites} />
    </div>
  );
}
