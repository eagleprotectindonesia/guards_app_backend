import { getAdminById } from '@/lib/data-access/admins';
import { getAllRoles } from '@/lib/data-access/roles';
import AdminForm from '../../components/admin-form';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { SerializedAdminWithRoleDto, SerializedRoleDto } from '@/types/admins';

export const dynamic = 'force-dynamic';

type EditAdminPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAdminPage(props: EditAdminPageProps) {
  await requirePermission(PERMISSIONS.ADMINS.EDIT);
  const params = await props.params;
  const [admin, roles] = await Promise.all([getAdminById(params.id), getAllRoles()]);

  if (!admin) {
    notFound();
  }

  const serializedAdmin: SerializedAdminWithRoleDto = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    twoFactorEnabled: admin.twoFactorEnabled,
    note: admin.note,
    roleRef: admin.roleRef ? { id: admin.roleRef.id, name: admin.roleRef.name } : null,
    createdAt: admin.createdAt.toISOString(),
    updatedAt: admin.updatedAt.toISOString(),
  };

  const serializedRoles: SerializedRoleDto[] = roles.map(role => ({
    id: role.id,
    name: role.name,
  }));

  return (
    <div className="max-w-6xl mx-auto py-8">
      <AdminForm admin={serializedAdmin} roles={serializedRoles} />
    </div>
  );
}
