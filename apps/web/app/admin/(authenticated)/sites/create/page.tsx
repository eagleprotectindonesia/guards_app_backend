import SiteForm from '../components/site-form';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getSystemSetting } from '@/lib/data-access/settings';

export const dynamic = 'force-dynamic';

export default async function CreateSitePage() {
  await requirePermission(PERMISSIONS.SITES.CREATE);

  const monitoringSetting = await getSystemSetting('ENABLE_LOCATION_MONITORING');
  const isMonitoringEnabled = monitoringSetting?.value === '1';

  return (
    <div className="max-w-6xl mx-auto py-8">
      <SiteForm isMonitoringEnabled={isMonitoringEnabled} />
    </div>
  );
}
