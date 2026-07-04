import SiteForm from '../components/site-form';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getSystemSetting } from '@repo/database';

export const dynamic = 'force-dynamic';

export default async function CreateSitePage() {
  await requirePermission(PERMISSIONS.SITES.CREATE);

  const [monitoringSetting, hideEscortSetting] = await Promise.all([
    getSystemSetting('ENABLE_LOCATION_MONITORING'),
    getSystemSetting('HIDE_ESCORT_SITES'),
  ]);
  const isMonitoringEnabled = monitoringSetting?.value === '1';
  const hideEscortSites = hideEscortSetting?.value === '1';

  return (
    <div className="max-w-6xl mx-auto py-8">
      <SiteForm isMonitoringEnabled={isMonitoringEnabled} hideEscortSites={hideEscortSites} />
    </div>
  );
}
