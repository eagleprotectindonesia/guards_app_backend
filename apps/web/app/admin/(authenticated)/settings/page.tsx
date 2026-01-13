import { getAdminSession } from '@/lib/admin-auth';
import { getAllSystemSettings } from '@/lib/data-access/settings';
import SettingsForm from './components/settings-form';
import { redirect } from 'next/navigation';
import { serialize } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  const isSuperAdmin = session.isSuperAdmin;
  const allSettings = await getAllSystemSettings();
  const serializedSettings = serialize(allSettings);

  return (
    <div className="max-w-7xl mx-auto">
      <SettingsForm settings={serializedSettings} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
