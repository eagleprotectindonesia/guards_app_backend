import { getRoleById, getAllPermissions } from '@repo/database';
import { serialize } from '@/lib/server-utils';
import RoleForm from '../../components/role-form';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { AdminNavLink } from '../../../../components/admin-nav-link';

export const dynamic = 'force-dynamic';

type EditRolePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditRolePage(props: EditRolePageProps) {
  await requirePermission(PERMISSIONS.ROLES.EDIT);
  const params = await props.params;
  const [role, allPermissions] = await Promise.all([getRoleById(params.id), getAllPermissions()]);

  if (!role) {
    notFound();
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <AdminNavLink href="/admin/system/roles" className="p-2 hover:bg-muted rounded-full transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </AdminNavLink>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Edit Role</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Modifying settings for <span className="font-bold text-foreground">{`"${role.name}"`}</span>
          </p>
        </div>
      </div>

      <RoleForm role={serialize(role)} allPermissions={serialize(allPermissions)} />
    </div>
  );
}
