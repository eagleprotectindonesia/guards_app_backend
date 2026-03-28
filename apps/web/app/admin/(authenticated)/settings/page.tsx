import { requirePermission } from '@/lib/admin-auth';
import { getAllSystemSettings, getDefaultOfficeWorkSchedule } from '@repo/database';
import SettingsForm from './components/settings-form';
import { serialize } from '@/lib/server-utils';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requirePermission(PERMISSIONS.SYSTEM.VIEW_SETTINGS);

  const isSuperAdmin = session.isSuperAdmin;
  const [allSettings, defaultOfficeSchedule] = await Promise.all([
    getAllSystemSettings(),
    getDefaultOfficeWorkSchedule(),
  ]);
  const visibleSettings = allSettings.filter(setting => setting.name !== 'DEFAULT_OFFICE_WORK_SCHEDULE_ID');
  const serializedDefaultSchedule = serialize(defaultOfficeSchedule);

  return (
    <div className="max-w-7xl mx-auto">
      <SettingsForm
        settings={serialize(visibleSettings)}
        defaultOfficeSchedule={serializedDefaultSchedule}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
