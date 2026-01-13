import { getAllRoles } from '@/lib/data-access/roles';
import { serialize } from '@/lib/utils';
import RoleList from './components/role-list';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const roles = await getAllRoles();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Roles & Permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage administrative roles and their associated system permissions.
          </p>
        </div>
        <Link
          href="/admin/system/roles/create"
          className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30"
        >
          <span className="mr-2 text-lg leading-none">+</span>
          Create New Role
        </Link>
      </div>

      <RoleList roles={serialize(roles)} />
    </div>
  );
}
