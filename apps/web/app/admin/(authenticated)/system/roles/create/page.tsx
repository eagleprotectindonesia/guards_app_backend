import { getAllPermissions } from '@/lib/data-access/roles';
import { serialize } from '@/lib/utils';
import RoleForm from '../components/role-form';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function CreateRolePage() {
  await requirePermission(PERMISSIONS.ROLES.CREATE);
  const allPermissions = await getAllPermissions();

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Link href="/admin/system/roles" className="p-2 hover:bg-muted rounded-full transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create New Role</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define a brand new role and configure its permission sets.
          </p>
        </div>
      </div>

      <RoleForm allPermissions={serialize(allPermissions)} />
    </div>
  );
}
