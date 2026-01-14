import { getAllRoles } from '@/lib/data-access/roles';
import { serialize } from '@/lib/utils';
import AdminForm from '../components/admin-form';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function CreateAdminPage() {
  await requirePermission(PERMISSIONS.ADMINS.CREATE);
  const roles = await getAllRoles();

  return (
    <div className="max-w-6xl mx-auto py-8">
      <AdminForm roles={serialize(roles)} />
    </div>
  );
}
