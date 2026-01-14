import { requirePermission } from '@/lib/admin-auth';
import { getAllSystemSettings } from '@/lib/data-access/settings';
import SettingsForm from './components/settings-form';
import { serialize } from '@/lib/utils';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requirePermission(PERMISSIONS.SYSTEM.VIEW_SETTINGS);

  const isSuperAdmin = session.isSuperAdmin;
  const allSettings = await getAllSystemSettings();
  const serializedSettings = serialize(allSettings);

  return (
    <div className="max-w-7xl mx-auto">
      <SettingsForm settings={serializedSettings} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
