import { getAllRoles } from '@/lib/data-access/roles';
import AdminForm from '../components/admin-form';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { SerializedRoleDto } from '@/types/admins';

export const dynamic = 'force-dynamic';

export default async function CreateAdminPage() {
  await requirePermission(PERMISSIONS.ADMINS.CREATE);
  const roles = await getAllRoles();

  const serializedRoles: SerializedRoleDto[] = roles.map(role => ({
    id: role.id,
    name: role.name,
  }));

  return (
    <div className="max-w-6xl mx-auto py-8">
      <AdminForm roles={serializedRoles} />
    </div>
  );
}
