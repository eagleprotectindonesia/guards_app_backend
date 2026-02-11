import { getPaginatedAdmins } from '@/lib/data-access/admins';
import { getPaginationParams } from '@/lib/utils';
import AdminList from './components/admin-list';
import { Suspense } from 'react';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { Metadata } from 'next';
import { SerializedAdminWithRoleDto } from '@/types/admins';

export const metadata: Metadata = {
  title: 'Admins Management',
};

export const dynamic = 'force-dynamic';

type AdminsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AdminsPage(props: AdminsPageProps) {
  await requirePermission(PERMISSIONS.ADMINS.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);

  const { admins, totalCount } = await getPaginatedAdmins({
    where: {},
    orderBy: { name: 'asc' },
    skip,
    take: perPage,
  });

  const serializedAdmins: SerializedAdminWithRoleDto[] = admins.map(admin => ({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    twoFactorEnabled: admin.twoFactorEnabled,
    note: admin.note,
    roleRef: admin.roleRef ? { id: admin.roleRef.id, name: admin.roleRef.name } : null,
    createdAt: admin.createdAt.toISOString(),
    updatedAt: admin.updatedAt.toISOString(),
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading admins...</div>}>
        <AdminList
          admins={serializedAdmins}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
        />
      </Suspense>
    </div>
  );
}
